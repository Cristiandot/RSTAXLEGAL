-- Facturas del cliente para el portal: emitidas (ventas) o recibidas (compras),
-- por año. Estado de pago: se asume pagada salvo pagado_pct=0. Las recibidas
-- exentas (tipo 34) traen su categoría (para reclasificar).
create or replace function public.portal_facturas(p_token text, p_anio int, p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid; v_out jsonb; v_anio text := p_anio::text;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  if p_tipo = 'emitidas' then
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_out from (
      select v.id, v.periodo,
        coalesce(v.fecha_docto::text, v.periodo || '-01') as fecha,
        v.razon_social as contraparte, v.rut_cliente as rut, v.folio,
        v.monto_total as monto, v.tipo_doc,
        (v.pagado_pct is distinct from 0) as pagado,
        false as clasificable, null::text as categoria,
        v.n_documentos
      from rcv_ventas v
      where v.cliente_id = v_cliente and v.periodo like v_anio || '-%'
    ) x;
  else
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_out from (
      select c.id, c.periodo,
        coalesce(c.fecha_docto::text, c.periodo || '-01') as fecha,
        c.razon_social as contraparte, c.rut_proveedor as rut, c.folio,
        c.monto_total as monto, c.tipo_doc,
        (c.pagado_pct is distinct from 0) as pagado,
        (c.tipo_doc = 34) as clasificable,
        pc.categoria, null::integer as n_documentos
      from rcv_compras c
      left join rcv_proveedor_categoria pc
        on pc.cliente_id = c.cliente_id and pc.rut_proveedor = c.rut_proveedor
      where c.cliente_id = v_cliente and c.periodo like v_anio || '-%'
    ) x;
  end if;
  return v_out;
end $function$;

grant execute on function public.portal_facturas(text, int, text) to anon;

create or replace function public.portal_marcar_pago(p_token text, p_tabla text, p_id uuid, p_pagado boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid; v_pct int;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  v_pct := case when p_pagado then 100 else 0 end;
  if p_tabla = 'emitidas' then
    update rcv_ventas set pagado_pct = v_pct where id = p_id and cliente_id = v_cliente;
  elsif p_tabla = 'recibidas' then
    update rcv_compras set pagado_pct = v_pct where id = p_id and cliente_id = v_cliente;
  else raise exception 'Tabla inválida'; end if;
  if not found then raise exception 'Factura no encontrada'; end if;
  return jsonb_build_object('ok', true);
end $function$;

grant execute on function public.portal_marcar_pago(text, text, uuid, boolean) to anon;
