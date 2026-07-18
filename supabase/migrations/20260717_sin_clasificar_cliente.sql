-- Proveedores exentos (tipo 34) de un cliente sin categoría — para el panel interno.
create or replace function public.sin_clasificar_cliente(p_cliente uuid)
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(x order by x.monto desc), '[]'::jsonb) from (
    select c.rut_proveedor as rut, max(c.razon_social) as nombre,
           sum(c.monto_total) as monto, count(*) as docs
    from rcv_compras c
    where c.cliente_id = p_cliente and c.tipo_doc = 34
      and not exists (
        select 1 from rcv_proveedor_categoria pc
        where pc.cliente_id = c.cliente_id and pc.rut_proveedor = c.rut_proveedor
      )
    group by c.rut_proveedor
  ) x;
$function$;

grant execute on function public.sin_clasificar_cliente(uuid) to authenticated;
