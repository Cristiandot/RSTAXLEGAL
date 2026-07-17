-- Favoritos del sidebar por usuario.
-- NULL = el usuario nunca los configuró (el sidebar cae al set por defecto
-- FAVORITOS de lib/modules.ts). Un array vacío = los limpió a propósito.
alter table public.usuarios
  add column if not exists favoritos text[];

comment on column public.usuarios.favoritos is
  'Keys de módulos (lib/modules.ts) marcados como favoritos por el usuario. NULL = nunca los configuró (fallback al set por defecto).';
