-- Acceso desde el panel interno (rol authenticated) a las tablas de clasificación.
-- El portal (anon) sigue entrando sólo por sus RPCs SECURITY DEFINER.

alter table categoria_gasto_regla enable row level security;
grant select, insert, update, delete on categoria_gasto_regla to authenticated;
drop policy if exists "oficina ve reglas" on categoria_gasto_regla;
drop policy if exists "oficina edita reglas" on categoria_gasto_regla;
create policy "oficina ve reglas" on categoria_gasto_regla for select to authenticated using (true);
create policy "oficina edita reglas" on categoria_gasto_regla for all to authenticated using (true) with check (true);

alter table rcv_proveedor_categoria enable row level security;
grant select, insert, update, delete on rcv_proveedor_categoria to authenticated;
drop policy if exists "oficina ve categorias prov" on rcv_proveedor_categoria;
drop policy if exists "oficina edita categorias prov" on rcv_proveedor_categoria;
create policy "oficina ve categorias prov" on rcv_proveedor_categoria for select to authenticated using (true);
create policy "oficina edita categorias prov" on rcv_proveedor_categoria for all to authenticated using (true) with check (true);

grant select on categoria_gasto to authenticated;
grant execute on function public.clasificar_auto_cliente(uuid) to authenticated;
