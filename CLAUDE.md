# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

Panel de control operativo interno de RS Tax & Legal (firma chilena de servicios legales y contables). Sitio estático en español (es-CL) que gestiona los ciclos mensuales de cumplimiento de ~137 clientes: liquidaciones de sueldo (Previred), conciliación compras/ventas (SII + KAME) y declaración F29.

## Arquitectura

**Sin build, sin dependencias locales, sin tests.** Son 4 archivos HTML completamente autónomos — cada uno contiene su CSS y JavaScript inline, y carga `@supabase/supabase-js@2` desde CDN (jsdelivr). No hay framework ni bundler. Para probar localmente basta servir los archivos estáticamente (ej. `python -m http.server`) o abrirlos en el navegador; el deploy es vía push a GitHub (`Cristiandot/RSTAXLEGAL`).

| Archivo | Módulo | Vista que lee | Tabla que escribe |
|---|---|---|---|
| `index.html` | Login + panel de módulos | — | — |
| `liquidaciones.html` | Ciclo liquidaciones/Previred | `v_checklist_mensual` | `ciclo_liquidaciones`, `clientes` |
| `conciliacion.html` | Conciliación SII/KAME + IVA salud semanal | `v_checklist_conciliacion` | `ciclo_conciliacion`, `iva_salud_ejecucion`, `clientes` |
| `f29.html` | Ciclo F29 mensual | `v_checklist_f29` | `ciclo_f29` |

**Patrón de cada página:** lectura desde una vista Postgres (que ya junta cliente + ciclo + responsable + días restantes de plazo), filtrado/render en cliente sobre `estado.ciclos`, y edición vía modal que hace `update` directo a la tabla base. Tras guardar se recarga el dashboard completo.

**Código duplicado a propósito:** la configuración de Supabase (URL + publishable key), el flujo de auth (magic link), `formatFecha`, `formatMonto`, `escapeHtml` y `toast` están copiados en los 4 archivos. Cualquier cambio a esa lógica compartida debe replicarse en todos los HTML.

## Backend (Supabase)

Proyecto `nnwoknmbbxbjzswrkzmw` (Postgres 17, us-east-1). Se administra vía MCP de Supabase — usar `apply_migration` para DDL y `execute_sql` para consultas. Nota: el servidor MCP local (`mcp__supabase`) requiere `SUPABASE_ACCESS_TOKEN`; si falla con "Unauthorized", usar el conector de claude.ai (`mcp__claude_ai_Supabase__*`, requiere `project_id`).

- **Tablas:** `usuarios`, `clientes`, `ciclo_liquidaciones`, `ciclo_f29`, `ciclo_conciliacion`, `iva_salud_ejecucion`, `checklist_implementacion`, `audit_log`. Todas con RLS habilitado.
- **Vistas:** `v_checklist_mensual`, `v_checklist_f29`, `v_checklist_conciliacion`, `v_historial`. Las vistas calculan campos derivados como `estado`, `dias_restantes_*` y `conciliacion_ok` — si se necesita un campo nuevo en el dashboard, normalmente se agrega a la vista, no al HTML.
- **Auditoría automática:** las tablas `clientes`, `ciclo_*`, `iva_salud_ejecucion` y `checklist_implementacion` tienen triggers AFTER INSERT/UPDATE/DELETE (`trg_audit_*`) que registran en `audit_log`, y triggers BEFORE UPDATE que mantienen `updated_at`. No es necesario (ni correcto) escribir en `audit_log` o `updated_at` desde el frontend.
- **Auth:** magic link (`signInWithOtp`) restringido a correos presentes y activos en la tabla `usuarios` (se valida antes de enviar el link y de nuevo al iniciar sesión). Roles en `usuarios.rol` (ej. `admin`).
- **Períodos:** columna `periodo` es texto con formato `YYYY-MM` (ej. `2026-05`). Se crea un ciclo por cliente por mes en cada tabla `ciclo_*`.

## Convenciones

- Todo en español: UI, nombres de funciones (`cargarDashboard`, `guardarCambios`, `abrirModal`), columnas de BD y comentarios.
- Fechas en UI: DD-MM-AAAA (la BD usa ISO `date`); montos en CLP con `toLocaleString('es-CL')`.
- Texto dinámico en tablas siempre pasa por `escapeHtml`.
- Dominio chileno: plazos Previred, F29 (SII), certificado KAME, cambio de IVA semanal para profesionales de salud.
