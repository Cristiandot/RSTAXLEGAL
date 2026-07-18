-- Módulo BANCO / CONCILIACIÓN (17-07-2026) — "Chipax propio".
-- El panel ya agrega Ingresos y Egresos (rcv_ventas, rcv_compras,
-- honorarios_recibidos, liquidacion, ciclo_f29). Falta la pata Banco: el cliente
-- aporta su cartola (upload manual) y el sistema concilia los movimientos contra
-- los DTE/pagos que ya tenemos. F1 = tablas + ingesta (Mercado Pago + genérico)
-- + bandeja de conciliación interna. Ver memoria rstl_conciliacion_bancaria_iniciativa.
--
-- Nombres con prefijo banco_ para NO chocar con rcv.cuenta_id (que apunta a
-- plan_cuentas, concepto contable distinto). Montos en bigint (pesos), como el
-- resto del panel. Aditiva: no toca ninguna tabla existente.

-- ─────────────────────────────────────────────────────────────────────────────
-- Cuentas bancarias del cliente (una empresa puede tener varias).
create table if not exists public.banco_cuenta (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  -- fuente = qué formato de cartola trae. Define el parser. Ej: mercadopago,
  -- banco_chile, bci, santander, banco_estado, bice, itau, scotiabank,
  -- falabella, security, bbva, generico (mapeo de columnas manual).
  fuente        text not null,
  banco_nombre  text,                 -- nombre para mostrar (ej. "Banco de Chile")
  alias         text,                 -- alias que le pone el cliente/oficina
  tipo_cuenta   text,                 -- corriente | vista | chequera_electronica | prepago...
  numero_cuenta text,
  moneda        text not null default 'CLP',
  saldo_actual  bigint,               -- último saldo conocido (informativo)
  saldo_fecha   date,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Movimientos de cartola. cargo/abono positivos (uno de los dos en 0), estilo
-- Chipax; monto = abono - cargo (generado) para ordenar/sumar fácil.
create table if not exists public.banco_movimiento (
  id                 uuid primary key default gen_random_uuid(),
  cuenta_id          uuid not null references public.banco_cuenta(id) on delete cascade,
  cliente_id         uuid not null references public.clientes(id) on delete cascade,  -- denormalizado (RLS/consultas)
  fecha              date not null,             -- fecha local Chile
  fecha_hora         timestamptz,               -- timestamp original si la fuente lo trae
  glosa              text,                       -- tipo de operación / descripción
  descripcion        text,                       -- detalle extra
  rut_contraparte    text,                       -- si la cartola lo trae (bancos sí, MP no)
  nombre_contraparte text,
  referencia         text,                       -- nº de movimiento / operación
  referencia_grupo   text,                       -- agrupa líneas del mismo hecho (MP: operación relacionada)
  abono              bigint not null default 0,  -- entra plata (>=0)
  cargo              bigint not null default 0,  -- sale plata (>=0)
  monto              bigint generated always as (abono - cargo) stored,
  saldo              bigint,                      -- saldo contable de la línea si viene
  categoria          text,                        -- auto: comision | impuesto | transferencia_interna | ...
  estado             text not null default 'pendiente'
                       check (estado in ('pendiente','conciliado','parcial','ignorado')),
  hash               text not null,               -- dedup: subir 2 veces la misma cartola no duplica
  fuente             text,                        -- copia de banco_cuenta.fuente (conveniencia)
  archivo_origen     text,
  importado_por      uuid references public.usuarios(id),
  created_at         timestamptz not null default now(),
  unique (cuenta_id, hash)
);

create index if not exists banco_movimiento_cliente_fecha_idx on public.banco_movimiento (cliente_id, fecha desc);
create index if not exists banco_movimiento_cuenta_fecha_idx  on public.banco_movimiento (cuenta_id, fecha desc);
create index if not exists banco_movimiento_estado_idx        on public.banco_movimiento (cliente_id, estado);

-- ─────────────────────────────────────────────────────────────────────────────
-- Conciliación: vínculo movimiento ↔ documento. monto_asignado permite
-- conciliación parcial y 1 movimiento contra varios documentos (y viceversa).
create table if not exists public.banco_conciliacion (
  id             uuid primary key default gen_random_uuid(),
  movimiento_id  uuid not null references public.banco_movimiento(id) on delete cascade,
  cliente_id     uuid not null references public.clientes(id) on delete cascade,
  -- a qué se concilia. doc_id apunta al id de la tabla según doc_tipo; null para
  -- ajustes / sin documento (comisiones, transferencias internas, etc.).
  doc_tipo       text not null
                   check (doc_tipo in ('venta','compra','honorario','factura_rs',
                                       'remuneracion','impuesto','transferencia_interna',
                                       'comision','ajuste','sin_documento')),
  doc_id         uuid,
  doc_ref        text,                       -- folio/glosa para mostrar cuando no hay doc_id
  monto_asignado bigint not null,
  origen         text not null default 'manual' check (origen in ('auto','manual')),
  nota           text,
  creado_por     uuid references public.usuarios(id),
  created_at     timestamptz not null default now()
);

create index if not exists banco_conciliacion_mov_idx on public.banco_conciliacion (movimiento_id);
create index if not exists banco_conciliacion_doc_idx on public.banco_conciliacion (cliente_id, doc_tipo, doc_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: mismo patrón del panel (la oficina, rol authenticated, ve/gestiona todo).
-- El acceso del cliente (anon vía token) llegará en F3 con RPCs security definer.
alter table public.banco_cuenta       enable row level security;
alter table public.banco_movimiento   enable row level security;
alter table public.banco_conciliacion enable row level security;

do $$
declare t text;
begin
  foreach t in array array['banco_cuenta','banco_movimiento','banco_conciliacion']
  loop
    execute format('create policy "Autenticados ven %1$s"        on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "Autenticados crean %1$s"      on public.%1$s for insert to authenticated with check (true);', t);
    execute format('create policy "Autenticados actualizan %1$s" on public.%1$s for update to authenticated using (true) with check (true);', t);
    execute format('create policy "Autenticados borran %1$s"     on public.%1$s for delete to authenticated using (true);', t);
  end loop;
end $$;
