-- Aditivo: exponer el id del trabajador en el array `trabajadores` de portal_rrhh,
-- para poder abrir la ficha por trabajador desde la nómina del portal.
-- (El id ya se seleccionaba en el CTE `nom`; solo se agrega al jsonb de salida.)

create or replace function public.portal_rrhh(p_token text, p_periodo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid; v_result jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link de solicitud inválido'; end if;

  with nom as (
    select t.id, t.nombres, t.apellidos, t.rut, t.sucursal, t.sueldo_base,
      coalesce(uc.cargo, t.cargo) cargo,
      coalesce(uc.tipo_contrato, t.tipo_contrato) tipo_contrato,
      coalesce(uc.fecha_inicio, t.fecha_ingreso) fecha_ingreso,
      coalesce(uc.fecha_vencimiento, t.fecha_termino_contrato) fecha_termino
    from trabajadores t
    left join lateral (
      select co.cargo, co.tipo_contrato, co.fecha_inicio, co.fecha_vencimiento
      from contratos co
      where co.trabajador_id = t.id and co.tipo_documento = 'contrato' and co.estado <> 'anulado'
      order by co.fecha_inicio desc nulls last, co.created_at desc limit 1
    ) uc on true
    where t.cliente_id = v_cliente and t.activo
  )
  select jsonb_build_object(
    'nomina_activa', (select count(*) from nom),
    'plazo_fijo', (select count(*) from nom where tipo_contrato='plazo_fijo'),
    'indefinidos', (select count(*) from nom where tipo_contrato='indefinido'),
    'plazo_fijo_por_vencer', (select count(*) from nom where tipo_contrato='plazo_fijo' and fecha_termino is not null and fecha_termino between current_date and current_date + 30),
    'contratos_nuevos', (select count(*) from contratos where cliente_id=v_cliente and tipo_documento='contrato' and estado<>'anulado' and to_char(fecha_inicio,'YYYY-MM')=p_periodo),
    'anexos_nuevos', (select count(*) from contratos where cliente_id=v_cliente and tipo_documento='anexo' and estado<>'anulado' and to_char(coalesce(fecha_inicio,created_at::date),'YYYY-MM')=p_periodo),
    'licencias_vigentes', (select count(*) from licencias_medicas where cliente_id=v_cliente and current_date between fecha_inicio and fecha_termino),
    'costo_remuneraciones', (select coalesce(sum(sueldo_base),0)::bigint from nom),
    'finiquitos_activos', (select count(*) from solicitudes_rrhh s where s.cliente_id=v_cliente and s.tipo='finiquito' and s.estado not in ('enviada','rechazada')),
    'finiquitos', (select coalesce(jsonb_agg(jsonb_build_object(
        'trabajador', coalesce(s.trabajador_nombre, (select t.nombres||' '||t.apellidos from trabajadores t where t.id=s.trabajador_id), '—'),
        'rut', coalesce(s.trabajador_rut, (select t.rut from trabajadores t where t.id=s.trabajador_id)),
        'estado', s.estado
      ) order by s.created_at desc), '[]'::jsonb)
      from solicitudes_rrhh s where s.cliente_id=v_cliente and s.tipo='finiquito' and s.estado not in ('enviada','rechazada')),
    'dotacion', (select coalesce(jsonb_agg(jsonb_build_object('area', area, 'n', n) order by n desc), '[]'::jsonb)
        from (select coalesce(nullif(trim(sucursal),''), nullif(trim(cargo),''), 'Sin clasificar') area, count(*) n from nom group by 1) d),
    'trabajadores', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id,
        'nombre', nombres||' '||apellidos, 'rut', rut, 'cargo', cargo, 'tipo_contrato', tipo_contrato,
        'fecha_ingreso', fecha_ingreso, 'fecha_termino', fecha_termino,
        'nuevo', (to_char(fecha_ingreso,'YYYY-MM')=p_periodo)
      ) order by apellidos, nombres), '[]'::jsonb) from nom),
    'licencias', (select coalesce(jsonb_agg(jsonb_build_object(
        'trabajador', coalesce(lm.trabajador_nombre, (select t.nombres||' '||t.apellidos from trabajadores t where t.id=lm.trabajador_id)),
        'fecha_inicio', lm.fecha_inicio, 'fecha_termino', lm.fecha_termino, 'dias', lm.dias
      ) order by lm.fecha_inicio desc), '[]'::jsonb)
      from licencias_medicas lm where lm.cliente_id=v_cliente and current_date between lm.fecha_inicio and lm.fecha_termino),
    'movimientos', (
      select coalesce(jsonb_agg(m order by (m->>'fecha') desc), '[]'::jsonb) from (
        select jsonb_build_object('tipo','Contrato','trabajador',(select t.nombres||' '||t.apellidos from trabajadores t where t.id=co.trabajador_id),'detalle',coalesce(co.cargo,''),'fecha',co.fecha_inicio) m
        from contratos co where co.cliente_id=v_cliente and co.tipo_documento='contrato' and co.estado<>'anulado' and co.fecha_inicio >= ((p_periodo||'-01')::date - interval '60 days')
        union all
        select jsonb_build_object('tipo','Anexo','trabajador',(select t.nombres||' '||t.apellidos from trabajadores t where t.id=co.trabajador_id),'detalle',coalesce(co.anexo_tipo,'anexo'),'fecha',coalesce(co.fecha_inicio,co.created_at::date))
        from contratos co where co.cliente_id=v_cliente and co.tipo_documento='anexo' and co.estado<>'anulado' and coalesce(co.fecha_inicio,co.created_at::date) >= ((p_periodo||'-01')::date - interval '60 days')
        union all
        select jsonb_build_object('tipo','Licencia','trabajador',coalesce(lm.trabajador_nombre,''),'detalle',lm.dias||' días','fecha',lm.fecha_inicio)
        from licencias_medicas lm where lm.cliente_id=v_cliente and lm.fecha_inicio >= ((p_periodo||'-01')::date - interval '60 days')
      ) z)
  ) into v_result;
  return v_result;
end $function$;
