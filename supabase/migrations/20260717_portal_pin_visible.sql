-- PIN visible para la oficina: el código que genera la oficina se guarda en claro
-- para poder mostrarlo. Cuando el CLIENTE cambia su PIN, se borra (queda solo el
-- hash) y la oficina ya no lo ve → "cambiado por el cliente".
alter table grupos_cliente add column if not exists portal_pin_visible text;
comment on column grupos_cliente.portal_pin_visible is
  'PIN del portal en claro, visible para la oficina, MIENTRAS lo mantenga el que generó la oficina. Se pone en null cuando el cliente lo cambia (portal_cambiar_pin).';

-- Backfill del piloto: Domingo/LeBlanc usa el PIN de oficina 4821 (no cambiado).
update grupos_cliente set portal_pin_visible = '4821'
  where portal_slug = 'domingo-undurraga' and portal_pin_visible is null and portal_pin_hash is not null;

-- Al cambiar el cliente su PIN, se limpia el visible de la oficina.
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

  update grupos_cliente
     set portal_pin_hash = crypt(p_pin_nuevo, gen_salt('bf')),
         portal_pin_visible = null
   where id = v_g.id;
  return jsonb_build_object('ok', true);
end $function$;
