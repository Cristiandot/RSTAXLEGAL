-- ¿La empresa tiene información financiera (ventas/ingresos cargados)? Sirve para
-- que el portal muestre la Financiera solo cuando hay datos; si no, un aviso.
create or replace function public.portal_tiene_financiera(p_token text)
returns boolean
language sql
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from rcv_ventas v
    where v.cliente_id = (select id from clientes where form_token = p_token and activo)
  );
$function$;

grant execute on function public.portal_tiene_financiera(text) to anon;
