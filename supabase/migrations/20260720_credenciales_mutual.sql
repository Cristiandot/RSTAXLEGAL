-- Credenciales de la mutual (ACHS/IST/Mutual de Seguridad) por empresa.
-- Par usuario/clave igual que previred_* y afc_*. Se manejan en /credenciales
-- (revelar/copiar/editar auditado). Idempotente: ya aplicada en prod vía MCP.
alter table public.clientes
  add column if not exists mutual_rut text,
  add column if not exists mutual_clave text;

comment on column public.clientes.mutual_rut is 'Usuario (RUT) del portal de la mutual (ACHS/IST/Mutual de Seguridad). Par con mutual_clave.';
comment on column public.clientes.mutual_clave is 'Clave del portal de la mutual. Se maneja como credencial (revelar/copiar auditado) en /credenciales.';
