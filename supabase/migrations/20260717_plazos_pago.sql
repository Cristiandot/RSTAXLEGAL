-- Plazos de pago por empresa (17-07-2026) — para Cuentas por Cobrar/Pagar y Flujo.
-- El RCV del SII trae la fecha del documento pero NO la condición de pago, así que
-- el vencimiento se estima: vencimiento = fecha_docto + plazo. Plazo por defecto
-- distinto por dirección (ventas vs compras), editable por empresa. (Patrón Chipax
-- "Plazos de pago": Clientes 15 días, Proveedores 30 días.) Ver memoria
-- rstl_conciliacion_bancaria_iniciativa.
alter table public.clientes
  add column if not exists plazo_pago_ventas  integer not null default 15,
  add column if not exists plazo_pago_compras integer not null default 30;
