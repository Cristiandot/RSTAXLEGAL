-- Panel financiero: separar ARRIENDO de servicios profesionales (pendiente #3)
-- y dejar cableados los HONORARIOS de terceros / BHE recibidas (pendiente #2).
--
-- Contexto: en el RCV, tanto los servicios profesionales exentos como el arriendo
-- llegan como factura exenta (tipo_doc = 34), sin un campo que los distinga. Para
-- separarlos se usa una tabla de clasificación por proveedor (rut). Los honorarios
-- de terceros (boletas de honorarios recibidas) NO viven en el RCV —no son DTE—,
-- por eso tienen su propia tabla; se poblan bajándolos del SII
-- (TMBCOC_InformeAnualBheRec.cgi). Ambos entran como costo en el Estado de
-- Resultado y en Reportes.

-- 1) Clasificación de proveedores por cliente. Hoy sólo se usa 'arriendo' para
--    apartar el arriendo del resto de los tipo_doc=34; queda extensible a otras
--    categorías. Sin fila para un proveedor => cuenta como servicio profesional.
create table if not exists rcv_proveedor_categoria (
  cliente_id uuid not null references clientes(id) on delete cascade,
  rut_proveedor text not null,
  categoria text not null,
  created_at timestamptz not null default now(),
  primary key (cliente_id, rut_proveedor)
);

-- 2) Honorarios de terceros / BHE recibidas (detalle por boleta).
create table if not exists honorarios_recibidos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodo text not null,                 -- 'YYYY-MM'
  fecha date,
  folio text,                            -- N° de la boleta de honorarios
  rut_emisor text,
  nombre text,
  honorarios_brutos bigint not null default 0,
  retencion bigint not null default 0,
  liquido bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (cliente_id, folio)
);
create index if not exists honorarios_recibidos_cli_per on honorarios_recibidos (cliente_id, periodo);

-- 3) Semilla LeBlanc: Inmobiliaria San Telmo SpA = arriendo.
insert into rcv_proveedor_categoria (cliente_id, rut_proveedor, categoria)
values ('297d3675-c88c-4072-b747-c7acaafa2f89', '76879693-9', 'arriendo')
on conflict (cliente_id, rut_proveedor) do update set categoria = excluded.categoria;

-- 4) Estado de Resultado: separa arriendo, resta honorarios de terceros.
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
      coalesce(sum(c.monto_total) filter (where c.tipo_doc = 34 and cat.categoria = 'arriendo'),0)::bigint arriendo,
      coalesce(sum(c.monto_total) filter (where c.tipo_doc = 34 and (cat.categoria is null or cat.categoria <> 'arriendo')),0)::bigint servicios,
      coalesce(sum(c.monto_total) filter (where c.tipo_doc <> 34),0)::bigint insumos
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
    'insumos', coalesce(comp.insumos,0),
    'servicios', coalesce(comp.servicios,0),
    'arriendo', coalesce(comp.arriendo,0),
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

-- 5) Reportes: estructura con arriendo/honorarios y listas separadas.
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
        'insumos', coalesce((select sum(monto_total) from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%' and tipo_doc<>34),0)::bigint,
        'servicios', coalesce((select sum(c.monto_total) from rcv_compras c
            left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34
              and (cat.categoria is null or cat.categoria<>'arriendo')),0)::bigint,
        'arriendo', coalesce((select sum(c.monto_total) from rcv_compras c
            join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34 and cat.categoria='arriendo'),0)::bigint,
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
        select rut_proveedor as rut, coalesce(nullif(trim(razon_social),''), rut_proveedor) as nombre,
               sum(monto_total)::bigint as monto, count(*) as docs
        from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'
        group by rut_proveedor, razon_social order by sum(monto_total) desc limit 10
      ) x
    ),
    'servicios_profesionales', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(c.razon_social),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34
          and (cat.categoria is null or cat.categoria<>'arriendo')
        group by c.razon_social, c.rut_proveedor order by sum(c.monto_total) desc limit 10
      ) x
    ),
    'arriendos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(c.razon_social),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34 and cat.categoria='arriendo'
        group by c.razon_social, c.rut_proveedor order by sum(c.monto_total) desc limit 10
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
