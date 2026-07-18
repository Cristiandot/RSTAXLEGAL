-- Categorías ampliadas.
insert into categoria_gasto (codigo, etiqueta, orden) values
  ('honorarios', 'Honorarios', 2),
  ('remuneraciones', 'Remuneraciones', 4),
  ('arriendo', 'Arriendo', 6)
on conflict (codigo) do nothing;
update categoria_gasto set orden = 1 where codigo = 'servicio';
update categoria_gasto set orden = 3 where codigo = 'insumos';
update categoria_gasto set orden = 5 where codigo = 'otros';

-- Fuente: cliente > oficina > auto. 'manual' pasa a 'oficina'.
alter table rcv_proveedor_categoria drop constraint if exists rcv_proveedor_categoria_fuente_check;
update rcv_proveedor_categoria set fuente = 'oficina' where fuente = 'manual';
alter table rcv_proveedor_categoria alter column fuente set default 'oficina';
alter table rcv_proveedor_categoria add constraint rcv_proveedor_categoria_fuente_check
  check (fuente in ('cliente','oficina','auto'));

create or replace function public.portal_clasificar_proveedor(p_token text, p_rut text, p_categoria text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_cliente uuid;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  if not exists (select 1 from rcv_compras where cliente_id = v_cliente and rut_proveedor = p_rut) then
    raise exception 'Proveedor no corresponde al cliente';
  end if;
  if p_categoria is null or p_categoria = '' or p_categoria = 'sin_clasificar' then
    delete from rcv_proveedor_categoria where cliente_id = v_cliente and rut_proveedor = p_rut;
    return jsonb_build_object('ok', true);
  end if;
  if not exists (select 1 from categoria_gasto where codigo = p_categoria) then
    raise exception 'Categoría inválida';
  end if;
  insert into rcv_proveedor_categoria (cliente_id, rut_proveedor, categoria, fuente)
  values (v_cliente, p_rut, p_categoria, 'cliente')
  on conflict (cliente_id, rut_proveedor) do update set categoria = excluded.categoria, fuente = 'cliente';
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.portal_facturas(p_token text, p_anio int, p_tipo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_cliente uuid; v_out jsonb; v_anio text := p_anio::text;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  if p_tipo = 'emitidas' then
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_out from (
      select v.id, v.periodo, coalesce(v.fecha_docto::text, v.periodo || '-01') as fecha,
        v.razon_social as contraparte, v.rut_cliente as rut, v.folio,
        v.monto_total as monto, v.tipo_doc, (v.pagado_pct is distinct from 0) as pagado,
        false as clasificable, null::text as categoria, v.n_documentos
      from rcv_ventas v where v.cliente_id = v_cliente and v.periodo like v_anio || '-%'
    ) x;
  else
    select coalesce(jsonb_agg(x order by x.fecha nulls last, x.folio), '[]'::jsonb) into v_out from (
      select c.id, c.periodo, coalesce(c.fecha_docto::text, c.periodo || '-01') as fecha,
        c.razon_social as contraparte, c.rut_proveedor as rut, c.folio,
        c.monto_total as monto, c.tipo_doc, (c.pagado_pct is distinct from 0) as pagado,
        true as clasificable, pc.categoria, null::integer as n_documentos
      from rcv_compras c
      left join rcv_proveedor_categoria pc on pc.cliente_id = c.cliente_id and pc.rut_proveedor = c.rut_proveedor
      where c.cliente_id = v_cliente and c.periodo like v_anio || '-%'
    ) x;
  end if;
  return v_out;
end $function$;

create or replace function public.portal_sin_clasificar_participacion(p_token text, p_anio int)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_cliente uuid; v_anio text := p_anio::text; v_total numeric; v_sin numeric; v_docs int;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  select coalesce(sum(monto_total),0) into v_total from rcv_compras where cliente_id = v_cliente and periodo like v_anio||'-%';
  select coalesce(sum(c.monto_total),0), count(*) into v_sin, v_docs from rcv_compras c
    where c.cliente_id = v_cliente and c.periodo like v_anio||'-%'
      and not exists (select 1 from rcv_proveedor_categoria pc where pc.cliente_id=c.cliente_id and pc.rut_proveedor=c.rut_proveedor);
  return jsonb_build_object('monto_sin', v_sin, 'monto_total', v_total, 'docs', v_docs,
    'pct', case when v_total > 0 then round(v_sin / v_total * 100, 1) else 0 end);
end $function$;

grant execute on function public.portal_sin_clasificar_participacion(text, int) to anon;
