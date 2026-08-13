import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://onlycarsclub.com.br";
const cors = { "Access-Control-Allow-Origin":SITE_URL, "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const reply = (body:unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{ ...cors, "Content-Type":"application/json" } });
const clean = (value:unknown, max=120) => String(value || "").trim().slice(0, max);
const digits = (value:unknown) => clean(value).replace(/\D/g, "");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:cors });
  if (request.method !== "POST") return reply({ error:"Método não permitido." }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceKey || !mpToken) return reply({ error:"Serviço temporariamente indisponível." }, 500);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return reply({ error:"Faça login para continuar." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global:{ headers:{ Authorization:authorization } }, auth:{ persistSession:false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth:{ persistSession:false } });
  const { data:{ user } } = await userClient.auth.getUser();
  if (!user?.email) return reply({ error:"Sua sessão expirou. Entre novamente." }, 401);

  let orderId:string | null = null;
  try {
    const body = await request.json();
    const cpf = digits(body.driver_tax_id);
    const phone = digits(body.driver_phone);
    const plate = clean(body.vehicle_plate, 8).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (cpf.length !== 11 || phone.length < 10 || plate.length !== 7) throw new Error("Revise CPF, WhatsApp e placa.");
    const { data:event, error:eventError } = await admin.from("events").select("id,name,status,regulation_version,sales_end_at,capacity,complimentary_capacity").eq("slug", clean(body.event_slug, 80)).single();
    if (eventError || !event || event.status !== "sales_open" || new Date(event.sales_end_at).getTime() <= Date.now()) throw new Error("As vendas deste evento não estão abertas.");
    const { data:lot, error:lotError } = await admin.from("event_lots").select("id,name,price_cents,capacity,active").eq("id", clean(body.lot_id, 40)).eq("event_id", event.id).eq("active", true).single();
    if (lotError || !lot) throw new Error("O lote selecionado não está disponível.");
    const { count:lotUsed } = await admin.from("ticket_orders").select("id", { count:"exact", head:true }).eq("lot_id", lot.id).in("status", ["pending_payment","paid"]);
    if (Number(lotUsed || 0) >= lot.capacity) throw new Error("Este lote está esgotado.");
    const { data:existingPlate } = await admin.from("tickets").select("id").eq("event_id", event.id).eq("vehicle_plate", plate).in("status", ["reserved","active","checked_in"]).maybeSingle();
    if (existingPlate) throw new Error("Esta placa já possui um ingresso ativo para o evento.");
    const driverName = clean(body.driver_name);
    const make = clean(body.vehicle_make, 60);
    const model = clean(body.vehicle_model, 80);
    if (!driverName) throw new Error("Informe o nome completo do motorista.");
    if (!make) throw new Error("Informe a marca do veículo.");
    if (!model) throw new Error("Informe o modelo do veículo.");
    const { data:order, error:orderError } = await admin.from("ticket_orders").insert({ event_id:event.id, lot_id:lot.id, user_id:user.id, customer_name:driverName, customer_email:user.email, customer_phone:phone, customer_tax_id:cpf, quantity:1, unit_price_cents:lot.price_cents, expires_at:new Date(Date.now()+30*60*1000).toISOString(), regulation_version:event.regulation_version, regulation_accepted_at:new Date().toISOString(), metadata:{ vehicle_plate:plate } }).select("id").single();
    if (orderError || !order) throw new Error(orderError?.message || "Não foi possível reservar o ingresso.");
    orderId = order.id;
    const token = crypto.randomUUID() + crypto.randomUUID();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))).map((byte)=>byte.toString(16).padStart(2,"0")).join("");
    const { error:ticketError } = await admin.from("tickets").insert({ order_id:order.id, event_id:event.id, owner_user_id:user.id, qr_token_hash:hash, status:"reserved", driver_name:driverName, driver_tax_id:cpf, driver_phone:phone, vehicle_plate:plate, vehicle_make:make, vehicle_model:model, instagram_handle:clean(body.instagram_handle,40)||null });
    if (ticketError) throw new Error(ticketError.message);
    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", { method:"POST", headers:{ Authorization:`Bearer ${mpToken}`, "Content-Type":"application/json", "X-Idempotency-Key":order.id }, body:JSON.stringify({ items:[{ id:`ticket-${lot.id}`, title:`${event.name} — ${lot.name}`, quantity:1, currency_id:"BRL", unit_price:Number((lot.price_cents/100).toFixed(2)) }], payer:{ email:user.email, name:driverName, identification:{ type:"CPF", number:cpf } }, external_reference:`ticket:${order.id}`, notification_url:`${supabaseUrl}/functions/v1/mercado-pago-ingresso-webhook`, back_urls:{ success:`${SITE_URL}/ingresso-retorno.html?status=success&order=${order.id}`, pending:`${SITE_URL}/ingresso-retorno.html?status=pending&order=${order.id}`, failure:`${SITE_URL}/ingresso-retorno.html?status=failure&order=${order.id}` }, auto_return:"approved", statement_descriptor:"ONLY CARS" }) });
    const preference = await preferenceResponse.json();
    if (!preferenceResponse.ok || !preference?.id) throw new Error(preference?.message || "O Mercado Pago não criou o pagamento.");
    await admin.from("ticket_orders").update({ provider_preference_id:String(preference.id) }).eq("id", order.id);
    return reply({ order_id:order.id, checkout_url:preference.sandbox_init_point || preference.init_point });
  } catch (error) {
    if (orderId) { await admin.from("tickets").delete().eq("order_id", orderId); await admin.from("ticket_orders").delete().eq("id", orderId); }
    console.error(error);
    return reply({ error:error instanceof Error ? error.message : "Não foi possível iniciar a compra." }, 400);
  }
});
