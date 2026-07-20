-- Documentos por trabajador emitidos por la oficina (panel interno):
-- contrato, liquidación, anexo, etc. Cada documento puede requerir firma y
-- quedar pendiente hasta que vuelve firmado. Archivos en el bucket `contratos`.

create table if not exists public.documentos_trabajador (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  trabajador_id uuid not null references trabajadores(id) on delete cascade,
  tipo text not null,                                   -- contrato | liquidacion | anexo | amonestacion | finiquito | otro
  resena text,
  documento_path text not null,                         -- bucket contratos
  requiere_firma boolean not null default false,
  estado_firma text not null default 'no_aplica',       -- no_aplica | pendiente | firmado
  documento_firmado_path text,
  firmado_at timestamptz,
  subido_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists documentos_trabajador_trab_idx on public.documentos_trabajador(trabajador_id);
create index if not exists documentos_trabajador_cliente_idx on public.documentos_trabajador(cliente_id);

alter table public.documentos_trabajador enable row level security;

create policy "Autenticados ven documentos_trabajador"
  on public.documentos_trabajador for select to authenticated using (true);
create policy "Autenticados crean documentos_trabajador"
  on public.documentos_trabajador for insert to authenticated with check (true);
create policy "Autenticados actualizan documentos_trabajador"
  on public.documentos_trabajador for update to authenticated using (true) with check (true);
create policy "Admins borran documentos_trabajador"
  on public.documentos_trabajador for delete to authenticated using (es_admin());
