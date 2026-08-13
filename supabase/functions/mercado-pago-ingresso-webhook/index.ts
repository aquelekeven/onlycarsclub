import { createClient } from "npm:@supabase/supabase-js@2";
const respond = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
Deno.serve(async(request)=>{
  if(request.method!=="POST") return respond({received:false},405);
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), token=Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if(!url||!key||!token) return respond({received:false},500);
  try {
    const body=await request.json().catch(()=>({}));
    const parsed=new URL(request.url);
    const paymentId=String(parsed.searchParams.get("data.id")||body?.data?.id||"");
    const type=String(parsed.searchParams.get("type")||body?.type||"");
    if(type!=="payment"||!paymentId) return respond({received:true,ignored:true});
    const mp=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${token}`}});
    const payment=await mp.json();
    if(!mp.ok) throw new Error(`Mercado Pago: ${mp.status}`);
    const reference=String(payment.external_reference||"");
    if(!reference.startsWith("ticket:")) return respond({received:true,ignored:true});
    const orderId=reference.slice(7);
    const db=createClient(url,key,{auth:{persistSession:false}});
    const {data:order,error}=await db.from("ticket_orders").select("id,event_id,user_id,total_cents,status").eq("id",orderId).single();
    if(error||!order) throw new Error("Pedido de ingresso não encontrado.");
    const amount=Math.round(Number(payment.transaction_amount||0)*100);
    if(amount!==Number(order.total_cents)) throw new Error("Valor do pagamento diferente do ingresso.");
    const approved=payment.status==="approved";
    const status=approved?"paid":payment.status==="cancelled"?"cancelled":payment.status==="refunded"?"refunded":"pending_payment";
    await db.from("ticket_orders").update({status,provider_payment_id:String(payment.id),payment_method:String(payment.payment_method_id||""),payment_status:approved?"approved":payment.status==="rejected"?"rejected":"pending",payment_status_detail:String(payment.status_detail||""),paid_at:approved?(payment.date_approved||new Date().toISOString()):null}).eq("id",order.id);
    if(approved){
      await db.from("tickets").update({status:"active"}).eq("order_id",order.id);
      const {data:ticket}=await db.from("tickets").select("id").eq("order_id",order.id).single();
      if(ticket) await db.from("event_coupons").upsert({event_id:order.event_id,ticket_id:ticket.id,owner_user_id:order.user_id,code:`MEETING10-${ticket.id.slice(0,8).toUpperCase()}`,discount_percent:10,valid_until:"2026-10-21T23:59:59-03:00",event_pickup_only:true},{onConflict:"ticket_id"});
    }
    return respond({received:true,processed:true});
  } catch(error){ console.error(error); return respond({received:false},500); }
});
