-- Panel financiero (pendiente #5): guardar el N° de boletas por mes y exponer
-- el ticket promedio de atenciones. Las boletas exentas (tipo_doc=41) se cargan
-- como UNA fila resumen por período (folio 'RESUMEN'); antes sólo guardaba el
-- monto. Se agrega `n_documentos` a rcv_ventas (conteo del período, en la fila
-- resumen) y `portal_reportes` devuelve `boletas_mensual` con n, monto y ticket.

alter table rcv_ventas add column if not exists n_documentos integer;

comment on column rcv_ventas.n_documentos is
  'N° de documentos del período en filas resumen (p.ej. boletas exentas tipo 41 cargadas como una fila RESUMEN). Null en documentos individuales.';

create or replace function public.portal_reportes(p_token text, p_anio integer)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_cliente uuid; v_anio text := p_anio::text; v_res jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select jsonb_build_object(
    'anio', p_anio,
    'estructura', (
      select jsonb_build_object(
        'ingresos', coalesce((select sum(monto_total) from rcv_ventas where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
        'insumos', coalesce((select sum(monto_total) from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%' and tipo_doc<>34),0)::bigint,
        'servicios', coalesce((select sum(c.monto_total) from rcv_compras c
            left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34
              and (cat.categoria is null or cat.categoria<>'arriendo')),0)::bigint,
        'arriendo', coalesce((select sum(c.monto_total) from rcv_compras c
            join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
            where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34 and cat.categoria='arriendo'),0)::bigint,
        'honorarios', coalesce((select sum(honorarios_brutos) from honorarios_recibidos where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
        'remuneraciones', coalesce((select sum(total_haberes+coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)) from liquidacion where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint
      )
    ),
    'iva_credito_no_recuperable', coalesce((
      select sum(coalesce(iva_recuperable,0)+coalesce(iva_no_recuperable,0)+coalesce(iva_uso_comun,0))
      from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
    'total_compras', coalesce((select sum(monto_total) from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'),0)::bigint,
    'top_proveedores', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select rut_proveedor as rut, coalesce(nullif(trim(razon_social),''), rut_proveedor) as nombre,
               sum(monto_total)::bigint as monto, count(*) as docs
        from rcv_compras where cliente_id=v_cliente and periodo like v_anio||'-%'
        group by rut_proveedor, razon_social order by sum(monto_total) desc limit 10
      ) x
    ),
    'servicios_profesionales', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(c.razon_social),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c left join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34
          and (cat.categoria is null or cat.categoria<>'arriendo')
        group by c.razon_social, c.rut_proveedor order by sum(c.monto_total) desc limit 10
      ) x
    ),
    'arriendos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(c.razon_social),''), c.rut_proveedor) as nombre,
               sum(c.monto_total)::bigint as monto, count(*) as docs
        from rcv_compras c join rcv_proveedor_categoria cat on cat.cliente_id=c.cliente_id and cat.rut_proveedor=c.rut_proveedor
        where c.cliente_id=v_cliente and c.periodo like v_anio||'-%' and c.tipo_doc=34 and cat.categoria='arriendo'
        group by c.razon_social, c.rut_proveedor order by sum(c.monto_total) desc limit 10
      ) x
    ),
    'honorarios_recibidos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select coalesce(nullif(trim(nombre),''), rut_emisor) as nombre,
               sum(honorarios_brutos)::bigint as monto, count(*) as docs
        from honorarios_recibidos where cliente_id=v_cliente and periodo like v_anio||'-%'
        group by nombre, rut_emisor order by sum(honorarios_brutos) desc limit 10
      ) x
    ),
    'boletas_mensual', (
      select coalesce(jsonb_agg(x order by x->>'periodo'), '[]'::jsonb) from (
        select jsonb_build_object(
          'periodo', periodo,
          'n', sum(n_documentos)::bigint,
          'monto', sum(monto_total)::bigint,
          'ticket', case when coalesce(sum(n_documentos),0) > 0
                         then round(sum(monto_total)::numeric / sum(n_documentos))::bigint else 0 end
        ) x
        from rcv_ventas
        where cliente_id=v_cliente and periodo like v_anio||'-%' and tipo_doc=41 and n_documentos is not null
        group by periodo
      ) x
    ),
    'remuneraciones_mensual', (
      select coalesce(jsonb_agg(x order by x->>'periodo'), '[]'::jsonb) from (
        select jsonb_build_object(
          'periodo', periodo,
          'costo', (sum(total_haberes)+sum(coalesce(sis_empleador,0)+coalesce(afc_empleador,0)+coalesce(mutual_empleador,0)))::bigint,
          'dotacion', count(distinct trabajador_id)
        ) x
        from liquidacion where cliente_id=v_cliente and periodo like v_anio||'-%' group by periodo
      ) x
    )
  ) into v_res;
  return v_res;
end $function$;
