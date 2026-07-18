-- Cobranza (18-07-2026): plantilla editable por empresa + registro de actividad
-- (la columna "última gestión hace X días" del patrón Chipax).

-- Texto introductorio del correo de estado de pago; null = redacción estándar.
alter table public.clientes
  add column if not exists cobranza_texto text;

-- Cada envío de estado de pago queda registrado por empresa+deudor.
create table if not exists public.cobranza_actividad (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes(id) on delete cascade,
  rut_deudor  text not null,
  correo      text not null,
  docs        integer not null,
  total       bigint not null,
  enviado_por uuid references public.usuarios(id),
  created_at  timestamptz not null default now()
);
create index if not exists cobranza_actividad_deudor_idx
  on public.cobranza_actividad (cliente_id, rut_deudor, created_at desc);

alter table public.cobranza_actividad enable row level security;
create policy "Autenticados ven cobranza_actividad"   on public.cobranza_actividad for select to authenticated using (true);
create policy "Autenticados crean cobranza_actividad" on public.cobranza_actividad for insert to authenticated with check (true);
