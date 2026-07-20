-- "Otros accesos": credenciales sin columna estandar en clientes (ERP, KAME,
-- banco, correo, CCAF, IST, accesos alternativos, etc.). Se manejan en
-- /credenciales (revelar/copiar auditado). Idempotente: ya aplicada en prod.
create table if not exists public.credenciales_extra (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  sistema text not null,
  usuario text,
  clave text,
  url text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_credenciales_extra_cliente on public.credenciales_extra(cliente_id);

comment on table public.credenciales_extra is 'Accesos sin columna estandar en clientes (ERP, KAME, banco, correo, CCAF, IST, accesos alternativos, etc.). Se manejan en /credenciales (revelar/copiar auditado).';

alter table public.credenciales_extra enable row level security;

drop policy if exists "Autenticados ven credenciales_extra" on public.credenciales_extra;
drop policy if exists "Autenticados crean credenciales_extra" on public.credenciales_extra;
drop policy if exists "Autenticados actualizan credenciales_extra" on public.credenciales_extra;
drop policy if exists "Autenticados borran credenciales_extra" on public.credenciales_extra;

create policy "Autenticados ven credenciales_extra" on public.credenciales_extra for select to authenticated using (true);
create policy "Autenticados crean credenciales_extra" on public.credenciales_extra for insert to authenticated with check (true);
create policy "Autenticados actualizan credenciales_extra" on public.credenciales_extra for update to authenticated using (true) with check (true);
create policy "Autenticados borran credenciales_extra" on public.credenciales_extra for delete to authenticated using (true);
