import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://onlycarsclub.com.br";
const FUNCTION_VERSION = "ticket-checkout-v11-modalities";
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
const hasPurchaseAge = (birthDate: string | null) => {
  if (!birthDate) return false;
  const birth = new Date(`${birthDate}T12:00:00Z`);
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayPassed = today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() >= birth.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 18;
};

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
    const { data: buyerProfile, error: buyerProfileError } = await serviceClient.from("profiles")
      .select("birth_date").eq("id", user.id).single();
    if (buyerProfileError || !buyerProfile?.birth_date) {
      throw new Error("Informe sua data de nascimento em Minha conta antes de comprar.");
    }
    if (!hasPurchaseAge(buyerProfile.birth_date)) {
      throw new Error("O ingresso deve ser comprado na conta de um responsável com 18 anos completos ou mais.");
    }
    const body = await request.json().catch(() => ({}));
    const eventSlug = clean(body.event_slug, 80);
    const lotId = clean(body.lot_id, 40);
    const buyerName = clean(body.buyer_name || body.driver_name);
    const buyerTaxId = onlyDigits(body.buyer_tax_id || body.driver_tax_id);
    const buyerPhone = onlyDigits(body.buyer_phone || body.driver_phone);
    const rawTickets = Array.isArray(body.tickets) && body.tickets.length
      ? body.tickets
      : [{
        vehicle_plate: body.vehicle_plate,
        vehicle_make: body.vehicle_make,
        vehicle_model: body.vehicle_model,
        instagram_handle: body.instagram_handle,
        driver_name: body.driver_name,
        driver_tax_id: body.driver_tax_id,
        driver_phone: body.driver_phone,
      }];
    if (rawTickets.length < 1 || rawTickets.length > 10) throw new Error("É possível comprar até 10 ingressos por pagamento.");
    const tickets = rawTickets.map((item: Record<string, unknown>, index: number) => ({
      index: index + 1,
      kind: clean(item?.ticket_kind || "expo",20),
      vehiclePlate: clean(item?.vehicle_plate, 8).replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      vehicleMake: clean(item?.vehicle_make, 60),
      vehicleModel: clean(item?.vehicle_model, 80),
      instagramHandle: clean(item?.instagram_handle, 40) || null,
      driverName: clean(item?.driver_name || buyerName),
      driverTaxId: onlyDigits(item?.driver_tax_id || buyerTaxId),
      driverPhone: onlyDigits(item?.driver_phone || buyerPhone),
      holderIsBuyer: item?.holder_is_buyer !== false,
    }));
    const vehiclePlates = tickets.filter(ticket => ticket.kind !== "carona").map((ticket) => ticket.vehiclePlate);
    const couponCode = clean(body.coupon_code, 30).toUpperCase() || null;

    if (!eventSlug) throw new Error("Evento não informado.");
    if (tickets.some(ticket => ticket.kind !== "carona") && !validUuid(lotId)) throw new Error("Lote inválido.");
    if (!buyerName) throw new Error("Informe o nome completo do comprador.");
    if (buyerTaxId.length !== 11) throw new Error("Informe um CPF válido com 11 números para o comprador.");
    if (buyerPhone.length < 10 || buyerPhone.length > 11) throw new Error("Informe um WhatsApp válido com DDD para o comprador.");
    const invalidTicket = tickets.find((ticket) => ticket.kind !== "carona" && (ticket.vehiclePlate.length !== 7 || !ticket.vehicleMake || !ticket.vehicleModel));
    if (invalidTicket) throw new Error(`Confira placa, marca e modelo do veículo ${invalidTicket.index}.`);
    const invalidHolder = tickets.find((ticket) => !ticket.driverName || ticket.driverTaxId.length !== 11 || ticket.driverPhone.length < 10 || ticket.driverPhone.length > 11);
    if (invalidHolder) throw new Error(`Confira nome, CPF e WhatsApp do titular do ingresso ${invalidHolder.index}.`);
    if (new Set(vehiclePlates).size !== vehiclePlates.length) throw new Error("Cada ingresso precisa ter uma placa diferente.");

    const { data: event, error: eventError } = await serviceClient.from("events")
      .select("id,name,status,regulation_version,sales_end_at").eq("slug", eventSlug).single();
    if (eventError || !event) throw new Error("Evento não encontrado.");
    if (event.status !== "sales_open") throw new Error("As vendas deste evento ainda não estão abertas.");
    if (new Date(event.sales_end_at).getTime() <= Date.now()) throw new Error("As vendas deste evento foram encerradas.");

    const { data: reservation, error: reservationError } = await serviceClient.rpc("service_reserve_typed_tickets", {
      p_user_id:user.id, p_event_slug:eventSlug, p_lot_id:lotId || null,
      p_buyer:{name:buyerName,email:user.email,tax_id:buyerTaxId,phone:buyerPhone},
      p_tickets:tickets.map(ticket => ({ticket_kind:ticket.kind,driver_name:ticket.driverName,driver_tax_id:ticket.driverTaxId,driver_phone:ticket.driverPhone,vehicle_plate:ticket.vehiclePlate,vehicle_make:ticket.vehicleMake,vehicle_model:ticket.vehicleModel,instagram_handle:ticket.instagramHandle})),
      p_coupon_code:couponCode,
      p_expected_subtotal:Number.isInteger(body.expected_subtotal_cents) ? body.expected_subtotal_cents : null,
    });
    if(reservationError || !reservation) throw new Error(reservationError?.message || "Não foi possível reservar os ingressos.");
    const order={id:reservation.order_id};
    createdOrderId=order.id;
    const payableCents=Number(reservation.total_cents);
    const appliedCouponCode=reservation.coupon_code || null;

    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mercadoPagoToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": order.id,
      },
      body: JSON.stringify({
        items: [{
          id: `ticket-${order.id}`,
          title: `${event.name} — ${tickets.length} ingresso(s): ${[...new Set(tickets.map(t => ({expo:"Expo",carona:"Carona Radical",combo:"Expo + Carona"}[t.kind] || t.kind)))].join(", ")}`,
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number((payableCents / 100).toFixed(2)),
        }],
        payer: { email: user.email, name: buyerName, identification: { type: "CPF", number: buyerTaxId } },
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
    return jsonResponse({ order_id: order.id, checkout_url: preference.init_point || preference.sandbox_init_point, coupon_code: appliedCouponCode, total_cents: payableCents, ticket_count: tickets.length });
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
