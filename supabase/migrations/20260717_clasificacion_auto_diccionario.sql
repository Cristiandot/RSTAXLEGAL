-- Auto-clasificación de proveedores: previa (manual) + diccionario de palabras
-- clave. La manual manda; lo que no calce con ninguna regla queda sin clasificar.
-- Matching insensible a tildes (CLÍNICA ~ CLINICA).

create extension if not exists unaccent with schema extensions;

alter table rcv_proveedor_categoria
  add column if not exists fuente text not null default 'manual' check (fuente in ('manual','auto'));

create table if not exists categoria_gasto_regla (
  id uuid primary key default gen_random_uuid(),
  patron text not null,                 -- se busca como '%patron%' (ILIKE, unaccent) en la razón social
  categoria text not null references categoria_gasto(codigo),
  orden int not null default 100,       -- menor orden = se evalúa primero (gana el más específico)
  created_at timestamptz not null default now()
);

insert into categoria_gasto_regla (patron, categoria, orden) values
  ('ARTICULOS ODONTOLOG', 'insumos', 10),
  ('LABORATORI% DENTAL', 'insumos', 11),
  ('INSUMO', 'insumos', 12),
  ('INBIOMED', 'insumos', 13),
  ('HEXADENTAL', 'insumos', 14),
  ('IMPORTAD', 'insumos', 15),
  ('DISTRIBUIDORA', 'insumos', 16),
  ('FARMAC', 'insumos', 17),
  ('ODONTO', 'servicio', 30),
  ('PERIODONCIA', 'servicio', 31),
  ('MAXILOFACIAL', 'servicio', 32),
  ('CIRUJANO DENTISTA', 'servicio', 33),
  ('ORTODONCIA', 'servicio', 34),
  ('DENTISTA', 'servicio', 35),
  ('MEDIC', 'servicio', 36),
  ('CARDIO', 'servicio', 37),
  ('REANIMACION', 'servicio', 38),
  ('EMERGENCIA', 'servicio', 39),
  ('SEDANEST', 'servicio', 40),
  ('CLINICA', 'servicio', 41),
  ('ASESOR', 'servicio', 42),
  ('CAPACITACION', 'servicio', 43),
  ('SERVICIOS PROFESIONALES', 'servicio', 44),
  ('RODRIGUEZ SAMITH', 'servicio', 45),
  ('LEGALES', 'servicio', 46),
  ('CONTAB', 'servicio', 47),
  ('DENTOLAB', 'servicio', 48),
  ('INMOBILIARIA', 'otros', 60),
  ('ARRIENDO', 'otros', 61),
  ('INVERSIONES', 'otros', 62)
on conflict do nothing;

-- Asigna categoría (fuente 'auto') a los proveedores exentos (tipo 34) del cliente
-- que aún no tienen clasificación, según la primera regla que calce con el nombre.
create or replace function public.clasificar_auto_cliente(p_cliente uuid)
returns int
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_n int := 0;
begin
  insert into rcv_proveedor_categoria (cliente_id, rut_proveedor, categoria, fuente)
  select p.cliente_id, p.rut_proveedor, r.categoria, 'auto'
  from (
    select c.cliente_id, c.rut_proveedor, max(c.razon_social) as razon_social
    from rcv_compras c
    where c.cliente_id = p_cliente and c.tipo_doc = 34
      and not exists (
        select 1 from rcv_proveedor_categoria pc
        where pc.cliente_id = c.cliente_id and pc.rut_proveedor = c.rut_proveedor
      )
    group by c.cliente_id, c.rut_proveedor
  ) p
  cross join lateral (
    select rg.categoria
    from categoria_gasto_regla rg
    where unaccent(p.razon_social) ilike '%' || unaccent(rg.patron) || '%'
    order by rg.orden
    limit 1
  ) r
  on conflict (cliente_id, rut_proveedor) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- El reclasificar del cliente/oficina siempre queda como 'manual' (override).
create or replace function public.portal_clasificar_proveedor(p_token text, p_rut text, p_categoria text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cliente uuid;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  if not exists (select 1 from categoria_gasto where codigo = p_categoria) then
    raise exception 'Categoría inválida';
  end if;
  if not exists (
    select 1 from rcv_compras
    where cliente_id = v_cliente and rut_proveedor = p_rut and tipo_doc = 34
  ) then raise exception 'Proveedor no corresponde al cliente'; end if;

  insert into rcv_proveedor_categoria (cliente_id, rut_proveedor, categoria, fuente)
  values (v_cliente, p_rut, p_categoria, 'manual')
  on conflict (cliente_id, rut_proveedor) do update set categoria = excluded.categoria, fuente = 'manual';
  return jsonb_build_object('ok', true);
end $function$;

-- Corre el auto para LeBlanc (piloto).
select public.clasificar_auto_cliente('297d3675-c88c-4072-b747-c7acaafa2f89');
