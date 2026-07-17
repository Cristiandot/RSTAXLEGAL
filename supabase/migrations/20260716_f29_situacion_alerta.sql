-- Alertas del portal: recuadro con la SITUACIÓN de los F29 (semáforo mensual),
-- similar a lo que informa el SII. La oficina marca el estado por período en el
-- panel interno; el portal lo refleja. Estados:
--   declarada  — presentada y aceptada en el SII (verde)
--   observada  — presentada pero el SII le puso observaciones (rojo)
--   guardada   — la oficina la dejó guardada/lista (para que el cliente pague),
--                aún NO está en el SII (ámbar)
--   sin_declarar (implícito: sin fila) — nada, ni interno ni SII (gris)
--
-- Nota: esto es INFORMATIVO y no altera la renta, que sigue contando sólo lo
-- efectivamente declarado en el SII (folio) — un período 'guardada' no suma PPM.

create table if not exists f29_situacion (
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodo text not null,                         -- 'YYYY-MM'
  estado text not null check (estado in ('declarada','observada','guardada')),
  nota text,
  updated_at timestamptz not null default now(),
  primary key (cliente_id, periodo)
);

-- Situación de los F29 para el portal: últimos 12 meses (móvil), con el estado
-- marcado por la oficina; los períodos sin fila salen como 'sin_declarar'.
create or replace function public.portal_f29_situacion(p_token text)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare v_cliente uuid; v_res jsonb;
begin
  select id into v_cliente from clientes where form_token = p_token and activo;
  if v_cliente is null then raise exception 'Link inválido'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object('periodo', meses.p, 'estado', coalesce(s.estado, 'sin_declarar'), 'nota', s.nota)
    order by meses.p
  ), '[]'::jsonb)
  into v_res
  from (
    select to_char(date_trunc('month', current_date) - (g || ' months')::interval, 'YYYY-MM') as p
    from generate_series(0, 11) g
  ) meses
  left join f29_situacion s on s.cliente_id = v_cliente and s.periodo = meses.p;

  return jsonb_build_object('periodos', v_res);
end $function$;

grant execute on function public.portal_f29_situacion(text) to anon;

-- Semilla LeBlanc (situación real informada por el SII + interno, 16-07-2026):
-- 2025 declarada (ene–nov), dic-2025 observada; ene-2026 declarada;
-- feb–jun 2026 guardada; jul-2026 aún sin declarar (sin fila).
insert into f29_situacion (cliente_id, periodo, estado) values
('297d3675-c88c-4072-b747-c7acaafa2f89','2025-08','declarada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2025-09','declarada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2025-10','declarada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2025-11','declarada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2025-12','observada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-01','declarada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-02','guardada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-03','guardada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-04','guardada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-05','guardada'),
('297d3675-c88c-4072-b747-c7acaafa2f89','2026-06','guardada')
on conflict (cliente_id, periodo) do update set estado = excluded.estado;
