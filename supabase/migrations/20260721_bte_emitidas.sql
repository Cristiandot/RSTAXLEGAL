-- Boletas de Prestación de Servicios de Terceros Electrónicas (BTE) EMITIDAS por
-- la empresa (app SII zeus.sii.cl/cvc_cgi/bte). La retención es obligación del
-- emisor → suma al F29. Anuladas se guardan con valor 0. 21-07-2026.
-- Fuente: skill contabilidad-sii/scripts/sync-bte.ps1 (informe anual + detalle mensual).
create table if not exists bte_emitidas (
  id                   bigint generated always as identity primary key,
  cliente_id           uuid not null references clientes(id) on delete cascade,
  periodo              text not null,          -- 'YYYY-MM'
  numero               text not null,          -- folio de la BTE
  fecha                date,                   -- fecha de emisión
  rut_tercero          text,                   -- prestador (columna Honorarios/Rut del detalle)
  nombre_tercero       text,
  brutos               bigint default 0,
  retencion            bigint default 0,
  liquido              bigint default 0,
  estado               text default 'VIGENTE', -- VIGENTE / ANULADA (anulada = valores en 0)
  sii_sincronizado_en  timestamptz default now(),
  unique (cliente_id, periodo, numero)
);

comment on table bte_emitidas is 'BTE (boletas de prestación de servicios de terceros) EMITIDAS por la empresa, del SII (zeus.sii.cl/cvc_cgi/bte). Retención = obligación del emisor, suma al F29. Fuente: skill contabilidad-sii/sync-bte.ps1.';