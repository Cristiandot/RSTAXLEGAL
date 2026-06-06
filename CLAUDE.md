# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es este proyecto

Panel de control operativo interno de RS Tax & Legal (Rodríguez Samith Tax & Legal Limitada), firma chilena de servicios legales y contables con sede en Viña del Mar; dueño: Cristian López Thienel. Áreas: corporativo, laboral, tributario. El sistema gestiona los ciclos mensuales de cumplimiento de la cartera: liquidaciones de sueldo (Previred), conciliación compras/ventas (SII + KAME) y declaración F29.

Estilo de trabajo: español de Chile, fechas DD-MM-AAAA, moneda CLP. Citar normativa chilena cuando aplique (CT, SII, DT, CMF). Directo, técnico, prosa por sobre bullets, sin disclaimers genéricos. Si el usuario se equivoca, contradecirlo con fundamento normativo.

## Equipo (tabla `usuarios`)

- Cristian López — clopez@rstaxlegal.cl — admin
- Felipe Rodriguez Samith — frodriguez@rstaxlegal.cl — admin
- Solange Quintana Pizarro — squintana@rstaxlegal.cl — operador
- Danilo Tapia — dtapia@rstaxlegal.cl — operador

Cualquier correo @rstaxlegal.cl NO registrado en la tabla `usuarios` queda fuera del sistema (el login lo valida antes de enviar el magic link).

## Cartera y reglas de negocio (estado al 11-06-2026)

Total: 137 clientes (133 activos, 4 inactivos). En cartera hay 83 clientes-matriz (personas o grupos familiares) categorizados A/OPEN, B/SEGUNDA, C/TERCERA, D/PUBA; cada cliente-matriz puede tener múltiples empresas (sociedades) con su propio RUT.

Flags por cliente en tabla `clientes`:

- `hace_liquidaciones` BOOLEAN: cliente en ciclo mensual Previred (67 activos)
- `hace_f29` BOOLEAN: cliente en ciclo mensual F29 (123 activos)
- `hace_contabilidad_completa` BOOLEAN
- `es_profesional_salud` BOOLEAN (null = pendiente de clasificar)
- `kame_cert_estado` TEXT 'ON'/'OFF' (default ON)
- `activo` BOOLEAN

Regla: si `hace_liquidaciones=TRUE` casi siempre `hace_f29=TRUE` también, pero hay una EXCEPCIÓN clave: asesoras del hogar Art. 110 CT (hacen Previred pero NO F29, porque no son empresas con actividad económica). El constraint estricto se eliminó por esta excepción. Además, existen empresas activas SIN F29 ni Previred y son válidas — solo cartera (ej.: Comercial Multimaxusa Burgos).

## Ciclos mensuales (3 procesos separados)

1. `ciclo_liquidaciones` (Previred): 67 clientes × mes.
2. `ciclo_conciliacion` (descargas SII C/V + revisión KAME; lo lleva Solange): 123 clientes × mes.
3. `ciclo_f29` (armado y presentación): 123 clientes × mes. Plazo día 20 del mes siguiente, UNIFORME — no se diferencia por Previred (decisión explícita).

Cambios de IVA recuperable a no recuperable (solo profesionales de salud): tabla `iva_salud_ejecucion`, frecuencia flexible (no fija); Solange lo ejecuta semanalmente en clientes de salud, dentro del módulo Conciliación.

## Arquitectura

**Sin build, sin dependencias locales, sin tests.** Son 4 archivos HTML completamente autónomos — cada uno contiene su CSS y JavaScript inline, y carga `@supabase/supabase-js@2` desde CDN (jsdelivr). No hay framework ni bundler. Para probar localmente basta servir los archivos estáticamente (ej. `python -m http.server`) o abrirlos en el navegador.

| Archivo | Módulo | Vista que lee | Tabla que escribe |
|---|---|---|---|
| `index.html` | Login + panel de módulos | — | — |
| `liquidaciones.html` | Ciclo liquidaciones/Previred | `v_checklist_mensual` | `ciclo_liquidaciones`, `clientes` |
| `conciliacion.html` | Conciliación SII/KAME + IVA salud | `v_checklist_conciliacion` | `ciclo_conciliacion`, `iva_salud_ejecucion`, `clientes` |
| `f29.html` | Ciclo F29 mensual | `v_checklist_f29` | `ciclo_f29` |

**Patrón de cada página:** lectura desde una vista Postgres (que ya junta cliente + ciclo + responsable + días restantes de plazo), filtrado/render en cliente sobre `estado.ciclos`, y edición vía modal que hace `update` directo a la tabla base. Tras guardar se recarga el dashboard completo.

**Código duplicado a propósito:** la configuración de Supabase (URL + publishable key), el flujo de auth (magic link), `formatFecha`, `formatMonto`, `escapeHtml` y `toast` están copiados en los 4 archivos. Cualquier cambio a esa lógica compartida debe replicarse en todos los HTML.

