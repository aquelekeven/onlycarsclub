import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://onlycarsclub.com.br",
  "https://www.onlycarsclub.com.br",
  "http://localhost:3000",
  "http://localhost:5173",
]);
const USER_AGENT = "Only Cars Club (contato@onlycarsclub.com.br)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVOICE_KEY = /^\d{44}$/;

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Configuração obrigatória ausente: ${name}.`);
  return value;
};
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const money = (cents: unknown) => Number((Number(cents || 0) / 100).toFixed(2));
const originAllowed = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
};
const headers = (request: Request) => {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://onlycarsclub.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
};
const respond = (request: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(request) });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return originAllowed(request)
      ? new Response(null, { status: 204, headers: headers(request) })
      : respond(request, { error: "Origem não permitida." }, 403);
  }
  if (request.method !== "POST") return respond(request, { error: "Método não permitido." }, 405);
  if (!originAllowed(request)) return respond(request, { error: "Origem não permitida." }, 403);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) return respond(request, { error: "Faça login para continuar." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return respond(request, { error: "Sessão inválida ou expirada." }, 401);
    const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return respond(request, { error: "Acesso restrito a administradores." }, 403);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "status");
    const orderId = String(body?.order_id || "");
    if (!UUID.test(orderId)) return respond(request, { error: "Pedido inválido." }, 400);

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id,order_number,status,delivery_method,customer_name,customer_email,customer_phone,customer_tax_id,subtotal_cents,shipping_cents,total_cents,shipping_address,shipping_quote,order_items(product_name,quantity,unit_price_cents)")
      .eq("id", orderId).maybeSingle();
    if (orderError || !order) return respond(request, { error: "Pedido não encontrado." }, 404);
    if (order.status !== "paid") return respond(request, { error: "A etiqueta só pode ser preparada após a aprovação do pagamento." }, 409);
    if (order.delivery_method !== "shipping") return respond(request, { error: "Este pedido não utiliza envio para endereço." }, 409);

    let { data: shipment } = await adminClient.from("shipments").select("*").eq("order_id", orderId).maybeSingle();
    const baseUrl = requiredEnv("MELHOR_ENVIO_BASE_URL").replace(/\/+$/, "");
    const environment = baseUrl.includes("sandbox") ? "Sandbox" : "Produção";
    const { data: fiscal } = await adminClient.from("order_fiscal_documents")
      .select("access_key").eq("order_id", orderId).maybeSingle();
    const fiscalInvoiceKey = digits(fiscal?.access_key);
    const sandboxInvoiceKey = environment === "Sandbox"
      ? digits(Deno.env.get("MELHOR_ENVIO_SANDBOX_INVOICE_KEY"))
      : "";
    const sandboxTestMode = !INVOICE_KEY.test(fiscalInvoiceKey) && environment === "Sandbox";
    const invoiceKey = sandboxTestMode ? sandboxInvoiceKey : fiscalInvoiceKey;
    if (!INVOICE_KEY.test(invoiceKey)) {
      return respond(request, {
        error: environment === "Sandbox"
          ? "Configure uma chave válida de NF-e modelo 55 no secret MELHOR_ENVIO_SANDBOX_INVOICE_KEY para o teste de homologação."
          : "Registre a NF-e real da Only antes de preparar a etiqueta.",
      }, 409);
    }
    const clientId = requiredEnv("MELHOR_ENVIO_CLIENT_ID");
    const clientSecret = requiredEnv("MELHOR_ENVIO_CLIENT_SECRET");
    const redirectUri = requiredEnv("MELHOR_ENVIO_REDIRECT_URI");
    const { data: storedToken, error: tokenError } = await adminClient.from("melhor_envio_oauth_tokens")
      .select("access_token,refresh_token,token_type,expires_at,scope").eq("id", 1).maybeSingle();
    if (tokenError || !storedToken?.access_token) return respond(request, { error: "Integração com o Melhor Envio não autorizada." }, 503);
    const requiredScopes = ["cart-write", "orders-read", "shipping-checkout", "shipping-generate", "shipping-print"];
    const grantedScopes = new Set(String(storedToken.scope || "").split(/[\s,]+/).filter(Boolean));
    const missingScopes = storedToken.scope ? requiredScopes.filter((scope) => !grantedScopes.has(scope)) : [];
    if (missingScopes.length) return respond(request, { error: `Reautorize o Melhor Envio com as permissões: ${missingScopes.join(", ")}.` }, 409);

    const updateToken = async () => {
      if (!storedToken.refresh_token) throw new Error("O token do Melhor Envio precisa ser autorizado novamente.");
      const response = await fetch(`${baseUrl}/oauth/token`, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify({ grant_type: "refresh_token", refresh_token: storedToken.refresh_token, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.access_token) throw new Error("Não foi possível renovar a autorização do Melhor Envio.");
      const expiresAt = Number.isFinite(Number(data.expires_in)) ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : null;
      await adminClient.from("melhor_envio_oauth_tokens").update({
        access_token: data.access_token, refresh_token: data.refresh_token || storedToken.refresh_token,
        token_type: data.token_type || storedToken.token_type || "Bearer", expires_at: expiresAt,
        scope: data.scope || storedToken.scope, updated_at: new Date().toISOString(),
      }).eq("id", 1);
      return String(data.access_token);
    };
    let accessToken = storedToken.access_token;
    if (!storedToken.expires_at || new Date(storedToken.expires_at).getTime() <= Date.now() + 300000) accessToken = await updateToken();
    const api = async (path: string, init: RequestInit = {}) => {
      const call = (token: string) => fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT, ...(init.headers || {}) } });
      let response = await call(accessToken);
      if (response.status === 401) { accessToken = await updateToken(); response = await call(accessToken); }
      const text = await response.text();
      let data: any = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!response.ok) {
        const detail = data?.message || data?.error || (data?.errors && JSON.stringify(data.errors)) || `Resposta ${response.status} do Melhor Envio.`;
        throw new Error(String(detail));
      }
      return data;
    };

    const saveShipment = async (changes: Record<string, unknown>) => {
      const payload = { order_id: orderId, provider: "melhor_envio", service_id: String(order.shipping_quote?.service_id || ""), service_name: order.shipping_quote?.service_name || null, carrier_name: order.shipping_quote?.company_name || null, price_cents: Number(order.shipping_cents || 0), delivery_days: Number(order.shipping_quote?.delivery_days || 0) || null, ...changes };
      const { data, error } = await adminClient.from("shipments").upsert(payload, { onConflict: "order_id" }).select("*").single();
      if (error) throw new Error(error.message); shipment = data; return data;
    };
    const audit = async (event: string, after: unknown) => {
      await adminClient.from("admin_audit_log").insert({ actor_user_id: user.id, action: event, entity_type: "order", entity_id: orderId, after_data: after });
    };

    if (action === "status") return respond(request, { shipment });

    if (action === "prepare") {
      if (shipment?.cart_item_id) return respond(request, { prepared: true, reused: true, shipment });
      const address = order.shipping_address || {};
      const pkg = order.shipping_quote?.package || {};
      const service = Number(order.shipping_quote?.service_id);
      if (!Number.isInteger(service) || service <= 0) throw new Error("O serviço escolhido no checkout é inválido.");
      const requiredAddress = [address.recipient_name, address.postal_code, address.street, address.number, address.neighborhood, address.city, address.state];
      if (requiredAddress.some((value) => !String(value || "").trim())) throw new Error("O endereço do destinatário está incompleto.");
      const weightKg = Number(pkg.weight_grams) / 1000;
      if (![pkg.height, pkg.width, pkg.length, weightKg].every((value) => Number(value) > 0)) throw new Error("Peso ou embalagem do pedido estão incompletos.");

      const cartPayload = {
        service,
        from: {
          name: requiredEnv("MELHOR_ENVIO_SENDER_NAME"), email: requiredEnv("MELHOR_ENVIO_SENDER_EMAIL"),
          phone: digits(requiredEnv("MELHOR_ENVIO_SENDER_PHONE")), document: "",
          company_document: digits(requiredEnv("MELHOR_ENVIO_SENDER_CNPJ")),
          state_register: digits(requiredEnv("MELHOR_ENVIO_SENDER_IE")),
          economic_activity_code: digits(requiredEnv("MELHOR_ENVIO_SENDER_CNAE")),
          address: requiredEnv("MELHOR_ENVIO_SENDER_STREET"), complement: Deno.env.get("MELHOR_ENVIO_SENDER_COMPLEMENT") || "",
          number: requiredEnv("MELHOR_ENVIO_SENDER_NUMBER"), district: requiredEnv("MELHOR_ENVIO_SENDER_DISTRICT"),
          city: requiredEnv("MELHOR_ENVIO_SENDER_CITY"), postal_code: digits(requiredEnv("MELHOR_ENVIO_ORIGIN_POSTAL_CODE")), state_abbr: requiredEnv("MELHOR_ENVIO_SENDER_STATE").toUpperCase(),
        },
        to: {
          name: String(address.recipient_name), email: String(order.customer_email), phone: digits(order.customer_phone),
          document: digits(order.customer_tax_id), state_register: "ISENTO", address: String(address.street),
          complement: String(address.complement || ""), number: String(address.number), district: String(address.neighborhood),
          city: String(address.city), postal_code: digits(address.postal_code), country_id: "BR", state_abbr: String(address.state).toUpperCase(),
        },
        products: (order.order_items || []).map((item: any) => ({ name: String(item.product_name).slice(0, 255), quantity: Number(item.quantity), unitary_value: money(item.unit_price_cents) })),
        volumes: [{ height: Number(pkg.height), width: Number(pkg.width), length: Number(pkg.length), weight: Number(weightKg.toFixed(3)) }],
        options: { platform: "Only Cars Club", reminder: order.order_number, insurance_value: money(order.subtotal_cents), receipt: false, own_hand: false, reverse: false, invoice: { key: invoiceKey }, tags: [{ tag: order.order_number, url: `https://onlycarsclub.com.br/admin.html?order=${orderId}` }] },
      };
      const cart = await api("/api/v2/me/cart", { method: "POST", body: JSON.stringify(cartPayload) });
      const cartId = String(cart?.id || "");
      if (!cartId) throw new Error("O Melhor Envio não retornou o identificador da etiqueta.");
      const actualPriceCents = Math.round(Number(cart?.price || cart?.custom_price || order.shipping_cents / 100) * 100);
      const saved = await saveShipment({ cart_item_id: cartId, provider_order_id: cartId, status: "waiting_label", price_cents: actualPriceCents, last_error: null, provider_payload: { environment, sandbox_test: sandboxTestMode, cart: { id: cartId, price: actualPriceCents, status: cart?.status || null } } });
      await audit("shipment.label.prepare", { cart_item_id: cartId, price_cents: actualPriceCents });
      return respond(request, { prepared: true, shipment: saved });
    }

    if (action !== "purchase") return respond(request, { error: "Ação inválida." }, 400);
    if (!body?.confirm_charge) return respond(request, { error: "Confirme explicitamente a cobrança da etiqueta." }, 400);
    if (!shipment?.cart_item_id) return respond(request, { error: "Prepare a etiqueta antes de confirmar a compra." }, 409);
    const shipmentId = String(shipment.cart_item_id);
    let changes: Record<string, unknown> = {};
    if (!shipment.checkout_completed_at) {
      const checkout = await api("/api/v2/me/shipment/checkout", { method: "POST", body: JSON.stringify({ orders: [shipmentId] }) });
      changes = { ...changes, checkout_completed_at: new Date().toISOString(), provider_payload: { ...(shipment.provider_payload || {}), checkout } };
      shipment = await saveShipment(changes);
      await audit("shipment.label.purchase", { cart_item_id: shipmentId });
    }
    if (!shipment.generated_at) {
      const generated = await api("/api/v2/me/shipment/generate", { method: "POST", body: JSON.stringify({ orders: [shipmentId] }) });
      const generatedAt = new Date();
      shipment = await saveShipment({ generated_at: generatedAt.toISOString(), label_expires_at: new Date(generatedAt.getTime() + 20 * 86400000).toISOString(), status: "label_created", provider_payload: { ...(shipment.provider_payload || {}), generated }, last_error: null });
      await audit("shipment.label.generate", { cart_item_id: shipmentId });
    }
    const printed = await api("/api/v2/me/shipment/print", { method: "POST", body: JSON.stringify({ mode: "public", orders: [shipmentId] }) });
    const labelUrl = typeof printed === "string" ? printed : String(printed?.url || printed?.link || "");
    const detail = await api(`/api/v2/me/orders/${encodeURIComponent(shipmentId)}`).catch(() => null);
    const trackingCode = detail?.tracking || detail?.tracking_code || detail?.protocol || null;
    const trackingUrl = trackingCode ? `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(String(trackingCode))}` : null;
    const saved = await saveShipment({ provider_order_id: shipmentId, label_url: labelUrl || shipment.label_url, tracking_code: trackingCode || shipment.tracking_code, tracking_url: trackingUrl || shipment.tracking_url, status: "label_created", last_error: null, provider_payload: { ...(shipment.provider_payload || {}), print: printed, order_status: detail?.status || null } });
    await audit("shipment.label.print", { cart_item_id: shipmentId, label_url: Boolean(saved.label_url), tracking_code: saved.tracking_code });
    return respond(request, { purchased: true, generated: true, shipment: saved });
  } catch (error) {
    console.error("Melhor Envio label error:", error);
    return respond(request, { error: error instanceof Error ? error.message : "Não foi possível processar a etiqueta." }, 400);
  }
});
