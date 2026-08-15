import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://onlycarsclub.com.br";
const FUNCTION_VERSION = "order-actions-v2-production";
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "X-Only-Function-Version": FUNCTION_VERSION },
});
const validUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const productionCheckoutUrl = (preference: Record<string, unknown>) => {
  const value = String(preference?.init_point || "").trim();
  if (!value) throw new Error("O link produtivo deste pagamento não está disponível.");
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || host.startsWith("sandbox.") ||
    !(host === "mercadopago.com.br" || host.endsWith(".mercadopago.com.br"))) {
    throw new Error("O Mercado Pago retornou um endereço de pagamento inválido.");
  }
  return url.href;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !mercadoPagoToken) {
    return respond({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return respond({ error: "Faça login para continuar." }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return respond({ error: "Sua sessão expirou. Entre novamente." }, 401);

  const findApprovedPayment = async (orderId: string) => {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=10`,
      { headers: { Authorization: `Bearer ${mercadoPagoToken}`, Accept: "application/json" } },
    );
    if (!response.ok) throw new Error("Não foi possível conferir o pagamento no Mercado Pago.");
    const data = await response.json();
    const payments = Array.isArray(data?.results) ? data.results : [];
    return payments.find((payment: Record<string, unknown>) => payment.status === "approved") || null;
  };

  const synchronizeApprovedPayment = async (orderId: string, payment: Record<string, unknown>) => {
    const { error } = await serviceClient.rpc("process_mercado_pago_payment", {
      p_order_id: orderId,
      p_provider_payment_id: String(payment.id),
      p_status: "approved",
      p_payment_method: String(payment.payment_method_id || ""),
      p_installments: Number(payment.installments || 0) || null,
      p_amount_cents: Math.round(Number(payment.transaction_amount || 0) * 100),
      p_currency: String(payment.currency_id || ""),
      p_status_detail: String(payment.status_detail || ""),
      p_approved_at: payment.date_approved || null,
    });
    if (error) throw new Error(error.message);
  };

  const loadOrder = async (orderId: string) => {
    const { data, error } = await serviceClient.from("orders")
      .select("id,order_number,user_id,status,expires_at")
      .eq("id", orderId).eq("user_id", user.id).single();
    if (error || !data) throw new Error("Pedido não encontrado.");
    return data;
  };

  const cancelOrder = async (orderId: string, reason: "customer_cancelled" | "expired") => {
    const approvedPayment = await findApprovedPayment(orderId);
    if (approvedPayment) {
      await synchronizeApprovedPayment(orderId, approvedPayment);
      return { cancelled: false, paid: true };
    }
    const { data, error } = await serviceClient.rpc("cancel_checkout_order", {
      p_order_id: orderId, p_user_id: user.id, p_reason: reason,
    });
    if (error) throw new Error(error.message);
    return { cancelled: true, paid: false, order: data };
  };

  try {
    const payload = await request.json().catch(() => ({}));
    const action = String(payload?.action || "");
    const orderId = String(payload?.order_id || "");

    if (action === "cleanup") {
      const { data: expiredOrders, error } = await serviceClient.from("orders").select("id")
        .eq("user_id", user.id).eq("status", "pending_payment")
        .lte("expires_at", new Date().toISOString()).limit(20);
      if (error) throw new Error(error.message);
      let cancelled = 0;
      let paid = 0;
      for (const order of expiredOrders || []) {
        const result = await cancelOrder(order.id, "expired");
        if (result.cancelled) cancelled += 1;
        if (result.paid) paid += 1;
      }
      return respond({ cleaned: true, cancelled, paid });
    }

    if (!validUuid(orderId)) throw new Error("Pedido inválido.");
    const order = await loadOrder(orderId);

    if (action === "cancel") {
      if (order.status === "paid") return respond({ error: "Pedido pago não pode ser cancelado diretamente." }, 409);
      if (order.status === "cancelled") return respond({ cancelled: true, already_cancelled: true });
      const result = await cancelOrder(orderId, "customer_cancelled");
      if (result.paid) return respond({
        error: "O pagamento já foi aprovado e o pedido não pode ser cancelado.", paid: true,
      }, 409);
      return respond(result);
    }

    if (action === "resume") {
      if (order.status !== "pending_payment") return respond({
        error: order.status === "paid" ? "Este pedido já foi pago." : "Este pedido não está mais disponível para pagamento.",
      }, 409);
      if (order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
        const result = await cancelOrder(orderId, "expired");
        if (result.paid) return respond({ error: "O pagamento deste pedido já foi aprovado.", paid: true }, 409);
        return respond({ error: "O prazo para pagamento expirou. Faça um novo pedido.", expired: true }, 410);
      }
      const { data: payment, error: paymentError } = await serviceClient.from("payments")
        .select("provider_preference_id").eq("order_id", orderId)
        .order("created_at", { ascending: false }).limit(1).single();
      if (paymentError || !payment?.provider_preference_id) {
        throw new Error("O link de pagamento deste pedido não está disponível.");
      }
      const preferenceResponse = await fetch(
        `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(payment.provider_preference_id)}`,
        { headers: { Authorization: `Bearer ${mercadoPagoToken}`, Accept: "application/json" } },
      );
      const preference = await preferenceResponse.json();
      if (!preferenceResponse.ok) throw new Error("Não foi possível recuperar o pagamento.");
      return respond({ resumed: true, checkout_url: productionCheckoutUrl(preference) });
    }
    return respond({ error: "Ação inválida." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível processar o pedido.";
    console.error(`[${FUNCTION_VERSION}]`, message);
    return respond({ error: message }, 400);
  }
});
