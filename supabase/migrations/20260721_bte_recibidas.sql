-- BTE RECIBIDAS: boletas de prestación de servicios de terceros donde la empresa
-- es receptor (app SII zeus.sii.cl/cvc_cgi/bte, CNTR=2). Espejo de bte_emitidas.
-- Fuente: skill contabilidad-sii/scripts/sync-bte.ps1 (-Cntr 2 -Tabla bte_recibidas).
create table if not exists bte_recibidas (
  id                   bigint generated always as identity primary key,
  cliente_id           uuid not null references clientes(id) on delete cascade,
  periodo              text not null,
  numero               text not null,
  fecha                date,
  rut_tercero          text,                   -- contraparte (emisor/prestador)
  nombre_tercero       text,
  brutos               bigint default 0,
  retencion            bigint default 0,
  liquido              bigint default 0,
  estado               text default 'VIGENTE',
  sii_sincronizado_en  timestamptz default now(),
  unique (cliente_id, periodo, numero)
);
comment on table bte_recibidas is 'BTE (boletas de prestación de servicios de terceros) RECIBIDAS por la empresa (SII zeus.sii.cl/cvc_cgi/bte, CNTR=2). Fuente: skill contabilidad-sii/sync-bte.ps1.';