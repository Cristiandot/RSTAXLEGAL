-- Fecha de inicio de conciliación por empresa (17-07-2026). Los DTE anteriores a
-- esta fecha se asumen saldados (no arrastran como CxC/CxP ni al flujo). Si es
-- null, se usa una ventana por defecto (12 meses). Ver memoria
-- rstl_conciliacion_bancaria_iniciativa.
alter table public.clientes
  add column if not exists conciliacion_desde date;
