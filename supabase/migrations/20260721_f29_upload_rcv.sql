-- Resumen del RCV por tipo de documento para armar el archivo UPLOAD F29
-- (botón "Generar TXT F29 para SII" del modal /f29). Incluye lo que las vistas
-- v_rcv_*_resumen no traen: cantidad real de boletas (n_documentos del resumen
-- de boletas) y el desglose de activo fijo / IVA no recuperable de compras.
create or replace view public.v_f29_upload_rcv
with (security_invoker = true) as
select
  v.cliente_id,
  v.periodo,
  'venta'::text as libro,
  v.tipo_doc,
  sum(coalesce(v.n_documentos, 1))::bigint as docs,
  -- Resumen de boletas sin cantidad de documentos: el código 110 (cantidad)
  -- no se puede llenar y hay que completarlo en la pantalla del SII.
  bool_or(v.folio = 'RESUMEN' and v.n_documentos is null) as docs_incompletos,
  coalesce(sum(v.monto_neto), 0)::numeric as neto,
  coalesce(sum(v.monto_exento), 0)::numeric as exento,
  coalesce(sum(v.monto_iva), 0)::numeric as iva,
  0::numeric as iva_activo_fijo,
  0::bigint as docs_activo_fijo,
  0::numeric as iva_no_recuperable,
  0::numeric as iva_uso_comun
from public.rcv_ventas v
group by v.cliente_id, v.periodo, v.tipo_doc
union all
select
  c.cliente_id,
  c.periodo,
  'compra'::text,
  c.tipo_doc,
  count(*)::bigint,
  false,
  coalesce(sum(c.monto_neto), 0),
  coalesce(sum(c.monto_exento), 0),
  coalesce(sum(c.iva_recuperable), 0),
  coalesce(sum(c.iva_activo_fijo), 0),
  (count(*) filter (where c.iva_activo_fijo <> 0))::bigint,
  coalesce(sum(c.iva_no_recuperable), 0),
  coalesce(sum(c.iva_uso_comun), 0)
from public.rcv_compras c
group by c.cliente_id, c.periodo, c.tipo_doc;
