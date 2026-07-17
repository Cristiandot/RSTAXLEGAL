-- Acceso al portal por grupo: slug legible + PIN de 4 dígitos, con bloqueo
-- anti-fuerza-bruta. El slug es adivinable (nombre del cliente) pero solo lleva
-- a la pantalla de PIN; el PIN protege los datos. El token aleatorio interno
-- (grupos_cliente.form_token) sigue siendo la llave real: portal_unlock lo
-- devuelve al validar y la app lo guarda en cookie de sesión.

-- pgcrypto para hashear el PIN (bcrypt). En Supabase suele estar en extensions;
-- las funciones usan search_path 'public, extensions' y llaman crypt/gen_salt
-- SIN prefijo, así resuelve esté donde esté instalada.
create extension if not exists pgcrypto with schema extensions;

alter table grupos_cliente
  add column if not exists portal_slug text unique,
  add column if not exists portal_pin_hash text;

create table if not exists portal_intentos (
  id bigint generated always as identity primary key,
  slug text not null,
  ip text,
  creado_at timestamptz not null default now()
);
create index if not exists idx_portal_intentos_slug_ts
  on portal_intentos (slug, creado_at);
alter table portal_intentos enable row level security; -- sin policies = deny all

create or replace function public.portal_set_pin(p_grupo_id uuid, p_slug text, p_pin text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'El PIN debe ser exactamente 4 dígitos';
  end if;
  update grupos_cliente set
    portal_slug = lower(trim(p_slug)),
    portal_pin_hash = crypt(p_pin, gen_salt('bf'))
  where id = p_grupo_id;
  if not found then raise exception 'Grupo no encontrado'; end if;
end $function$;

revoke execute on function public.portal_set_pin(uuid, text, text) from anon;
grant execute on function public.portal_set_pin(uuid, text, text) to authenticated, service_role;

create or replace function public.portal_unlock(p_slug text, p_pin text, p_ip text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_g public.grupos_cliente;
  v_fallos int;
  v_max int := 5;
begin
  select * into v_g from grupos_cliente where portal_slug = lower(trim(p_slug));
  if v_g.id is null or v_g.portal_pin_hash is null or v_g.form_token is null then
    return jsonb_build_object('ok', false, 'error', 'no_existe');
  end if;

  select count(*) into v_fallos from portal_intentos
    where slug = lower(trim(p_slug)) and creado_at > now() - interval '15 minutes';
  if v_fallos >= v_max then
    return jsonb_build_object('ok', false, 'bloqueado', true);
  end if;

  if v_g.portal_pin_hash = crypt(p_pin, v_g.portal_pin_hash) then
    delete from portal_intentos where slug = lower(trim(p_slug));
    return jsonb_build_object('ok', true, 'token', v_g.form_token);
  else
    insert into portal_intentos (slug, ip) values (lower(trim(p_slug)), p_ip);
    return jsonb_build_object('ok', false, 'restantes', greatest(v_max - v_fallos - 1, 0));
  end if;
end $function$;

grant execute on function public.portal_unlock(text, text, text) to anon, authenticated;

-- Refrescar el cache de PostgREST para que las funciones nuevas se vean ya.
notify pgrst, 'reload schema';
