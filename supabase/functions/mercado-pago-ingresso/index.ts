import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://onlycarsclub.com.br";
const FUNCTION_VERSION = "ticket-checkout-v5-production";
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...body, function_version: FUNCTION_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "X-Only-Function-Version": FUNCTION_VERSION },
  });
const clean = (value: unknown, max = 120) => String(value || "").trim().slice(0, max);
const onlyDigits = (value: unknown) => clean(value).replace(/\D/g, "");
const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = async (value: string) => Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
).map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);
  console.log(`Iniciando ${FUNCTION_VERSION}`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !mercadoPagoToken) {
    console.error("Secrets obrigatórios ausentes.");
    return jsonResponse({ error: "Serviço temporariamente indisponível." }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Faça login para continuar." }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user?.email) {
    return jsonResponse({ error: "Sua sessão expirou. Entre novamente para continuar." }, 401);
  }

  let createdOrderId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const eventSlug = clean(body.event_slug, 80);
    const lotId = clean(body.lot_id, 40);
    const driverName = clean(body.driver_name);
    const driverTaxId = onlyDigits(body.driver_tax_id);
    const driverPhone = onlyDigits(body.driver_phone);
    const vehiclePlate = clean(body.vehicle_plate, 8).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const vehicleMake = clean(body.vehicle_make, 60);
    const vehicleModel = clean(body.vehicle_model, 80);
    const instagramHandle = clean(body.instagram_handle, 40) || null;

    if (!eventSlug) throw new Error("Evento não informado.");
    if (!validUuid(lotId)) throw new Error("Lote inválido.");
    if (!driverName) throw new Error("Informe o nome completo do motorista.");
    if (driverTaxId.length !== 11) throw new Error("Informe um CPF válido com 11 números.");
    if (driverPhone.length < 10 || driverPhone.length > 11) throw new Error("Informe um WhatsApp válido com DDD.");
    if (vehiclePlate.length !== 7) throw new Error("Informe uma placa válida com 7 caracteres.");
    if (!vehicleMake) throw new Error("Informe a marca do veículo.");
    if (!vehicleModel) throw new Error("Informe o modelo do veículo.");

    const { data: event, error: eventError } = await serviceClient.from("events")
      .select("id,name,status,regulation_version,sales_end_at").eq("slug", eventSlug).single();
    if (eventError || !event) throw new Error("Evento não encontrado.");
    if (event.status !== "sales_open") throw new Error("As vendas deste evento ainda não estão abertas.");
    if (new Date(event.sales_end_at).getTime() <= Date.now()) throw new Error("As vendas deste evento foram encerradas.");

    const { data: lot, error: lotError } = await serviceClient.from("event_lots")
      .select("id,name,price_cents,capacity,active").eq("id", lotId).eq("event_id", event.id).eq("active", true).single();
    if (lotError || !lot) throw new Error("O lote selecionado não está disponível.");

    const { count: occupied, error: countError } = await serviceClient.from("ticket_orders")
      .select("id", { count: "exact", head: true }).eq("lot_id", lot.id).in("status", ["pending_payment", "paid"]);
    if (countError) throw new Error("Não foi possível conferir as vagas do lote.");
    if (Number(occupied || 0) >= Number(lot.capacity)) throw new Error("Este lote está esgotado.");

    const { data: existingPlate, error: plateError } = await serviceClient.from("tickets")
      .select("id").eq("event_id", event.id).eq("vehicle_plate", vehiclePlate)
      .in("status", ["reserved", "active", "checked_in"]).maybeSingle();
    if (plateError) throw new Error("Não foi possível verificar a placa.");
    if (existingPlate) throw new Error("Esta placa já possui um ingresso ativo para o evento.");

    const { data: order, error: orderError } = await serviceClient.from("ticket_orders").insert({
      event_id: event.id,
      lot_id: lot.id,
      user_id: user.id,
      customer_name: driverName,
      customer_email: user.email,
      customer_phone: driverPhone,
      customer_tax_id: driverTaxId,
      quantity: 1,
      unit_price_cents: lot.price_cents,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      regulation_version: event.regulation_version,
      regulation_accepted_at: new Date().toISOString(),
      metadata: { vehicle_plate: vehiclePlate },
    }).select("id").single();
    if (orderError || !order) {
      console.error("Erro ao criar pedido:", orderError);
      throw new Error(orderError?.message || "Não foi possível reservar o ingresso.");
    }
    createdOrderId = order.id;

    const qrToken = crypto.randomUUID() + crypto.randomUUID();
    const qrTokenHash = await sha256(qrToken);
    const { error: ticketError } = await serviceClient.from("tickets").insert({
      order_id: order.id,
      event_id: event.id,
      owner_user_id: user.id,
      qr_token: qrToken,
      qr_token_hash: qrTokenHash,
      status: "reserved",
      driver_name: driverName,
      driver_tax_id: driverTaxId,
      driver_phone: driverPhone,
      vehicle_plate: vehiclePlate,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      instagram_handle: instagramHandle,
    });
    if (ticketError) {
      console.error("Erro ao criar ingresso:", ticketError);
      throw new Error(ticketError.message || "Não foi possível gerar o ingresso.");
    }

    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mercadoPagoToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": order.id,
      },
      body: JSON.stringify({
        items: [{
          id: `ticket-${lot.id}`,
          title: `${event.name} — ${lot.name}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number((Number(lot.price_cents) / 100).toFixed(2)),
        }],
        payer: { email: user.email, name: driverName, identification: { type: "CPF", number: driverTaxId } },
        external_reference: `ticket:${order.id}`,
        notification_url: `${supabaseUrl}/functions/v1/mercado-pago-ingresso-webhook`,
        back_urls: {
          success: `${SITE_URL}/ingresso-retorno.html?status=success&order=${order.id}`,
          pending: `${SITE_URL}/ingresso-retorno.html?status=pending&order=${order.id}`,
          failure: `${SITE_URL}/ingresso-retorno.html?status=failure&order=${order.id}`,
        },
        auto_return: "approved",
        statement_descriptor: "ONLY CARS",
      }),
    });
    const preference = await preferenceResponse.json();
    if (!preferenceResponse.ok || !preference?.id) {
      console.error("Erro do Mercado Pago:", preference);
      throw new Error(preference?.message || "O Mercado Pago não criou o pagamento.");
    }

    const { error: updateError } = await serviceClient.from("ticket_orders")
      .update({ provider_preference_id: String(preference.id) }).eq("id", order.id);
    if (updateError) throw new Error("O pagamento foi criado, mas não foi possível salvar sua identificação.");
    return jsonResponse({ order_id: order.id, checkout_url: preference.init_point || preference.sandbox_init_point });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível iniciar a compra.";
    console.error(`[${FUNCTION_VERSION}]`, message);
    if (createdOrderId) {
      await serviceClient.from("tickets").delete().eq("order_id", createdOrderId);
      await serviceClient.from("ticket_orders").delete().eq("id", createdOrderId);
    }
    return jsonResponse({ error: message }, 400);
  }
});
