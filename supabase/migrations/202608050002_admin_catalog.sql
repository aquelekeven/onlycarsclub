-- Only Cars Club — catálogo inicial e operações seguras do painel administrativo.
-- Todos os estoques começam zerados e devem ser preenchidos pelo painel.

insert into public.products (slug, name, category, description, active, featured, metadata)
values
  ('camiseta-oversized','Camiseta oversized','Roupas · Unissex','Camiseta oversized Only Cars, com modelagem ampla e confortável.',true,true,'{"shipping_data_pending":true}'::jsonb),
  ('cropped','Cropped','Roupas · Feminino','Cropped preto Only Cars, com modelagem ampla e estampa do Onlynho nas costas.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('moletom','Moletom','Roupas · Unissex','Moletom preto unissex Only Cars para acompanhar os rolês em qualquer clima.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('chaveiro-logotipo','Chaveiro logotipo','Chaveiros · Logotipo','Chaveiro com o logotipo oficial do Only Cars Club.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('chaveiro-onlynho-1','Chaveiro mascote resina','Chaveiros · Mascote','Chaveiro de resina com o mascote Onlynho.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('chaveiro-onlynho-2','Chaveiro mascote 3D','Chaveiros · Mascote','Chaveiro 3D com o mascote Onlynho.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('copo-termico','Copo térmico Only','Acessórios · Copos','Copo térmico do Only Cars Club.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('camiseta-oversized-amarela','Camiseta oversized amarela','Roupas · Unissex','Camiseta oversized amarela com estampa exclusiva Only Cars.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('camiseta-streetwear','Camiseta streetwear','Roupas · Unissex','Camiseta streetwear Only Cars, disponível em três cores.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('adesivo-japones-p','Adesivo japonês P','Adesivos · Japonês','Adesivo japonês Only Cars P, 15 × 3,5 cm.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('adesivo-japones-m','Adesivo japonês M','Adesivos · Japonês','Adesivo japonês Only Cars M, 31 × 7 cm.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('adesivo-japones-g','Adesivo japonês G','Adesivos · Japonês','Adesivo japonês Only Cars G, 53 × 11 cm.',true,false,'{"shipping_data_pending":true}'::jsonb),
  ('adesivo-mascote','Adesivo mascote','Adesivos · Mascote','Adesivo do mascote Onlynho em dois acabamentos.',true,false,'{"shipping_data_pending":true}'::jsonb)
on conflict (slug) do update set
  name=excluded.name, category=excluded.category, description=excluded.description,
  active=excluded.active, featured=excluded.featured, metadata=public.products.metadata || excluded.metadata;

with variants(slug,sku,size,color,price_cents,compare_at_price_cents,image_url) as (
  values
  ('camiseta-oversized','ONLY-OVR-P-PTO','P','Preto',10800,12000,'assets/images/camiseta-oversized-frente-modelo.webp'),
  ('camiseta-oversized','ONLY-OVR-M-PTO','M','Preto',10800,12000,'assets/images/camiseta-oversized-frente-modelo.webp'),
  ('camiseta-oversized','ONLY-OVR-G-PTO','G','Preto',10800,12000,'assets/images/camiseta-oversized-frente-modelo.webp'),
  ('camiseta-oversized','ONLY-OVR-GG-PTO','GG','Preto',10800,12000,'assets/images/camiseta-oversized-frente-modelo.webp'),
  ('camiseta-oversized','ONLY-OVR-EG-PTO','EG','Preto',10800,12000,'assets/images/camiseta-oversized-frente-modelo.webp'),
  ('cropped','ONLY-CRP-UN-PTO','Único','Preto',7200,8000,'assets/images/cropped-v53-frente.png'),
  ('moletom','ONLY-MOL-P-PTO','P','Preto',17550,19500,'assets/images/moletom-v51-frente-modelo.webp'),
  ('moletom','ONLY-MOL-M-PTO','M','Preto',17550,19500,'assets/images/moletom-v51-frente-modelo.webp'),
  ('moletom','ONLY-MOL-G-PTO','G','Preto',17550,19500,'assets/images/moletom-v51-frente-modelo.webp'),
  ('moletom','ONLY-MOL-XG-PTO','XG','Preto',17550,19500,'assets/images/moletom-v51-frente-modelo.webp'),
  ('chaveiro-logotipo','ONLY-CHL-UN-BRA','Único','Branco',1350,1500,'assets/images/chaveiro-logo-branco.webp'),
  ('chaveiro-logotipo','ONLY-CHL-UN-PTO','Único','Preto',1350,1500,'assets/images/chaveiro-logo-preto.webp'),
  ('chaveiro-onlynho-1','ONLY-CHR-UN-RES','Único','Resina',2250,2500,'assets/images/chaveiro-onlynho-1-frente.webp'),
  ('chaveiro-onlynho-2','ONLY-CH3-UN-3D','Único','3D',1350,1500,'assets/images/chaveiro-onlynho-2-frente.webp'),
  ('copo-termico','ONLY-COP-UN-PTO','Único','Preto',6750,7500,'assets/images/copo-termico-v53.png'),
  ('camiseta-oversized-amarela','ONLY-OVA-P-AMA','P','Amarelo',10800,12000,'assets/images/oversized-amarela-frente-v54.png'),
  ('camiseta-oversized-amarela','ONLY-OVA-M-AMA','M','Amarelo',10800,12000,'assets/images/oversized-amarela-frente-v54.png'),
  ('camiseta-oversized-amarela','ONLY-OVA-G-AMA','G','Amarelo',10800,12000,'assets/images/oversized-amarela-frente-v54.png'),
  ('camiseta-oversized-amarela','ONLY-OVA-GG-AMA','GG','Amarelo',10800,12000,'assets/images/oversized-amarela-frente-v54.png'),
  ('camiseta-oversized-amarela','ONLY-OVA-EG-AMA','EG','Amarelo',10800,12000,'assets/images/oversized-amarela-frente-v54.png'),
  ('camiseta-streetwear','ONLY-STR-P-PTO','P','Preto',7200,8000,'assets/images/streetwear-preta-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-M-PTO','M','Preto',7200,8000,'assets/images/streetwear-preta-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-G-PTO','G','Preto',7200,8000,'assets/images/streetwear-preta-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-GG-PTO','GG','Preto',7200,8000,'assets/images/streetwear-preta-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-EG-PTO','EG','Preto',7200,8000,'assets/images/streetwear-preta-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-P-AMA','P','Amarelo',7200,8000,'assets/images/streetwear-amarela-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-M-AMA','M','Amarelo',7200,8000,'assets/images/streetwear-amarela-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-G-AMA','G','Amarelo',7200,8000,'assets/images/streetwear-amarela-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-GG-AMA','GG','Amarelo',7200,8000,'assets/images/streetwear-amarela-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-EG-AMA','EG','Amarelo',7200,8000,'assets/images/streetwear-amarela-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-P-BRA','P','Branco',7200,8000,'assets/images/streetwear-branca-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-M-BRA','M','Branco',7200,8000,'assets/images/streetwear-branca-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-G-BRA','G','Branco',7200,8000,'assets/images/streetwear-branca-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-GG-BRA','GG','Branco',7200,8000,'assets/images/streetwear-branca-frente-v52.png'),
  ('camiseta-streetwear','ONLY-STR-EG-BRA','EG','Branco',7200,8000,'assets/images/streetwear-branca-frente-v52.png'),
  ('adesivo-japones-p','ONLY-ADJ-P-PAD','P','Padrão',1350,1500,'assets/images/adesivo-japones-p-v55.png'),
  ('adesivo-japones-m','ONLY-ADJ-M-PAD','M','Padrão',1800,2000,'assets/images/adesivo-japones-m-v55.png'),
  ('adesivo-japones-g','ONLY-ADJ-G-PAD','G','Padrão',2250,2500,'assets/images/adesivo-japones-g-v55.png'),
  ('adesivo-mascote','ONLY-ADM-UN-COL','Único','Colorido',1350,1500,'assets/images/adesivo-mascote-colorido-v59.png'),
  ('adesivo-mascote','ONLY-ADM-UN-BRA','Único','Branco',1350,1500,'assets/images/adesivo-mascote-branco-v59.png')
)
insert into public.product_variants
  (product_id,sku,size,color,price_cents,compare_at_price_cents,stock_quantity,reserved_quantity,weight_grams,length_cm,width_cm,height_cm,image_urls,active,metadata)
select p.id,v.sku,v.size,v.color,v.price_cents,v.compare_at_price_cents,0,0,1,1,1,1,jsonb_build_array(v.image_url),true,'{"shipping_data_pending":true}'::jsonb
from variants v join public.products p on p.slug=v.slug
on conflict (sku) do update set
  product_id=excluded.product_id,size=excluded.size,color=excluded.color,
  price_cents=excluded.price_cents,compare_at_price_cents=excluded.compare_at_price_cents,
  image_urls=excluded.image_urls,active=excluded.active,
  metadata=public.product_variants.metadata || excluded.metadata;

create or replace function public.admin_set_variant_inventory(target_variant_id uuid, new_stock_quantity integer)
returns public.product_variants
language plpgsql security definer set search_path=''
as $$
declare before_row public.product_variants; after_row public.product_variants;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  if new_stock_quantity < 0 then raise exception 'O estoque não pode ser negativo.' using errcode='22003'; end if;
  select * into before_row from public.product_variants where id=target_variant_id for update;
  if not found then raise exception 'Variação não encontrada.' using errcode='P0002'; end if;
  if new_stock_quantity < before_row.reserved_quantity then raise exception 'O estoque não pode ser menor que a quantidade reservada.' using errcode='23514'; end if;
  update public.product_variants set stock_quantity=new_stock_quantity where id=target_variant_id returning * into after_row;
  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'inventory.update','product_variant',target_variant_id::text,to_jsonb(before_row),to_jsonb(after_row));
  return after_row;
end;
$$;

create or replace function public.admin_update_fulfillment_status(target_order_id uuid, new_fulfillment_status public.fulfillment_status)
returns public.orders
language plpgsql security definer set search_path=''
as $$
declare before_row public.orders; after_row public.orders;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  select * into before_row from public.orders where id=target_order_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  update public.orders set fulfillment_status=new_fulfillment_status
  where id=target_order_id returning * into after_row;
  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'order.status.update','order',target_order_id::text,to_jsonb(before_row),to_jsonb(after_row));
  return after_row;
end;
$$;

revoke all on function public.admin_set_variant_inventory(uuid,integer) from public;
revoke all on function public.admin_update_fulfillment_status(uuid,public.fulfillment_status) from public;
grant execute on function public.admin_set_variant_inventory(uuid,integer) to authenticated;
grant execute on function public.admin_update_fulfillment_status(uuid,public.fulfillment_status) to authenticated;
