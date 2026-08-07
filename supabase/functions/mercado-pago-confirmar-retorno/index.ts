import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers:{ ...corsHeaders, "Content-Type":"application/json" }
});

const paymentStatus = (status: string) => ({
  approved:"approved",
  pending:"pending",
  in_process:"pending",
  rejected:"rejected",
  cancelled:"cancelled",
  refunded:"refunded",
  charged_back:"charged_back"
})[status] || "pending";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (request.method !== "POST") return json({ error:"Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
    const authorization = request.headers.get("Authorization") || "";
    if (!supabaseUrl || !anonKey || !serviceKey || !accessToken) throw new Error("Configuração interna incompleta.");
    if (!authorization.startsWith("Bearer ")) return json({ error:"Faça login para confirmar o pagamento." }, 401);

    const authClient = createClient(supabaseUrl, anonKey, { global:{ headers:{ Authorization:authorization } } });
    const { data:{ user }, error:userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error:"Sessão inválida ou expirada." }, 401);

    const body = await request.json().catch(() => ({}));
    const paymentId = String(body?.payment_id || "").trim();
    const orderId = String(body?.order_id || "").trim();
    if (!/^\d+$/.test(paymentId) || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error:"Referência de pagamento inválida." }, 400);

    const admin = createClient(supabaseUrl, serviceKey, { auth:{ persistSession:false } });
    const { data:order, error:orderError } = await admin
      .from("orders")
      .select("id,user_id,order_number,status,total_cents,currency")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error:"Pedido não encontrado para esta conta." }, 404);

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers:{ Authorization:`Bearer ${accessToken}`, Accept:"application/json" }
    });
    const payment = await mpResponse.json().catch(() => ({}));
    if (!mpResponse.ok) return json({ error:"Não foi possível consultar o pagamento no Mercado Pago." }, 502);

    if (String(payment.external_reference || "") !== order.id) return json({ error:"O pagamento não pertence a este pedido." }, 409);
    const amountCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    if (amountCents !== Number(order.total_cents)) return json({ error:"O valor confirmado é diferente do total do pedido." }, 409);
    if (String(payment.currency_id || "BRL") !== String(order.currency || "BRL")) return json({ error:"A moeda do pagamento é inválida." }, 409);

    const mappedStatus = paymentStatus(String(payment.status || ""));
    const paymentUpdate = {
      provider_payment_id:paymentId,
      status:mappedStatus,
      payment_method:payment.payment_method_id || null,
      installments:Number(payment.installments) || null,
      amount_cents:amountCents,
      raw_status_detail:payment.status_detail || null,
      approved_at:payment.date_approved || null
    };
    const { error:paymentError } = await admin.from("payments").update(paymentUpdate).eq("order_id", order.id);
    if (paymentError) throw paymentError;

    if (mappedStatus === "approved" && order.status !== "paid") {
      const { error:updateError } = await admin.from("orders").update({ status:"paid", paid_at:payment.date_approved || new Date().toISOString() }).eq("id", order.id);
      if (updateError) throw updateError;
    }

    await admin.from("webhook_events").upsert({
      provider:"mercado_pago",
      provider_event_id:`return-${paymentId}`,
      event_type:"payment.return_sync",
      payload:payment,
      signature_valid:true,
      processed_at:new Date().toISOString(),
      error_message:null
    }, { onConflict:"provider,provider_event_id" });

    return json({
      confirmed:mappedStatus === "approved",
      order_number:order.order_number,
      payment_status:mappedStatus
    });
  } catch (error) {
    return json({ error:error instanceof Error ? error.message : "Falha ao confirmar o pagamento." }, 500);
  }
});
