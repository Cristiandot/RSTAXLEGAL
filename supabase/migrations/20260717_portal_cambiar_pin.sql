-- El cliente cambia su propio PIN del portal: valida el PIN actual y guarda el
-- nuevo (bcrypt). Se identifica por slug (público en la URL); la seguridad viene
-- de exigir el PIN actual. No toca el token del grupo (acceso interno sin PIN).
create or replace function public.portal_cambiar_pin(p_slug text, p_pin_actual text, p_pin_nuevo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_g public.grupos_cliente;
begin
  if p_pin_nuevo !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'El PIN nuevo debe ser de 4 dígitos.');
  end if;

  select * into v_g from grupos_cliente where portal_slug = lower(trim(p_slug));
  if v_g.id is null or v_g.portal_pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'No se encontró el portal.');
  end if;

  if v_g.portal_pin_hash <> crypt(p_pin_actual, v_g.portal_pin_hash) then
    return jsonb_build_object('ok', false, 'error', 'El PIN actual no es correcto.');
  end if;

  update grupos_cliente set portal_pin_hash = crypt(p_pin_nuevo, gen_salt('bf')) where id = v_g.id;
  return jsonb_build_object('ok', true);
end $function$;

grant execute on function public.portal_cambiar_pin(text, text, text) to anon;
