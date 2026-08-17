import { createClient } from "npm:@supabase/supabase-js@2";
const ORIGINS=new Set(["https://onlycarsclub.com.br","https://www.onlycarsclub.com.br","http://localhost:3000","http://localhost:5173"]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION="ticket-cancel-v1";
const responseHeaders=(request:Request)=>{const origin=request.headers.get("origin");return{"Access-Control-Allow-Origin":origin&&ORIGINS.has(origin)?origin:"https://onlycarsclub.com.br","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin","X-Only-Function-Version":VERSION};};
const respond=(request:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:responseHeaders(request)});
Deno.serve(async(request)=>{
  const origin=request.headers.get("origin");
  if(request.method==="OPTIONS")return !origin||ORIGINS.has(origin)?new Response(null,{status:204,headers:responseHeaders(request)}):respond(request,{error:"Origem não permitida."},403);
  if(request.method!=="POST")return respond(request,{error:"Método não permitido."},405);
  if(origin&&!ORIGINS.has(origin))return respond(request,{error:"Origem não permitida."},403);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL"),anonKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),mpToken=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if(!supabaseUrl||!anonKey||!serviceKey||!mpToken)throw new Error("Configuração produtiva incompleta.");
    const authorization=request.headers.get("authorization")||"";
    if(!authorization.toLowerCase().startsWith("bearer "))return respond(request,{error:"Faça login para continuar."},401);
    const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const{data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return respond(request,{error:"Sessão inválida ou expirada."},401);
    const body=await request.json().catch(()=>({})),orderId=String(body?.order_id||"");
    if(!UUID.test(orderId))return respond(request,{error:"Reserva inválida."},400);
    const{data:order,error:orderError}=await admin.from("ticket_orders").select("id,user_id,status,provider_preference_id").eq("id",orderId).eq("user_id",user.id).maybeSingle();
    if(orderError||!order)return respond(request,{error:"Reserva não encontrada."},404);
    if(order.status!=="pending_payment")return respond(request,{error:"Somente reservas aguardando pagamento podem ser canceladas."},409);
    if(order.provider_preference_id){
      const mp=await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(order.provider_preference_id)}`,{method:"PUT",headers:{Authorization:`Bearer ${mpToken}`,"Content-Type":"application/json"},body:JSON.stringify({status:"inactive"})});
      if(!mp.ok){console.error(`[${VERSION}] Mercado Pago: ${mp.status}`);return respond(request,{error:"Não foi possível desativar o link de pagamento. Tente novamente."},502);}
    }
    const{data,error}=await userClient.rpc("customer_cancel_ticket_order",{p_order_id:orderId});
    if(error)throw new Error(error.message);
    return respond(request,data);
  }catch(error){console.error(`[${VERSION}]`,error);return respond(request,{error:error instanceof Error?error.message:"Não foi possível cancelar a reserva."},400);}
});
