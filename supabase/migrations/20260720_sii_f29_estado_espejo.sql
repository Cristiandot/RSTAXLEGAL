-- Tabla espejo de lo DECLARADO en el SII (propuestaf29ui / getDeclaracionConEstados).
-- NO pisa el estado manual de ciclo_f29; se concilia por vista. 20-07-2026.
-- Fuente de datos: skill contabilidad-sii/scripts/sync-f29.ps1
create table if not exists sii_f29_estado (
  id                   bigint generated always as identity primary key,
  cliente_id           uuid not null references clientes(id) on delete cascade,
  periodo              text not null,            -- 'YYYY-MM'
  estado_id            int,                      -- estadoDeclaracionId del SII (1=Vigente,10=Guardada,70=Rechazada...)
  estado               text,                     -- texto del SII
  folio                text,                     -- folio del F29 (null si borrador)
  monto                bigint default 0,         -- monto declarado
  declarada            boolean not null default false,  -- true si Vigente
  fecha_declaracion    text,                     -- dd/mm/aaaa[ hh:mm:ss] tal cual SII
  n_registros          int default 1,            -- declaraciones que trajo el periodo
  sii_sincronizado_en  timestamptz default now(),
  unique (cliente_id, periodo)
);

comment on table sii_f29_estado is 'Espejo de F29 declarados en el SII (propuestaf29ui). Fuente skill contabilidad-sii/sync-f29.ps1. No pisa ciclo_f29; se concilia por v_f29_conciliacion_sii.';

-- Conciliacion panel (ciclo_f29 + v_checklist_f29) vs SII.
create or replace view v_f29_conciliacion_sii as
select
  c.id                    as cliente_id,
  c.razon_social,
  c.rut_empresa,
  s.periodo,
  s.estado_id             as sii_estado_id,
  s.estado                as sii_estado,
  s.folio                 as sii_folio,
  s.monto                 as sii_monto,
  s.declarada             as sii_declarada,
  s.fecha_declaracion     as sii_fecha,
  s.sii_sincronizado_en,
  cf.id                   as ciclo_id,
  cf.folio_f29            as panel_folio,
  cf.declarado_sin_folio,
  vf.estado               as panel_estado,
  case
    when s.declarada and coalesce(vf.estado,'Sin iniciar') not in ('Declarado','Fondos en RS','Pagado','Declarado, folio pendiente')
      then 'SII declarado, panel atrasado'
    when s.declarada and (cf.folio_f29 is null or btrim(cf.folio_f29) = '')
      then 'Falta folio en panel (autocompletable desde SII)'
    when s.declarada and cf.folio_f29 is not null and s.folio is not null and btrim(cf.folio_f29) <> btrim(s.folio)
      then 'Folio distinto SII vs panel'
    when (not s.declarada) and coalesce(vf.estado,'') in ('Declarado','Fondos en RS','Pagado')
      then 'Panel declarado/pagado pero SII sin declaracion vigente'
    else 'OK'
  end as conciliacion
from sii_f29_estado s
  join clientes c on c.id = s.cliente_id
  left join ciclo_f29 cf on cf.cliente_id = s.cliente_id and cf.periodo = s.periodo
  left join v_checklist_f29 vf on vf.ciclo_id = cf.id;
