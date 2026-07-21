-- Criterio Cristian 21-07-2026: el SII manda para el pago. Un F29 con folio pero
-- SIN comprobante de pago en el SII y con monto > 0 = "recibida por internet"
-- (giro a Tesorería) → «Giro TGR», AUNQUE la oficina haya registrado un pago
-- (fecha_pago_f29). Pagado en SII, monto 0, o pago SII aún sin verificar (null)
-- → «Declarado». Reemplaza la versión previa donde el pago de oficina ganaba.
create or replace view v_checklist_f29 as
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
            WHEN cf.folio_f29 IS NOT NULL AND btrim(cf.folio_f29) <> ''::text THEN
                CASE
                    WHEN s.pagado IS FALSE AND COALESCE(s.monto, 0::bigint) > 0 THEN 'Giro TGR'::text
                    ELSE 'Declarado'::text
                END
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
    cf.iva_postergado,
    s.estado_id AS sii_estado_id,
    s.estado AS sii_estado,
    s.folio AS sii_folio,
    s.monto AS sii_monto,
    s.declarada AS sii_declarada,
    s.sii_sincronizado_en,
    s.pagado AS sii_pagado,
    s.pago_fecha AS sii_pago_fecha,
    s.pago_monto AS sii_pago_monto
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN usuarios u ON u.id = cf.responsable_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
     LEFT JOIN sii_f29_estado s ON s.cliente_id = cf.cliente_id AND s.periodo = cf.periodo
  WHERE c.activo = true AND c.hace_f29 = true;
