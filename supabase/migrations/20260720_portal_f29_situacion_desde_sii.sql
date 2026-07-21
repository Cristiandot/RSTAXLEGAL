-- La "Situación de tus F29" del portal cliente (solicitud/[token] → alertas.tsx)
-- ahora usa como FUENTE DE VERDAD lo declarado en el SII (sii_f29_estado),
-- con el trabajo de oficina (ciclo_f29) como fallback cuando aún no hay dato SII.
-- 20-07-2026. Overlays de oficina (observada, IVA postergado) mantienen prioridad.
create or replace function public.portal_f29_situacion(p_token text, p_anio integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid; v_anio text := p_anio::text; v_res jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'periodo', m.p,
      'estado', case
        -- overlays de oficina (mandan sobre todo)
        when obs.periodo is not null then 'observada'
        when cf.postergar_iva is true then 'postergado'
        -- SII como fuente de verdad de la declaración
        when s.declarada then 'declarada'
        when s.estado_id = 10 then 'guardada'                         -- borrador guardado en el SII
        when s.periodo is not null then 'sin_declarar'                -- SII conoce el periodo y no hay vigente
        -- fallback trabajo de oficina (sin dato SII para el periodo)
        when cf.folio_f29 is not null and btrim(cf.folio_f29) <> '' then 'declarada'
        when cf.declarado_sin_folio is true then 'declarada'
        when cf.fecha_pago_f29 is not null then 'guardada'
        when cf.fecha_pago_oficina is not null then 'guardada'
        when cf.fecha_correo_f29_enviado is not null then 'guardada'
        else 'sin_declarar'
      end
    ) order by m.p
  ), '[]'::jsonb)
  into v_res
  from (select v_anio||'-'||lpad(g::text,2,'0') as p from generate_series(1,12) g) m
  left join ciclo_f29 cf on cf.cliente_id = v_cliente and cf.periodo = m.p
  left join sii_f29_estado s on s.cliente_id = v_cliente and s.periodo = m.p
  left join f29_situacion obs on obs.cliente_id = v_cliente and obs.periodo = m.p and obs.estado = 'observada';

  return jsonb_build_object('anio', p_anio, 'periodos', v_res);
end $function$;