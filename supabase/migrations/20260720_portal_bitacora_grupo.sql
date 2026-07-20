-- Bitácora de gestiones del grupo para el portal del cliente (vista "Todas").
-- Timeline unificado de gestiones RRHH (solicitudes_rrhh) + requerimientos
-- ingresados por WhatsApp/correo (tareas_oficina), agregando todas las empresas
-- del grupo. Validado por el form_token del grupo (igual que portal_grupo).

create or replace function public.portal_bitacora_grupo(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_grupo uuid;
  v_result jsonb;
begin
  select id into v_grupo from grupos_cliente where form_token = p_token;
  if v_grupo is null then raise exception 'Link de portal inválido'; end if;

  with items as (
    select
      'gestion'::text as fuente,
      s.created_at as fecha,
      s.tipo as tipo,
      nullif(trim(coalesce(s.trabajador_nombre, '')), '') as trabajador,
      c.razon_social as empresa,
      s.estado as estado,
      null::text as canal,
      null::text as detalle
    from solicitudes_rrhh s
    join clientes c on c.id = s.cliente_id
    where c.grupo_id = v_grupo

    union all

    select
      'requerimiento'::text,
      t.created_at,
      coalesce(nullif(trim(t.titulo), ''), 'Requerimiento'),
      null,
      (select cc.razon_social from clientes cc where cc.id = t.cliente_id),
      t.estado,
      t.canal,
      nullif(trim(t.detalle), '')
    from tareas_oficina t
    where t.grupo_id = v_grupo
       or t.cliente_id in (select id from clientes where grupo_id = v_grupo)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'fuente', fuente,
      'fecha', fecha,
      'tipo', tipo,
      'trabajador', trabajador,
      'empresa', empresa,
      'estado', estado,
      'canal', canal,
      'detalle', detalle
    ) order by fecha desc), '[]'::jsonb)
  into v_result
  from (select * from items order by fecha desc limit 300) x;

  return v_result;
end
$function$;

grant execute on function public.portal_bitacora_grupo(text) to anon, authenticated;
