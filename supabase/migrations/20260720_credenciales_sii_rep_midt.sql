-- Credenciales adicionales por empresa: SII personal del representante legal
-- (distinta de clave_sii de la empresa) y Mi DT (Direccion del Trabajo).
-- Par usuario/clave igual que previred_*/afc_*/mutual_*. Se manejan en
-- /credenciales (revelar/copiar auditado). Idempotente: ya aplicada en prod.
alter table public.clientes
  add column if not exists sii_rep_rut text,
  add column if not exists sii_rep_clave text,
  add column if not exists midt_rut text,
  add column if not exists midt_clave text;

comment on column public.clientes.sii_rep_rut is 'Usuario (RUT) de la clave SII PERSONAL del representante legal — distinta de clave_sii (empresa). Par con sii_rep_clave.';
comment on column public.clientes.sii_rep_clave is 'Clave SII personal del representante legal. Credencial (revelar/copiar auditado) en /credenciales.';
comment on column public.clientes.midt_rut is 'Usuario (RUT / Clave Unica) del portal Mi DT (Direccion del Trabajo). Par con midt_clave.';
comment on column public.clientes.midt_clave is 'Clave del portal Mi DT (midt.dirtrab.cl). Credencial (revelar/copiar auditado) en /credenciales.';
