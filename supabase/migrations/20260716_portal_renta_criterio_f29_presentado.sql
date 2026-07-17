-- Criterio de "F29 declarado" en la renta proyectada del portal del cliente.
--
-- REGLA DE NEGOCIO (Cristian, 16-07-2026): la información financiera que ve el
-- cliente sale de lo que informa el SII, NO de las anotaciones internas de la
-- oficina. El registro interno de ciclo_f29 (fecha_f29_armado / _presentado,
-- estados "Guardado y enviado" / "Pagado", etc.) ordena el trabajo interno y se
-- deja como está; pero para la proyección de renta, si en el Servicio no hay
-- nada, no se cuenta PPM aunque internamente figure "declarado" (= declaración
-- guardada para que el cliente pague).
--
-- Antes el criterio era `ppm is not null`, y antes de eso se intentó
-- `fecha_f29_presentado`. Ambos son campos INTERNOS y pueden diverger del SII
-- (caso LeBlanc mayo: figuraba presentado sin respaldo en el Servicio). El único
-- marcador que existe hoy y que sólo se puebla cuando el F29 está efectivamente
-- en el SII es el FOLIO real del F29 (`folio_f29`), que emite el Servicio al
-- presentar. Una declaración guardada como borrador no tiene folio.
--
-- Por eso la proyección cuenta un período (PPM y "declarado") sólo cuando hay
-- folio del SII. Consecuencia operativa: para que el panel financiero de un
-- cliente muestre su renta con datos completos hay que bajar sus F29 del SII
-- (que es lo que puebla folio + PPM real). Mientras no se bajen, sólo cuentan
-- los períodos confirmados en el Servicio. Para LeBlanc eso da sólo enero-2026.

create or replace function public.portal_renta_proyectada(p_token text, p_anio integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_cliente uuid; v_anio text := p_anio::text;
        v_meses int; v_suma bigint; v_anual bigint; v_renta bigint; v_ppm bigint;
        v_declarados text[]; v_esperados text[]; v_pendientes text[]; v_tasa numeric := 0.125;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select count(*), coalesce(sum(resultado),0) into v_meses, v_suma from (
    select l.periodo,
      coalesce((select sum(monto_total) from rcv_ventas v where v.cliente_id=v_cliente and v.periodo=l.periodo),0)
      - coalesce((select sum(monto_total) from rcv_compras c where c.cliente_id=v_cliente and c.periodo=l.periodo),0)
      - sum(total_haberes+coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)) as resultado
    from liquidacion l where l.cliente_id=v_cliente and l.periodo like v_anio||'-%'
    group by l.periodo
  ) t;

  v_anual := case when v_meses>0 then round(v_suma::numeric / v_meses * 12) else 0 end;
  v_renta := round(v_anual * v_tasa);

  -- PPM acumulado: sólo de F29 confirmados en el SII (con folio real).
  select coalesce(sum(ppm),0) into v_ppm from ciclo_f29
    where cliente_id=v_cliente and periodo like v_anio||'-%' and folio_f29 is not null;

  -- Declarados = F29 con folio del SII (lo que informa el Servicio, no lo interno).
  select array_agg(periodo order by periodo) into v_declarados from ciclo_f29
    where cliente_id=v_cliente and periodo like v_anio||'-%' and folio_f29 is not null;
  select array_agg(distinct periodo order by periodo) into v_esperados from rcv_ventas where cliente_id=v_cliente and periodo like v_anio||'-%';
  select array_agg(p order by p) into v_pendientes from (select unnest(v_esperados) p except select unnest(coalesce(v_declarados,'{}'))) x;

  return jsonb_build_object(
    'anio', p_anio, 'tasa_pct', 12.5,
    'meses_completos', v_meses,
    'resultado_periodo', v_suma,
    'resultado_anualizado', v_anual,
    'renta_estimada', v_renta,
    'ppm_acumulado', v_ppm,
    'renta_a_pagar', v_renta - v_ppm,
    'f29_declarados', coalesce(v_declarados,'{}'),
    'f29_pendientes', coalesce(v_pendientes,'{}')
  );
end $function$;
