-- Tesorería como SERVICIO ADICIONAL contratable (17-07-2026). Mismo patrón que
-- hace_liquidaciones / hace_f29 / hace_contabilidad_completa: el portal de
-- tesorería del cliente (/tesoreria-portal) solo funciona si la empresa tiene
-- el servicio activo; el equipo lo enciende por cliente cuando lo contrata.
alter table public.clientes
  add column if not exists hace_tesoreria boolean not null default false;

-- RS (piloto interno) parte con el servicio activo.
update public.clientes set hace_tesoreria = true
where id = '31e59e7a-584f-47dc-bc21-c3ae43dfb8b3';
