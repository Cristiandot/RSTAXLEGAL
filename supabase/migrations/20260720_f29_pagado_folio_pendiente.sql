-- F29: nuevo estado "Pagado, folio pendiente" + se levanta el bloqueo de pagar
-- sin declarar (criterio Cristian 20-07-2026, releva el resguardo del mismo día).
--
-- Contexto: RS a veces paga el F29 en el SII antes de tener a mano el folio. El
-- resguardo previo impedía marcar "pagado" sin folio (o sin la casilla
-- "Declarado, folio pendiente"), lo que trababa el flujo. Ahora se permite pagar
-- sin folio y el estado lo refleja: si está pagado pero aún sin folio, muestra
-- "Pagado, folio pendiente" (recordatorio de cargar el folio); al cargar el
-- folio pasa a "Declarado" (estado terminal, folio manda sobre todo).
--
-- Prioridad del estado (mayor gana):
--   1. Declarado                 → folio_f29 presente
--   2. Pagado, folio pendiente   → fecha_pago_f29 presente pero sin folio
--   3. Declarado, folio pendiente→ declarado_sin_folio = true (marca manual)
--   4. Fondos en RS              → fecha_pago_oficina
--   5. Guardado y enviado        → fecha_correo_f29_enviado
--   6. Pendiente presentación    → fecha_f29_armado
--   7. Sin iniciar
create or replace view public.v_checklist_f29 as
 SELECT cf.id AS ciclo_id,
    c.id AS cliente_id,
    c.razon_social,
    c.rut_empresa,
    c.previred_rut,
    c.hace_liquidaciones,
    c.es_profesional_salud,
    c.kame_cert_estado,
    c.rubro,
    cf.periodo,
    cf.responsable_id,
    u.nombre AS responsable,
    cf.fecha_f29_armado,
    cf.fecha_f29_presentado,
    cf.monto_a_pagar,
    cf.folio_f29,
    cf.pago_por,
    cf.observaciones,
        CASE
            WHEN cf.folio_f29 IS NOT NULL AND btrim(cf.folio_f29) <> ''::text THEN 'Declarado'::text
            WHEN cf.fecha_pago_f29 IS NOT NULL THEN 'Pagado, folio pendiente'::text
            WHEN cf.declarado_sin_folio THEN 'Declarado, folio pendiente'::text
            WHEN cf.fecha_pago_oficina IS NOT NULL THEN 'Fondos en RS'::text
            WHEN cf.fecha_correo_f29_enviado IS NOT NULL THEN 'Guardado y enviado'::text
            WHEN cf.fecha_f29_armado IS NOT NULL THEN 'Pendiente presentación'::text
            ELSE 'Sin iniciar'::text
        END AS estado,
    (EXISTS ( SELECT 1
           FROM ciclo_conciliacion cc
          WHERE cc.cliente_id = c.id AND cc.periodo = cf.periodo AND cc.fecha_conciliacion_kame_ok IS NOT NULL)) AS conciliacion_ok,
    rs_proximo_dia_habil((date_trunc('month'::text, to_date(cf.periodo || '-01'::text, 'YYYY-MM-DD'::text)::timestamp with time zone) + '1 mon'::interval + '19 days'::interval)::date) AS plazo_f29,
    rs_proximo_dia_habil((date_trunc('month'::text, to_date(cf.periodo || '-01'::text, 'YYYY-MM-DD'::text)::timestamp with time zone) + '1 mon'::interval + '19 days'::interval)::date) - CURRENT_DATE AS dias_restantes_f29,
    cf.fecha_pago_oficina,
    cf.ppm,
    c.correo_empresa,
    cf.fecha_correo_f29_enviado,
    cf.numero_operacion,
    cf.fecha_pago_f29,
    cf.fecha_correo_pago_enviado,
    cf.postergacion_monto,
    cf.comentario_correo,
    cf.monto_iva,
    cf.imp_unico,
    cf.monto_retenciones,
    cf.monto_otros,
    gc.codigo AS grupo_codigo,
    cf.postergar_iva,
    cf.multa,
    cf.condonacion,
    cf.declarado_sin_folio
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN usuarios u ON u.id = cf.responsable_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  WHERE c.activo = true AND c.hace_f29 = true;
