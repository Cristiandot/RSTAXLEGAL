-- Captura interna de recargos, postergación de IVA y convenio de pago por F29.
-- Alimenta el semáforo del portal y (próximo paso) el gráfico del cliente.
-- iva_postergado y postergar_iva ya existían; aquí se suman multa/condonación/convenio.

alter table ciclo_f29
  add column if not exists multa numeric,           -- interés y multa por presentación/pago fuera de plazo
  add column if not exists condonacion numeric,     -- condonación de recargos otorgada por el SII/Tesorería
  add column if not exists convenio_folio text,     -- N° de convenio de pago (Tesorería) que cubre la deuda del período
  add column if not exists convenio_monto numeric;  -- monto de la deuda de este F29 incluido en el convenio

comment on column ciclo_f29.multa is 'Interés y multa por presentación/pago del F29 fuera de plazo.';
comment on column ciclo_f29.condonacion is 'Condonación de recargos aplicada al F29.';
comment on column ciclo_f29.convenio_folio is 'N° de convenio de pago (Tesorería) que cubre la deuda de este período.';
comment on column ciclo_f29.convenio_monto is 'Monto de la deuda de este F29 incluido en el convenio de pago.';

-- Ampliar la vista del checklist F29 para exponer los nuevos campos + el monto
-- de IVA postergado (el booleano postergar_iva ya estaba).
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
            WHEN cf.fecha_pago_f29 IS NOT NULL THEN 'Pagado'::text
            WHEN cf.fecha_pago_oficina IS NOT NULL THEN 'Fondos en RS'::text
            WHEN cf.folio_f29 IS NOT NULL AND btrim(cf.folio_f29) <> ''::text THEN 'Declarado'::text
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
    cf.iva_postergado,
    cf.multa,
    cf.condonacion,
    cf.convenio_folio,
    cf.convenio_monto
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN usuarios u ON u.id = cf.responsable_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  WHERE c.activo = true AND c.hace_f29 = true;

-- Semilla LeBlanc enero-2026: presentado fuera de plazo (dato ya en observaciones).
update ciclo_f29
   set multa = 136204, condonacion = 95343
 where cliente_id = '297d3675-c88c-4072-b747-c7acaafa2f89' and periodo = '2026-01';
