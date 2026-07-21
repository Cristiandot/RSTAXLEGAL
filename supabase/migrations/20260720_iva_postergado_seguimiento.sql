-- Seguimiento de cobro del IVA postergado (art. 64 LIVS, 2 meses).
-- Marca de pago para cerrar la deuda + vista consolidada de postergaciones
-- abiertas de toda la cartera, con el vencimiento calculado. Alimenta el panel
-- "IVA postergado — seguimiento de cobro" arriba de la grilla /f29.
alter table ciclo_f29 add column if not exists iva_postergado_pagado_en date;
comment on column ciclo_f29.iva_postergado_pagado_en is
  'Fecha en que el cliente pagó el IVA que había postergado. NULL = deuda de IVA postergado aún pendiente de cobro.';

create or replace view v_iva_postergado as
 SELECT cf.id AS ciclo_id,
    cf.cliente_id,
    c.razon_social,
    c.rut_empresa,
    gc.codigo AS grupo_codigo,
    cf.periodo,
    cf.iva_postergado::bigint AS monto,
    cf.folio_f29,
    cf.iva_postergado_pagado_en,
    -- El F29 vence ~día 20 del mes siguiente (periodo +1 mes +19 días);
    -- postergar 2 meses lo lleva a periodo +3 meses.
    rs_proximo_dia_habil((date_trunc('month'::text, to_date(cf.periodo || '-01'::text, 'YYYY-MM-DD'::text)::timestamp with time zone) + '3 mon'::interval + '19 days'::interval)::date) AS vencimiento
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  WHERE c.activo = true AND COALESCE(cf.iva_postergado, 0::numeric) > 0::numeric;
