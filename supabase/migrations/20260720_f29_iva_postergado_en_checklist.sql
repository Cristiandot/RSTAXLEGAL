-- Postergación de IVA EJERCIDA en el módulo F29: el monto vive en
-- ciclo_f29.iva_postergado (ya existía — lo escribe también el checklist RCV
-- como «IVA Postergado, art. 64 bis»); aquí solo se expone en v_checklist_f29
-- para que el modal de /f29 lo edite y el comprobante de pago informe que se
-- pagó solo lo no postergable (caso Lúcumo 2026-06: postergó el IVA y pagó
-- solo el PPM — criterio Cristian 20-07-2026). Distinto de postergar_iva
-- (booleano), que solo OFRECE la opción en el aviso del paso 1.
--
-- NOTA: en prod esto corrió en dos pasos (f29_iva_postergado_en_checklist +
-- f29_iva_postergado_checklist_fix_estado): la primera versión de este archivo
-- partió de una definición anterior de la vista y pisó la cascada de estados
-- de f29_pagado_folio_pendiente; el fix la restauró. Este archivo contiene la
-- definición FINAL (cascada vigente + iva_postergado al final).
comment on column ciclo_f29.iva_postergado is
  'Monto del IVA postergado al declarar el F29 (postergación ejercida, art. 64 LIVS / Pro Pyme). Null o 0 = no se postergó. El comprobante de pago descuenta este monto de lo pagado y le informa al cliente el nuevo plazo (día 20 + 2 meses, corrido al hábil).';

-- Prioridad del estado (mayor gana) — igual que f29_pagado_folio_pendiente:
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
    cf.declarado_sin_folio,
    cf.iva_postergado
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN usuarios u ON u.id = cf.responsable_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  WHERE c.activo = true AND c.hace_f29 = true;
