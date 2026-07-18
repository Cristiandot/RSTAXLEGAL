-- Estado de Resultado alineado a las 6 categorías. Los compras se bucketean por
-- la categoría del proveedor: servicio / honorarios / insumos / remuneraciones /
-- arriendo / otros (afecto sin clasificar → insumos; exento sin clasificar → otros).
-- Honorarios y remuneraciones suman además sus fuentes propias (BHE y liquidaciones).
create or replace function public.portal_estado_resultado(p_token text, p_anio integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid; v_anio text := p_anio::text; v_result jsonb; v_corte jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  with per as (
    select v_anio || '-' || lpad(g::text, 2, '0') as periodo from generate_series(1,12) g
  ),
  ing as (
    select periodo, sum(monto_total)::bigint total
    from rcv_ventas where cliente_id = v_cliente and periodo like v_anio || '-%' group by periodo
  ),
  comp as (
    select c.periodo,
      sum(c.monto_total)::bigint total,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'servicio'),0)::bigint servicios,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'honorarios'),0)::bigint honorarios_c,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'insumos' or (cat.categoria is null and c.tipo_doc <> 34)),0)::bigint insumos,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'remuneraciones'),0)::bigint remuneraciones_c,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'arriendo'),0)::bigint arriendo,
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'otros' or (cat.categoria is null and c.tipo_doc = 34)),0)::bigint otros
    from rcv_compras c
    left join rcv_proveedor_categoria cat
      on cat.cliente_id = c.cliente_id and cat.rut_proveedor = c.rut_proveedor
    where c.cliente_id = v_cliente and c.periodo like v_anio || '-%' group by c.periodo
  ),
  hon as (
    select periodo, sum(honorarios_brutos)::bigint total
    from honorarios_recibidos where cliente_id = v_cliente and periodo like v_anio || '-%' group by periodo
  ),
  rem as (
    select periodo,
      (sum(total_haberes) + sum(coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)))::bigint costo
    from liquidacion where cliente_id = v_cliente and periodo like v_anio || '-%' group by periodo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'periodo', per.periodo,
    'ingresos', coalesce(ing.total,0),
    'servicios', coalesce(comp.servicios,0),
    'insumos', coalesce(comp.insumos,0),
    'arriendo', coalesce(comp.arriendo,0),
    'otros', coalesce(comp.otros,0),
    'honorarios', coalesce(comp.honorarios_c,0) + coalesce(hon.total,0),
    'compras_total', coalesce(comp.total,0),
    'remuneraciones', coalesce(comp.remuneraciones_c,0) + coalesce(rem.costo,0),
    'resultado', coalesce(ing.total,0) - coalesce(comp.total,0) - coalesce(hon.total,0) - coalesce(rem.costo,0),
    'remun_cargada', (rem.costo is not null)
  ) order by per.periodo) filter (where ing.total is not null or comp.total is not null or rem.costo is not null or hon.total is not null), '[]'::jsonb)
  into v_result
  from per
  left join ing on ing.periodo = per.periodo
  left join comp on comp.periodo = per.periodo
  left join hon on hon.periodo = per.periodo
  left join rem on rem.periodo = per.periodo;

  select jsonb_build_object(
    'generado', current_date,
    'ventas_hasta', (select max(periodo) from rcv_ventas where cliente_id = v_cliente),
    'compras_hasta', (select max(periodo) from rcv_compras where cliente_id = v_cliente),
    'honorarios_hasta', (select max(periodo) from honorarios_recibidos where cliente_id = v_cliente),
    'remun_hasta', (select max(periodo) from liquidacion where cliente_id = v_cliente)
  ) into v_corte;

  return jsonb_build_object('anio', p_anio, 'meses', v_result, 'corte', v_corte);
end $function$;
