import { createClient } from "npm:@supabase/supabase-js@2";

const FUNCTION_VERSION = "ticket-webhook-v5-production";
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

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ received: false }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceRoleKey || !accessToken || !webhookSecret) {
    console.error("Secrets obrigatórios ausentes.");
    return respond({ received: false }, 500);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const paymentId = String(url.searchParams.get("data.id") || body?.data?.id || "");
    const type = String(url.searchParams.get("type") || body?.type || "");
    if (type !== "payment" || !paymentId) return respond({ received: true, ignored: true });
    if (!await validSignature(request, paymentId, webhookSecret)) {
      console.warn("Webhook de ingresso com assinatura inválida.");
      return respond({ received: false }, 401);
    }

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
    );
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(`Mercado Pago recusou a consulta: ${paymentResponse.status}`);
    const reference = String(payment.external_reference || "");
    if (!reference.startsWith("ticket:")) return respond({ received: true, ignored: true });
    const orderId = reference.slice(7);
    if (!validUuid(orderId)) throw new Error("Referência inválida de pedido de ingresso.");

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error } = await db.from("ticket_orders")
      .select("id,payable_cents,status").eq("id", orderId).single();
    if (error || !order) throw new Error("Pedido de ingresso não encontrado.");
    const amountCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    if (amountCents !== Number(order.payable_cents)) throw new Error("Valor do pagamento diferente do ingresso.");

    const rawStatus = String(payment.status || "pending");
    if (order.status === "cancelled") {
      if (rawStatus !== "approved") {
        return respond({ received: true, ignored: true, reason: "cancelled_order" });
      }
      const refundResponse = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `ticket-cancelled-${order.id}`,
          },
          body: "{}",
        },
      );
      if (!refundResponse.ok) throw new Error(`Não foi possível estornar pagamento tardio: ${refundResponse.status}`);
      const { error: refundUpdateError } = await db.from("ticket_orders").update({
        status: "refunded",
        payment_status: "refunded",
        provider_payment_id: String(payment.id),
        payment_status_detail: "refunded_after_customer_cancellation",
      }).eq("id", order.id);
      if (refundUpdateError) throw new Error(refundUpdateError.message);
      await db.from("tickets").update({ status: "refunded" }).eq("order_id", order.id);
      return respond({ received: true, processed: true, refunded: true });
    }
    const approved = rawStatus === "approved";
    const orderStatus = approved ? "paid"
      : rawStatus === "cancelled" ? "cancelled"
      : rawStatus === "refunded" ? "refunded" : "pending_payment";
    const paymentStatus = approved ? "approved"
      : rawStatus === "rejected" ? "rejected"
      : rawStatus === "cancelled" ? "cancelled"
      : rawStatus === "refunded" ? "refunded" : "pending";
    const { error: updateError } = await db.from("ticket_orders").update({
      status: orderStatus,
      provider_payment_id: String(payment.id),
      payment_method: String(payment.payment_method_id || ""),
      payment_status: paymentStatus,
      payment_status_detail: String(payment.status_detail || ""),
      paid_at: approved ? (payment.date_approved || new Date().toISOString()) : null,
    }).eq("id", order.id);
    if (updateError) throw new Error(updateError.message);
    if (approved) {
      const { error: ticketError } = await db.from("tickets")
        .update({ status: "active" }).eq("order_id", order.id);
      if (ticketError) throw new Error(ticketError.message);
    }
    return respond({ received: true, processed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(`[${FUNCTION_VERSION}]`, message);
    return respond({ received: false, error: "Não foi possível processar a notificação." }, 500);
  }
});