## Infraestructura

- **Supabase:** proyecto `nnwoknmbbxbjzswrkzmw` (plan Free, Postgres 17, us-east-1).
- **GitHub:** `Cristiandot/RSTAXLEGAL`.
- **Vercel:** https://rstaxlegal-k3dl.vercel.app — auto-deploy desde `main`. Todo push a `main` queda en producción.
- **Auth:** magic link de Supabase; Site URL y redirects ya configurados.

## Backend (Supabase)

Se administra vía MCP de Supabase — usar `apply_migration` para DDL y `execute_sql` para consultas. Nota: el servidor MCP local (`mcp__supabase`) requiere `SUPABASE_ACCESS_TOKEN`; si falla con "Unauthorized", usar el conector de claude.ai (`mcp__claude_ai_Supabase__*`, requiere `project_id`).

- **Tablas:** `usuarios`, `clientes`, `ciclo_liquidaciones`, `ciclo_f29`, `ciclo_conciliacion`, `iva_salud_ejecucion`, `checklist_implementacion`, `audit_log`. Todas con RLS habilitado.
- **Vistas:** `v_checklist_mensual`, `v_checklist_f29`, `v_checklist_conciliacion`, `v_historial`. Las vistas calculan campos derivados como `estado`, `dias_restantes_*` y `conciliacion_ok` — si se necesita un campo nuevo en el dashboard, normalmente se agrega a la vista, no al HTML.
- **Auditoría automática:** las tablas `clientes`, `ciclo_*`, `iva_salud_ejecucion` y `checklist_implementacion` tienen triggers AFTER INSERT/UPDATE/DELETE (`trg_audit_*`, SECURITY DEFINER) que registran en `audit_log` (vista `v_historial`), y triggers BEFORE UPDATE que mantienen `updated_at`. No es necesario (ni correcto) escribir en `audit_log` o `updated_at` desde el frontend.
- **Auth:** magic link (`signInWithOtp`) restringido a correos presentes y activos en la tabla `usuarios` (se valida antes de enviar el link y de nuevo al iniciar sesión). Roles en `usuarios.rol` (`admin`, `operador`).
- **Períodos:** columna `periodo` es texto con formato `YYYY-MM` (ej. `2026-05`). Se crea un ciclo por cliente por mes en cada tabla `ciclo_*`.

## Decisiones tomadas (no cambiar sin discutir)

- Plazo F29 uniforme día 20 (no diferenciar con/sin Previred).
- Responsable F29 separado de responsable Previred: al guardar responsable en ciclo F29 NO se hereda a `clientes.responsable_default_id`.
- ON/OFF del certificado KAME es por empresa (campo en `clientes`), no historial mensual.
- Soft delete de clientes (`activo=FALSE`), nunca DELETE físico.
- Empresas activas sin F29 ni Previred existen y son válidas (solo cartera).

## Objetivo inmediato (junio 2026): migración a Next.js

Migrar los 4 HTML standalone a un proyecto Next.js + TypeScript + Tailwind + shadcn/ui dentro de la MISMA carpeta del repo (subcarpeta `app/` o similar), sin borrar los HTML. Stack: Next.js 15 App Router, TypeScript estricto, Tailwind v4, shadcn/ui, Supabase JS SDK oficial. Durante toda la migración el sistema HTML actual sigue operando en Vercel; cuando los módulos React estén probados, se hace el switch del root del repo.

## Pendientes operativos

- Conseguir RUT y clave SII de Distribuidora Red Barrera e Inmobiliaria Barrera Álvarez.
- Asignar responsables F29 a los 123 ciclos (Solange o Danilo, definir con contador jefe).
- Marcar `es_profesional_salud=TRUE` en los clientes que correspondan.
- Migrar contraseñas SII y Previred a Bitwarden (Ley 21.719).

## Archivos de memoria por cliente

Política de la firma: al término de cada conversación o gestión relevante con un cliente, se actualiza el archivo de memoria `.md` de ese cliente, para que cualquier persona del equipo conozca el avance y gestiones de los demás. Cuando se trabaje un tema específico de un cliente, recordar al usuario actualizar el `.md` de ese cliente al cierre.

## Convenciones

- Todo en español: UI, nombres de funciones (`cargarDashboard`, `guardarCambios`, `abrirModal`), columnas de BD y comentarios.
- Fechas en UI: DD-MM-AAAA (la BD usa ISO `date`); montos en CLP con `toLocaleString('es-CL')`.
- Texto dinámico en tablas siempre pasa por `escapeHtml`.
- Dominio chileno: plazos Previred, F29 (SII), certificado KAME, cambios de IVA para profesionales de salud.
