-- Módulo "Convenios y multas": entidad con seguimiento de cuotas, vencimientos y
-- pagos (se ingresa una vez). Vínculo opcional a los períodos F29 que cubre.
-- Reemplaza los campos convenio_* que se habían puesto en ciclo_f29 (la multa y
-- condonación SÍ se quedan en el F29 porque son propias de esa declaración).

create table if not exists convenio (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo text not null default 'convenio' check (tipo in ('convenio','multa')),
  organismo text not null default 'tesoreria' check (organismo in ('sii','tesoreria','dt','otro')),
  folio text,                                 -- N° de convenio / resolución de multa
  concepto text,                              -- qué cubre (glosa)
  monto_total numeric,
  fecha_suscripcion date,                     -- fecha de suscripción del convenio / emisión de la multa
  caido boolean not null default false,       -- convenio caído por incumplimiento
  observaciones text,
  responsable_id uuid references usuarios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists convenio_cuota (
  id uuid primary key default gen_random_uuid(),
  convenio_id uuid not null references convenio(id) on delete cascade,
  n_cuota int not null,
  monto numeric,
  fecha_vencimiento date,
  fecha_pago date,                            -- null = pendiente
  created_at timestamptz not null default now(),
  unique (convenio_id, n_cuota)
);

create table if not exists convenio_f29 (
  convenio_id uuid not null references convenio(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
  periodo text not null,                      -- 'YYYY-MM' que cubre el convenio
  primary key (convenio_id, periodo)
);

create index if not exists convenio_cliente_idx on convenio(cliente_id);
create index if not exists convenio_cuota_conv_idx on convenio_cuota(convenio_id);
create index if not exists convenio_f29_periodo_idx on convenio_f29(cliente_id, periodo);

-- RLS: mismo patrón que ciclo_f29 (autenticados ven/crean/actualizan; borra admin).
alter table convenio enable row level security;
alter table convenio_cuota enable row level security;
alter table convenio_f29 enable row level security;

do $$
declare t text;
begin
  foreach t in array array['convenio','convenio_cuota','convenio_f29'] loop
    execute format('drop policy if exists "ver %1$s" on %1$s', t);
    execute format('drop policy if exists "crear %1$s" on %1$s', t);
    execute format('drop policy if exists "actualizar %1$s" on %1$s', t);
    execute format('drop policy if exists "borrar %1$s" on %1$s', t);
    execute format('create policy "ver %1$s" on %1$s for select to authenticated using (true)', t);
    execute format('create policy "crear %1$s" on %1$s for insert to authenticated with check (true)', t);
    execute format('create policy "actualizar %1$s" on %1$s for update to authenticated using (true) with check (true)', t);
    execute format('create policy "borrar %1$s" on %1$s for delete to authenticated using (es_admin())', t);
  end loop;
end $$;

-- Vista de grilla: convenio + cliente + progreso de cuotas + próximo vencimiento
-- + estado derivado + períodos F29 vinculados.
create or replace view v_convenios as
 select cv.id,
    cv.cliente_id,
    c.razon_social,
    c.rut_empresa,
    gc.codigo as grupo_codigo,
    cv.tipo,
    cv.organismo,
    cv.folio,
    cv.concepto,
    cv.monto_total,
    cv.fecha_suscripcion,
    cv.caido,
    cv.observaciones,
    cv.responsable_id,
    u.nombre as responsable,
    (select count(*) from convenio_cuota q where q.convenio_id = cv.id) as n_cuotas,
    (select count(*) from convenio_cuota q where q.convenio_id = cv.id and q.fecha_pago is not null) as cuotas_pagadas,
    (select coalesce(sum(q.monto),0) from convenio_cuota q where q.convenio_id = cv.id and q.fecha_pago is not null) as monto_pagado,
    (select min(q.fecha_vencimiento) from convenio_cuota q where q.convenio_id = cv.id and q.fecha_pago is null) as proximo_vencimiento,
    case
      when cv.caido then 'Caído'
      when exists (select 1 from convenio_cuota q where q.convenio_id = cv.id)
           and not exists (select 1 from convenio_cuota q where q.convenio_id = cv.id and q.fecha_pago is null)
        then 'Pagado'
      else 'Vigente'
    end as estado,
    (select array_agg(f.periodo order by f.periodo) from convenio_f29 f where f.convenio_id = cv.id) as periodos_f29
   from convenio cv
     join clientes c on c.id = cv.cliente_id
     left join grupos_cliente gc on gc.id = c.grupo_id
     left join usuarios u on u.id = cv.responsable_id
  where c.activo = true;

-- El convenio ahora vive en su módulo: se quitan los campos que se habían puesto
-- en ciclo_f29. La multa y la condonación se quedan en el F29.
drop view if exists v_checklist_f29;
alter table ciclo_f29 drop column if exists convenio_folio;
alter table ciclo_f29 drop column if exists convenio_monto;

create view v_checklist_f29 as
 SELECT cf.id AS ciclo_id,
    c.id AS cliente_id,
    c.razon_social,
    c.rut_empresa,
    c.previred_rut,
    c.hace_liquidaciones,
    c.es_profesional_salud,
    c.kame_cert_estado,
    c.rubro,
    cf.periodo,
    cf.responsable_id,
    u.nombre AS responsable,
    cf.fecha_f29_armado,
    cf.fecha_f29_presentado,
    cf.monto_a_pagar,
    cf.folio_f29,
    cf.pago_por,
    cf.observaciones,
        CASE
            WHEN cf.fecha_pago_f29 IS NOT NULL THEN 'Pagado'::text
            WHEN cf.fecha_pago_oficina IS NOT NULL THEN 'Fondos en RS'::text
            WHEN cf.folio_f29 IS NOT NULL AND btrim(cf.folio_f29) <> ''::text THEN 'Declarado'::text
            WHEN cf.fecha_correo_f29_enviado IS NOT NULL THEN 'Guardado y enviado'::text
            WHEN cf.fecha_f29_armado IS NOT NULL THEN 'Pendiente presentación'::text
            ELSE 'Sin iniciar'::text
        END AS estado,
    (EXISTS ( SELECT 1
           FROM ciclo_conciliacion cc
          WHERE cc.cliente_id = c.id AND cc.periodo = cf.periodo AND cc.fecha_conciliacion_kame_ok IS NOT NULL)) AS conciliacion_ok,
    rs_proximo_dia_habil((date_trunc('month'::text, to_date(cf.periodo || '-01'::text, 'YYYY-MM-DD'::text)::timestamp with time zone) + '1 mon'::interval + '19 days'::interval)::date) AS plazo_f29,
    rs_proximo_dia_habil((date_trunc('month'::text, to_date(cf.periodo || '-01'::text, 'YYYY-MM-DD'::text)::timestamp with time zone) + '1 mon'::interval + '19 days'::interval)::date) - CURRENT_DATE AS dias_restantes_f29,
    cf.fecha_pago_oficina,
    cf.ppm,
    c.correo_empresa,
    cf.fecha_correo_f29_enviado,
    cf.numero_operacion,
    cf.fecha_pago_f29,
    cf.fecha_correo_pago_enviado,
    cf.postergacion_monto,
    cf.comentario_correo,
    cf.monto_iva,
    cf.imp_unico,
    cf.monto_retenciones,
    cf.monto_otros,
    gc.codigo AS grupo_codigo,
    cf.postergar_iva,
    cf.multa,
    cf.condonacion
   FROM ciclo_f29 cf
     JOIN clientes c ON c.id = cf.cliente_id
     LEFT JOIN usuarios u ON u.id = cf.responsable_id
     LEFT JOIN grupos_cliente gc ON gc.id = c.grupo_id
  WHERE c.activo = true AND c.hace_f29 = true;
