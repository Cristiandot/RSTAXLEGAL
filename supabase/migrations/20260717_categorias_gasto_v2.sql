-- Panel financiero v2 de categorías de gasto (17-07-2026, decisiones de Cristian):
--   * Se ELIMINA "arriendo" (era una sola factura de San Telmo; no amerita categoría).
--   * Catálogo del clasificador: servicio (Servicios profesionales),
--     insumos (Insumos y gastos), otros (Otros gastos).
--   * Regla de bucket, atribuyendo por PROVEEDOR (así las notas de crédito netean
--     con las facturas del mismo proveedor — corrige la diferencia de Odontokine):
--       - proveedor con categoría 'servicio' -> Servicios profesionales
--       - proveedor con categoría 'insumos'  -> Insumos y gastos
--       - proveedor con categoría 'otros'    -> Otros gastos
--       - sin categoría y tipo_doc <> 34 (afecto) -> Insumos y gastos (default)
--       - sin categoría y tipo_doc = 34 (exento)   -> Otros gastos (los "sin clasificar")
--   El resultado total no cambia: servicios+insumos+otros = total de compras.

-- Catálogo nuevo.
delete from categoria_gasto where codigo = 'arriendo';
insert into categoria_gasto (codigo, etiqueta, orden) values
  ('servicio','Servicios profesionales',1),
  ('insumos','Insumos y gastos',2),
  ('otros','Otros gastos',3)
on conflict (codigo) do update set etiqueta=excluded.etiqueta, orden=excluded.orden;

-- San Telmo (estaba como 'arriendo'): queda SIN clasificar -> cae en Otros gastos
-- hasta que el cliente/oficina lo clasifique.
delete from rcv_proveedor_categoria where categoria = 'arriendo';

-- Estado de Resultado.
create or replace function public.portal_estado_resultado(p_token text, p_anio integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
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
      coalesce(sum(c.monto_total) filter (where cat.categoria = 'insumos' or (cat.categoria is null and c.tipo_doc <> 34)),0)::bigint insumos,
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
    'otros', coalesce(comp.otros,0),
    'honorarios', coalesce(hon.total,0),
    'compras_total', coalesce(comp.total,0),
    'remuneraciones', coalesce(rem.costo,0),
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

-- Reportes.
create or replace function public.portal_reportes(p_token text, p_anio integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_cliente uuid; v_anio text := p_anio::text; v_res jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select jsonb_build_object(
    'anio', p_anio,
    'estructura', (
      select jsonb_build_object(
        'ingresos', coalesce((select sum(monto_total) from rcv_ventas where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
        'servicios', coalesce((select sum(c.monto_total) from rcv_compras c
            left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and cat.categoria='servicio'),0)::bigint,
        'insumos', coalesce((select sum(c.monto_total) from rcv_compras c
            left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%'
              and (cat.categoria='insumos' or (cat.categoria is null and c.tipo_doc<>34))),0)::bigint,
        'otros', coalesce((select sum(c.monto_total) from rcv_compras c
            left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%'
              and (cat.categoria='otros' or (cat.categoria is null and c.tipo_doc=34))),0)::bigint,
        'honorarios', coalesce((select sum(honorarios_brutos) from honorarios_recibidos where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
        'remuneraciones', coalesce((select sum(total_haberes+coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)) from liquidacion where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint
      )
    ),
    'iva_credito_no_recuperable', coalesce((
      select sum(coalesce(iva_recuperable,0)+coalesce(iva_no_recuperable,0)+coalesce(iva_uso_comun,0))
      from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
    'total_compras', coalesce((select sum(monto_total) from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
    'top_proveedores', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select rut_proveedor as rut, coalesce(nullif(trim(max(razon_social)),''), rut_proveedor) as nombre,
               sum(monto_total)::bigint as monto, count(*) as docs
        from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'
        group by rut_proveedor order by sum(monto_total) desc limit 10
      ) x
    ),
    'servicios_profesionales', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(max(c.razon_social)),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and cat.categoria='servicio'
        group by c.rut_proveedor order by sum(c.monto_total) desc limit 10
      ) x
    ),
    'sin_clasificar', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(max(c.razon_social)),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34 and cat.rut_proveedor is null
        group by c.rut_proveedor order by sum(c.monto_total) desc limit 20
      ) x
    ),
    'honorarios_recibidos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(nombre),''), rut_emisor) as nombre,
               sum(honorarios_brutos)::bigint as monto, count(*) as docs
        from honorarios_recibidos where cliente_id=v_cliente and periodo like v_anio||'-%'
        group by nombre, rut_emisor order by sum(honorarios_brutos) desc limit 10
      ) x
    ),
    'boletas_mensual', (
      select coalesce(jsonb_agg(x order by x->>'periodo'), '[]'::jsonb) from (
        select jsonb_build_object(
          'periodo', periodo,
          'n', sum(n_documentos)::bigint,
          'monto', sum(monto_total)::bigint,
          'ticket', case when coalesce(sum(n_documentos),0) > 0
                         then round(sum(monto_total)::numeric / sum(n_documentos))::bigint else 0 end
        ) x
        from rcv_ventas
        where cliente_id=v_cliente and periodo like v_anio||'-%' and tipo_doc=41 and n_documentos is not null
        group by periodo
      ) x
    ),
    'remuneraciones_mensual', (
      select coalesce(jsonb_agg(x order by x->>'periodo'), '[]'::jsonb) from (
        select jsonb_build_object(
          'periodo', periodo,
          'costo', (sum(total_haberes)+sum(coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)))::bigint,
          'dotacion', count(distinct trabajador_id)
        ) x
        from liquidacion where cliente_id=v_cliente and periodo like v_anio||'-%' group by periodo
      ) x
    )
  ) into v_res;
  return v_res;
end $function$;
