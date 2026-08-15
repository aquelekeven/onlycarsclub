import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_VERSION = "store-webhook-v2-production";
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "X-Only-Function-Version": FUNCTION_VERSION },
});
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)]
  .map((byte) => byte.toString(16).padStart(2, "0")).join("");
const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};
const validUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function validSignature(request: Request, dataId: string, secret: string) {
  const header = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(header.split(",").map((part) =>
    part.trim().split("=", 2)).filter(([key, value]) => key && value));
  const timestamp = parts.ts || "";
  const received = parts.v1 || "";
  if (!timestamp || !received) return false;
  let manifest = dataId ? `id:${dataId.toLowerCase()};` : "";
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${timestamp};`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const calculated = hex(await crypto.subtle.sign(
    "HMAC", cryptoKey, new TextEncoder().encode(manifest),
  ));
  return safeEqual(calculated, received);
}

const statusMap: Record<string, string> = {
  pending: "pending", in_process: "pending", authorized: "pending",
  approved: "approved", rejected: "rejected", cancelled: "cancelled",
  refunded: "refunded", charged_back: "charged_back",
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ received: false }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const webhookSecret = (Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") || "").trim();
  if (!supabaseUrl || !serviceRoleKey || !accessToken || !webhookSecret) {
    console.error("Secrets obrigatórios ausentes.");
    return respond({ received: false }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const url = new URL(request.url);
  const dataId = String(url.searchParams.get("data.id") || body?.data?.id || "");
  const type = String(url.searchParams.get("type") || body?.type || "");
  if (!await validSignature(request, dataId, webhookSecret)) {
    console.warn("Webhook com assinatura inválida.");
    return respond({ received: false }, 401);
  }
  if (type !== "payment" || !dataId) return respond({ received: true, ignored: true });
  if (body?.live_mode === false) {
    console.warn("Notificação de teste ignorada pela função produtiva.");
    return respond({ received: true, ignored: true, reason: "test_notification" });
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const requestId = request.headers.get("x-request-id") || "";
  const eventId = String(body?.id || requestId || `payment-${dataId}-${body?.action || "updated"}`);
  const { data: existing } = await db.from("webhook_events").select("id,processed_at")
    .eq("provider", "mercado_pago").eq("provider_event_id", eventId).maybeSingle();
  if (existing?.processed_at) return respond({ received: true, duplicate: true });

  let eventRowId = existing?.id || null;
  if (!eventRowId) {
    const { data: created, error } = await db.from("webhook_events").insert({
      provider: "mercado_pago", provider_event_id: eventId,
      event_type: type, payload: body, signature_valid: true,
    }).select("id").single();
    if (error || !created) {
      console.error("Erro ao registrar webhook:", error);
      return respond({ received: false }, 500);
    }
    eventRowId = created.id;
  }

  try {
    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(`Mercado Pago recusou a consulta: ${paymentResponse.status}`);
    const orderId = String(payment.external_reference || "");
    if (!validUuid(orderId)) throw new Error("Pagamento sem referência válida de pedido.");
    const { error } = await db.rpc("process_mercado_pago_payment", {
      p_order_id: orderId,
      p_provider_payment_id: String(payment.id),
      p_status: statusMap[String(payment.status)] || "pending",
      p_payment_method: String(payment.payment_method_id || ""),
      p_installments: Number(payment.installments || 0) || null,
      p_amount_cents: Math.round(Number(payment.transaction_amount || 0) * 100),
      p_currency: String(payment.currency_id || ""),
      p_status_detail: String(payment.status_detail || ""),
      p_approved_at: payment.date_approved || null,
    });
    if (error) throw new Error(error.message);
    await db.from("webhook_events").update({
      processed_at: new Date().toISOString(), error_message: null,
    }).eq("id", eventRowId);
    return respond({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(`[${FUNCTION_VERSION}]`, message);
    await db.from("webhook_events").update({ error_message: message }).eq("id", eventRowId);
    return respond({ received: false, error: "Não foi possível processar a notificação." }, 500);
  }
});
