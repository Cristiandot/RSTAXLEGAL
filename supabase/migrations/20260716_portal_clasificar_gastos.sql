-- Panel financiero: el cliente clasifica sus facturas exentas (tipo 34) sin
-- categoría, por proveedor, desde el portal. El catálogo de categorías lo
-- define la oficina (categoria_gasto); el cliente elige de esa lista, no crea
-- categorías nuevas (para eso pide un plan de cuentas especial). Clasificar un
-- proveedor aplica a todas sus facturas y recategoriza el Estado de Resultado.

-- Catálogo controlado por la oficina. Hoy: servicio profesional y arriendo
-- (el mismo corte que ya separa el panel). Extensible agregando filas.
create table if not exists categoria_gasto (
  codigo text primary key,
  etiqueta text not null,
  orden int not null default 0
);
insert into categoria_gasto (codigo, etiqueta, orden) values
  ('servicio','Servicio profesional',1),
  ('arriendo','Arriendo',2)
on conflict (codigo) do update set etiqueta=excluded.etiqueta, orden=excluded.orden;

-- Proveedores exentos (tipo 34) del cliente que aún no tienen categoría.
create or replace function public.portal_sin_clasificar(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_cliente uuid; v_res jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select jsonb_build_object(
    'categorias', (
      select coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'etiqueta',etiqueta) order by orden), '[]'::jsonb)
      from categoria_gasto
    ),
    'proveedores', (
      select coalesce(jsonb_agg(x order by (x->>'monto')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'rut', c.rut_proveedor,
          'nombre', coalesce(nullif(trim(max(c.razon_social)),''), c.rut_proveedor),
          'monto', sum(c.monto_total)::bigint,
          'docs', count(*),
          'desde', min(c.periodo),
          'hasta', max(c.periodo)
        ) x
        from rcv_compras c
        left join rcv_proveedor_categoria cat
          on cat.cliente_id = c.cliente_id and cat.rut_proveedor = c.rut_proveedor
        where c.cliente_id = v_cliente and c.tipo_doc = 34 and cat.rut_proveedor is null
        -- Agrupar SOLO por RUT: un mismo proveedor puede tener varias razones
        -- sociales (p.ej. cambió de Ltda a SpA) y la clasificación es por RUT.
        group by c.rut_proveedor
      ) x
    )
  ) into v_res;
  return v_res;
end $function$;

-- Guarda la clasificación elegida por el cliente (upsert por proveedor).
create or replace function public.portal_clasificar_proveedor(p_token text, p_rut text, p_categoria text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_cliente uuid;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;
  if not exists (select 1 from categoria_gasto where codigo = p_categoria) then
    raise exception 'Categoría inválida';
  end if;
  -- El proveedor debe existir en las compras exentas del cliente (evita inyectar ruts ajenos).
  if not exists (
    select 1 from rcv_compras
    where cliente_id = v_cliente and rut_proveedor = p_rut and tipo_doc = 34
  ) then raise exception 'Proveedor no corresponde al cliente'; end if;

  insert into rcv_proveedor_categoria (cliente_id, rut_proveedor, categoria)
  values (v_cliente, p_rut, p_categoria)
  on conflict (cliente_id, rut_proveedor) do update set categoria = excluded.categoria;
  return jsonb_build_object('ok', true);
end $function$;

grant execute on function public.portal_sin_clasificar(text) to anon;
grant execute on function public.portal_clasificar_proveedor(text, text, text) to anon;
