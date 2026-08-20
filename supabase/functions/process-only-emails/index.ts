import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

const SITE="https://onlycarsclub.com.br";
const EVENT_IMAGE=`${SITE}/assets/images/events/flyer-drift-background.webp`;
const ORDER_IMAGE=`${SITE}/assets/images/paixao-comunidade.webp`;
const esc=(v:unknown)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const money=(v:unknown)=>(Number(v||0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const shell=(title:string,lead:string,body:string,image:string)=>`<!doctype html><html><body style="margin:0;background:#0b0b0b;font-family:Arial,sans-serif;color:#171713"><div style="display:none;max-height:0;overflow:hidden">${esc(lead)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0b"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#f5f4ee;border-radius:22px;overflow:hidden"><tr><td><img src="${image}" width="620" alt="Only Cars Club" style="display:block;width:100%;height:250px;object-fit:cover"></td></tr><tr><td style="padding:34px"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#8a7300">ONLY CARS CLUB</div><h1 style="margin:10px 0 12px;font-size:34px;line-height:1.05">${esc(title)}</h1><p style="color:#65645d;line-height:1.6">${esc(lead)}</p>${body}<p style="margin-top:30px;color:#88867e;font-size:12px">Mensagem automática da Only Cars Club.</p></td></tr></table></td></tr></table></body></html>`;

Deno.serve(async(req)=>{
 if(req.method!=="POST") return Response.json({error:"method"},{status:405});
 const url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,resend=Deno.env.get("RESEND_API_KEY"),from=Deno.env.get("EMAIL_FROM")||"Only Cars Club <contato@onlycarsclub.com.br>";
 if(!url||!service||req.headers.get("apikey")!==anon) return Response.json({error:"unauthorized"},{status:401});
 const db=createClient(url,service,{auth:{persistSession:false}}); await db.rpc("enqueue_only_emails");
 const {data:rows,error}=await db.from("transactional_email_outbox").select("*").in("status",["pending","failed"]).lte("scheduled_at",new Date().toISOString()).lt("attempts",4).order("scheduled_at").limit(20);
 if(error) return Response.json({error:error.message},{status:500});
 const dryRun=(await req.json().catch(()=>({})))?.dry_run===true; let sent=0,failed=0;
 for(const row of rows||[]){
  const p=row.payload||{}; let html="",attachments:any[]=[];
  if(row.template==="ticket_purchase"){
   const qr=await QRCode.toDataURL(String(p.qr_token),{width:360,margin:2,errorCorrectionLevel:"H"}); attachments=[{filename:"ingresso-only.png",content:qr.split(",")[1],content_id:"ticket-qr"}];
   html=shell("Seu ingresso está confirmado",`${p.driver_name}, seu lugar no Only Cars Meeting está garantido.`,`<div style="padding:20px;background:#fff;border-radius:16px"><b>${esc(p.ticket_code)}</b><p>${esc(p.vehicle_plate)} · ${esc(p.event_name)}</p><p>${new Date(p.event_date).toLocaleString("pt-BR")} · ${money(p.total_cents)}</p><img src="cid:ticket-qr" width="250" style="display:block;margin:20px auto"><p style="text-align:center;font-size:12px">Apresente este QR Code na portaria.</p></div><p><a href="${SITE}/minha-conta.html" style="display:inline-block;background:#171713;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none">Abrir meu ingresso</a></p>`,EVENT_IMAGE);
  }else if(row.template==="event_countdown") html=shell(`Faltam ${p.days} ${p.days===1?"dia":"dias"}`,"A contagem regressiva começou. Prepare o carro e confira os detalhes do evento.",`<p><a href="${SITE}/proximo-evento.html" style="display:inline-block;background:#efd311;color:#111;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:bold">Ver informações do evento</a></p>`,EVENT_IMAGE);
  else if(row.template==="order_purchase") html=shell("Pedido confirmado",`Recebemos o pagamento do pedido ${p.order_number}.`,`<p><strong>Total: ${money(p.total_cents)}</strong></p><p><a href="${SITE}/minha-conta.html" style="display:inline-block;background:#171713;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none">Acompanhar pedido</a></p>`,ORDER_IMAGE);
  else html=shell("Você deixou algo para trás","Seu carrinho ou pagamento ainda não foi concluído.",`<p><a href="${SITE}/${p.kind==="ticket"?"ingresso.html":"carrinho.html"}" style="display:inline-block;background:#efd311;color:#111;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:bold">Continuar agora</a></p>`,p.kind==="ticket"?EVENT_IMAGE:ORDER_IMAGE);
  if(dryRun) continue;
  if(!resend){failed++;await db.from("transactional_email_outbox").update({status:"failed",attempts:row.attempts+1,error_message:"RESEND_API_KEY ausente",updated_at:new Date().toISOString()}).eq("id",row.id);continue;}
  await db.from("transactional_email_outbox").update({status:"sending",attempts:row.attempts+1,updated_at:new Date().toISOString()}).eq("id",row.id);
  try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[row.recipient_email],subject:row.subject,html,attachments})});const result=await response.json();if(!response.ok)throw new Error(result?.message||"Falha no provedor");await db.from("transactional_email_outbox").update({status:"sent",sent_at:new Date().toISOString(),provider_message_id:result.id,error_message:null,updated_at:new Date().toISOString()}).eq("id",row.id);sent++;}catch(e){failed++;await db.from("transactional_email_outbox").update({status:"failed",error_message:e instanceof Error?e.message:"Falha",updated_at:new Date().toISOString()}).eq("id",row.id);}
 }
 return Response.json({ok:true,queued:(rows||[]).length,sent,failed,dry_run:dryRun});
});
