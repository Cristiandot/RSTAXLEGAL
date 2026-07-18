-- Facturas netas: no se listan las notas de crédito/débito (tipo 61/56); su monto
-- se devuelve como "ajustes" por período para que el total del mes salga neto.
create or replace function public.portal_facturas(p_token text, p_anio int, p_tipo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_cliente uuid; v_fact jsonb; v_aj jsonb; v_anio text := p_anio::text;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  if p_tipo = 'emitidas' then
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_fact from (
      select v.id, v.periodo, coalesce(v.fecha_docto::text, v.periodo || '-01') as fecha,
        v.razon_social as contraparte, v.rut_cliente as rut, v.folio,
        v.monto_total as monto, v.tipo_doc, (v.pagado_pct is distinct from 0) as pagado,
        false as clasificable, null::text as categoria, v.n_documentos
      from rcv_ventas v where v.cliente_id = v_cliente and v.periodo like v_anio || '-%' and v.tipo_doc not in (56, 61)
    ) x;
    select coalesce(jsonb_agg(a order by a.periodo), '[]'::jsonb) into v_aj from (
      select v.periodo, sum(v.monto_total) as monto, count(*) as docs from rcv_ventas v
      where v.cliente_id = v_cliente and v.periodo like v_anio || '-%' and v.tipo_doc in (56, 61) group by v.periodo
    ) a;
  else
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_fact from (
      select c.id, c.periodo, coalesce(c.fecha_docto::text, c.periodo || '-01') as fecha,
        c.razon_social as contraparte, c.rut_proveedor as rut, c.folio,
        c.monto_total as monto, c.tipo_doc, (c.pagado_pct is distinct from 0) as pagado,
        true as clasificable, pc.categoria, null::integer as n_documentos
      from rcv_compras c
      left join rcv_proveedor_categoria pc on pc.cliente_id = c.cliente_id and pc.rut_proveedor = c.rut_proveedor
      where c.cliente_id = v_cliente and c.periodo like v_anio || '-%' and c.tipo_doc not in (56, 61)
    ) x;
    select coalesce(jsonb_agg(a order by a.periodo), '[]'::jsonb) into v_aj from (
      select c.periodo, sum(c.monto_total) as monto, count(*) as docs from rcv_compras c
      where c.cliente_id = v_cliente and c.periodo like v_anio || '-%' and c.tipo_doc in (56, 61) group by c.periodo
    ) a;
  end if;
  return jsonb_build_object('facturas', v_fact, 'ajustes', v_aj);
end $function$;
