-- Automatizaciones de conciliación por empresa (18-07-2026), patrón Chipax
-- (Ajustes → Automatizaciones → Conciliación): cada criterio de match se puede
-- auto-conciliar solo, con opt-in por empresa y contador de ejecuciones.
--   rut   : monto exacto + RUT contraparte + candidato único (ON por defecto —
--           es el comportamiento que ya tenía el cruce automático)
--   folio : folio del documento aparece en la glosa + monto exacto (opt-in)
--   panel : el pago calza con un registro propio del panel — F29, Previred,
--           remuneraciones del período (opt-in)
--   monto : monto exacto con candidato único aunque no haya RUT (opt-in, el
--           más agresivo)
alter table public.clientes
  add column if not exists auto_conc_rut   boolean not null default true,
  add column if not exists auto_conc_folio boolean not null default false,
  add column if not exists auto_conc_panel boolean not null default false,
  add column if not exists auto_conc_monto boolean not null default false;

-- Con qué criterio se concilió (rut/folio/panel/monto/manual) — alimenta el
-- contador de ejecuciones por automatización.
alter table public.banco_conciliacion
  add column if not exists criterio text;
