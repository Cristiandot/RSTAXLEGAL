# Auditoría del sistema — 19-07-2026

Auditoría de estructura (BD Supabase `nnwoknmbbxbjzswrkzmw`) y código (4 HTML legacy + app Next `app/`).
Ejecutada por Felipe. **Los ERROR de seguridad se abordan al terminar el proyecto (decisión Cristian/Felipe 19-07): NO tocar hasta que el equipo dé el aviso.**

Alcance real medido: **88 tablas, 19 vistas, ~58 RPC, 7 buckets** (el `CLAUDE.md` documenta ~40 tablas → documentación desactualizada).

---

## 1. CRÍTICO — pendiente de abordar al cierre del proyecto

### 1.1 Tres tablas SIN RLS (advisor nivel ERROR)
`honorarios_recibidos`, `categoria_gasto`, `f29_situacion` tienen RLS apagado → expuestas por la API pública de Supabase sin filtro de fila. Contradice el `CLAUDE.md` ("Todas con RLS habilitado"). `honorarios_recibidos` (RUT + montos de terceros) se lee directo desde `lib/banco/conciliacion.ts` → dato personal circulando sin capa de acceso (Ley 21.719).
**Fix:** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + políticas estándar del panel.

### 1.2 Once vistas SECURITY DEFINER (advisor nivel ERROR)
Corren con permisos del creador y saltan la RLS del consultante. Incluye tres que el `CLAUDE.md` daba por saneadas (se recrearon y se perdió el `ALTER`):
`v_checklist_mensual`, `v_checklist_f29`, `v_checklist_conciliacion`, `v_gestiones_oficina`, `v_requerimientos_empresa`, `v_cumplimiento_encargado`, `v_meses_requerimientos`, `v_convenios`, `v_comunicacion_mensual`, `v_rcv_totales_periodo`, `v_onboarding_completitud`.
**Fix:** `ALTER VIEW <v> SET (security_invoker = on)` en las 11. (`v_historial` ya está OK.)

### 1.3 Sesenta funciones SECURITY DEFINER ejecutables por `anon`
Correcto para RPC del portal por token; hay que confirmar que ninguna función NO-portal quedó con EXECUTE a `anon` y revocarlo.

### 1.4 Cuatro funciones con search_path mutable
`fn_ciclo_liq_hereda_responsable`, `fn_ciclo_f29_hereda_responsable`, `fn_pendiente`, `fn_sla_horas`.
**Fix:** `ALTER FUNCTION ... SET search_path = public`.

### 1.5 `portal_intentos`: RLS activo, cero políticas
Bloquea todo salvo vía definer. Funciona hoy porque solo se toca por RPC; frágil.

---

## 2. INFRAESTRUCTURA — riesgo operativo (evaluar subir prioridad)

- **Supabase plan Free se pausa tras ~1 semana de inactividad.** Ya hay portal de cliente productivo + ~110k filas RCV. Una pausa un fin de semana largo cae portal, panel y magic links hasta reactivación manual. Mitigación: pasar a **Pro (US$25)**.
- **`audit_log` crece sin techo** (12.210 filas) y nunca se lee ni purga. En Free el límite de BD es 500 MB → definir política de retención.

---

## 3. CONFLICTOS (importante, no urgente)

- **Doble fuente de verdad de feriados** — tabla `feriados` (BD, usada por `rs_proximo_dia_habil`/`rs_restar_dias_habiles`) vs `app/src/lib/feriados.ts` (app). Divergen: BD cubre 2026-2027 e incluye 31-12 bancario y un 2027-09-17 que el código no tiene; el código cubre hasta 2028. **En consolidación (19-07).**
- **Índice único redundante en `clientes`**: coexisten `clientes_rut_empresa_key` (RUT crudo) y `uq_clientes_rut_empresa` (RUT normalizado). Sobra el crudo. `trabajadores` ya quedó solo con el normalizado.
- **`ON DELETE` inconsistente** en las FK a `clientes` (CASCADE / SET NULL / sin acción). Con soft-delete no rompe hoy; unificar criterio.
- **Colisión nombre tabla/bucket**: `facturas`, `contratos`, `reglamentos` son tabla y bucket; `libros`, `contabilidad`, `indicadores`, `gastos` son SOLO buckets (tablas reales: `libro_remuneraciones`, — , `indicadores_previred`, `gastos_menores`). Riesgo de confusión al leer código.

---

## 4. SOBRA — huérfanos / limpieza (verificado: 0 referencias en código, solo en `CLAUDE.md`)

Objetos de BD que ningún archivo de la app consume:
- `checklist_implementacion` — 135 filas + triggers activos; módulo reemplazado por onboarding. Migrar o archivar antes de tocar.
- `audit_log` + vista `v_historial` — se escribe (12k filas), nunca se lee. El "módulo historial" no existe en la app.
- `movimiento_personal` — 0 filas, sin uso.
- `import_kame_staging` — 0 filas, sin uso actual.
- `tipos_dte` — catálogo 13 filas, sin referencia.
- `cliente_whatsapp` — 108 filas, solo vía RPC `resolver_cliente_por_whatsapp` (Wati); confirmar si la integración está viva.

Archivos temporales versionados (borrar): `app/tmp-gen-previred.ts`, `app/preview-correos.ts`, `app/preview-correo-f29.ts`, `scripts/migrar-facturas.js`.

Ocho índices nunca usados: `idx_audit_tabla_registro`, `idx_contratos_estado`, `idx_licencias_trabajador_rut`, `idx_cambios_pendientes`, `idx_staging_batch`, `idx_staging_estado`, `convenio_f29_periodo_idx`, `idx_lm_mov_libro`.

Dos políticas permisivas duplicadas: `categoria_gasto_regla` (SELECT), `rcv_proveedor_categoria` (SELECT).

Los 4 HTML legacy: subconjunto estricto de la app Next, sin lógica única. Retirar cuando se confirme el switch de root en Vercel.

---

## 5. FALTA

- **58 FK sin índice de cobertura.** Priorizar por volumen: `rcv_compras.cuenta_id`, `rcv_ventas.cuenta_id` (60k/50k filas), `liquidacion.trabajador_id`, `novedades_remuneraciones.trabajador_id`, `licencias_medicas.trabajador_id`, `honorarios_periodo.cuenta_id`, `clientes.grupo_id`.
- **Integridad de catálogos blanda**: selectores de onboarding sin FK/CHECK duros contra `catalogo_valores` (reconocido en `CLAUDE.md`).
- **`CLAUDE.md` desactualizado**: faltan módulos banco/tesorería, gerencia, causas, vacaciones, licencias, convenios, honorarios, comunicación Previred.

---

*Nota: los 163 `rls_policy_always_true` y `pg_trgm` en `public` son diseño intencional del panel — no son hallazgos.*
