-- Estado «Declarado, folio pendiente»: permite dar por declarado el F29 aunque
-- todavía no se tenga el folio del SII (no siempre se captura al momento de
-- pagar). La marca es una casilla manual e independiente del folio y de
-- fecha_f29_presentado (este último quedó contaminado por flujos antiguos —hay
-- ciclos con presentado poblado que en realidad solo fueron enviados—, por eso
-- NO se usa como señal de declaración). Con folio el estado es «Declarado»
-- pleno; con la casilla y sin folio, «Declarado, folio pendiente». Un F29
-- declarado (por folio o casilla) puede avanzar a «Fondos en RS»/«Pagado» aun
-- sin folio (criterio Cristian 20-07-2026, releva la regla dura del 17-07-2026
-- que exigía folio para pagar).
alter table ciclo_f29
  add column if not exists declarado_sin_folio boolean not null default false;

comment on column ciclo_f29.declarado_sin_folio is
  'Marca manual: el F29 quedó declarado en el SII pero aún no se carga el folio. Da el estado «Declarado, folio pendiente» y habilita el pago. Al cargar el folio, el estado sube a «Declarado».';

-- Base: definición viva de la vista (post grupo_codigo_en_vistas_ciclos); se
-- agrega la rama «Declarado, folio pendiente» y se expone declarado_sin_folio.
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
            WHEN cf.declarado_sin_folio THEN 'Declarado, folio pendiente'::text
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
