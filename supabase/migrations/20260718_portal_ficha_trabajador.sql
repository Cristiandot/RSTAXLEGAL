-- Ficha por trabajador para el portal del cliente.
-- Consolida datos base + contrato vigente + anexos + licencias + amonestaciones +
-- permisos + finiquitos + liquidaciones + saldo de vacaciones, para un trabajador
-- del cliente dueño del token. Enlace por trabajador_id y, para las tablas de
-- enlace débil (solicitudes_rrhh, licencias_medicas), también por RUT normalizado.

create or replace function public.portal_ficha_trabajador(p_token text, p_trabajador_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cliente uuid;
  v_rut_norm text;
  v_result jsonb;
  t trabajadores%rowtype;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link de solicitud inválido'; end if;

  select * into t from trabajadores where id = p_trabajador_id and cliente_id = v_cliente;
  if t.id is null then raise exception 'Trabajador no encontrado'; end if;

  v_rut_norm := nullif(regexp_replace(lower(coalesce(t.rut, '')), '[^0-9k]', '', 'g'), '');

  with uc as (
    select co.cargo, co.tipo_contrato, co.fecha_inicio, co.fecha_vencimiento
    from contratos co
    where co.trabajador_id = t.id and co.tipo_documento = 'contrato' and co.estado <> 'anulado'
    order by co.fecha_inicio desc nulls last, co.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'trabajador', jsonb_build_object(
      'id', t.id,
      'nombre', nullif(trim(coalesce(t.nombres, '') || ' ' || coalesce(t.apellidos, '')), ''),
      'rut', t.rut,
      'rut_provisorio', t.rut_provisorio,
      'cargo', coalesce((select cargo from uc), t.cargo),
      'sucursal', t.sucursal,
      'tipo_contrato', coalesce((select tipo_contrato from uc), t.tipo_contrato),
      'fecha_ingreso', coalesce((select fecha_inicio from uc), t.fecha_ingreso),
      'fecha_termino', coalesce((select fecha_vencimiento from uc), t.fecha_termino_contrato),
      'sueldo_base', t.sueldo_base,
      'jornada_tipo', t.jornada_tipo,
      'horas_semanales', t.horas_semanales,
      'afp', t.afp,
      'salud', t.salud,
      'correo', t.correo,
      'fono', t.fono,
      'comuna', t.comuna,
      'direccion', t.direccion,
      'activo', t.activo
    ),
    'contrato', (
      select jsonb_build_object(
        'id', co.id, 'cargo', co.cargo, 'tipo_contrato', co.tipo_contrato,
        'fecha_inicio', co.fecha_inicio, 'fecha_vencimiento', co.fecha_vencimiento,
        'estado', co.estado, 'documento_path', co.documento_path, 'created_at', co.created_at)
      from contratos co
      where co.trabajador_id = t.id and co.tipo_documento = 'contrato' and co.estado <> 'anulado'
      order by co.fecha_inicio desc nulls last, co.created_at desc
      limit 1
    ),
    'anexos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', co.id, 'anexo_tipo', co.anexo_tipo, 'anexo_detalle', co.anexo_detalle,
        'fecha', coalesce(co.anexo_fecha, co.fecha_inicio, co.created_at::date),
        'estado', co.estado, 'documento_path', co.documento_path)
        order by coalesce(co.anexo_fecha, co.fecha_inicio, co.created_at::date) desc), '[]'::jsonb)
      from contratos co
      where co.trabajador_id = t.id and co.tipo_documento = 'anexo' and co.estado <> 'anulado'
    ),
    'licencias', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', lm.id, 'tipo', lm.tipo, 'folio', lm.folio, 'dias', lm.dias,
        'fecha_inicio', lm.fecha_inicio, 'fecha_termino', lm.fecha_termino,
        'estado', lm.estado, 'en_planilla', lm.en_planilla)
        order by lm.fecha_inicio desc), '[]'::jsonb)
      from licencias_medicas lm
      where lm.cliente_id = v_cliente and (
        lm.trabajador_id = t.id
        or (v_rut_norm is not null and regexp_replace(lower(coalesce(lm.trabajador_rut, '')), '[^0-9k]', '', 'g') = v_rut_norm)
      )
    ),
    'amonestaciones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'fecha', s.created_at, 'estado', s.estado,
        'detalle', coalesce(s.observaciones, s.datos->>'motivo', s.datos->>'detalle', s.datos->>'hechos'),
        'documento_path', s.documento_path)
        order by s.created_at desc), '[]'::jsonb)
      from solicitudes_rrhh s
      where s.cliente_id = v_cliente and s.tipo = 'amonestacion' and (
        s.trabajador_id = t.id
        or (v_rut_norm is not null and regexp_replace(lower(coalesce(s.trabajador_rut, '')), '[^0-9k]', '', 'g') = v_rut_norm)
      )
    ),
    'permisos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'fecha', s.created_at, 'estado', s.estado,
        'detalle', coalesce(s.observaciones, s.datos->>'motivo', s.datos->>'detalle'),
        'documento_path', s.documento_path)
        order by s.created_at desc), '[]'::jsonb)
      from solicitudes_rrhh s
      where s.cliente_id = v_cliente and s.tipo = 'permiso' and (
        s.trabajador_id = t.id
        or (v_rut_norm is not null and regexp_replace(lower(coalesce(s.trabajador_rut, '')), '[^0-9k]', '', 'g') = v_rut_norm)
      )
    ),
    'finiquitos', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'fecha', s.created_at, 'estado', s.estado, 'documento_path', s.documento_path)
        order by s.created_at desc), '[]'::jsonb)
      from solicitudes_rrhh s
      where s.cliente_id = v_cliente and s.tipo = 'finiquito' and (
        s.trabajador_id = t.id
        or (v_rut_norm is not null and regexp_replace(lower(coalesce(s.trabajador_rut, '')), '[^0-9k]', '', 'g') = v_rut_norm)
      )
    ),
    'liquidaciones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'periodo', l.periodo, 'liquido', l.liquido, 'estado', l.estado)
        order by l.periodo desc), '[]'::jsonb)
      from (
        select periodo, liquido, estado
        from liquidacion
        where trabajador_id = t.id and cliente_id = v_cliente
        order by periodo desc
        limit 12
      ) l
    ),
    'vacaciones_saldo', (
      select vs.dias
      from vac_saldos vs
      where vs.trabajador_id = t.id and vs.cliente_id = v_cliente
      order by vs.periodo desc
      limit 1
    )
  ) into v_result;

  return v_result;
end
$function$;

grant execute on function public.portal_ficha_trabajador(text, uuid) to anon, authenticated;
