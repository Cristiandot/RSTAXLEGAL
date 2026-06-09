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

- **Supabase:** proyecto `nnwoknmbbxbjzswrkzmw` (plan Free, Postgres 17, us-east-1). Nota: el plan Free pausa el proyecto tras ~1 semana de inactividad — a futuro evaluar Pro (US$25) para producción.
- **GitHub:** `Cristiandot/RSTAXLEGAL`. Todo push a `main` redespliega AMBOS proyectos Vercel.
- **Vercel — sitio HTML (legacy):** proyecto `rstaxlegal-k3dl`, https://rstaxlegal-k3dl.vercel.app — sirve la RAÍZ del repo (los 4 HTML). Sigue siendo producción para Conciliación hasta que se migre.
- **Vercel — app Next (nuevo):** proyecto `rstaxlegal-panel`, https://rstaxlegal-panel.vercel.app — **Root Directory = `app`**, Framework Preset = Next.js. Es el panel nuevo (login + Liquidaciones + F29). Variables de entorno opcionales (la app tiene fallback público en `app/src/lib/supabase/config.ts`).
- **Auth / correos:** magic link de Supabase con **SMTP propio = Resend** (`smtp.resend.com`, user `resend`, password = API key). Dominio `rstaxlegal.cl` **verificado en Resend** (DKIM `resend._domainkey`, SPF + MX en subdominio `send`, cargados en el DNS de SiteGround — ver abajo). **Sender = `notificaciones@rstaxlegal.cl`**; el equipo completo recibe los links. (El correo incorporado de Supabase NO sirve para producción — rate limit; aplica igual en Free y Pro.)
- **DNS del dominio:** `rstaxlegal.cl` tiene los nameservers en **SiteGround** (`ns1/ns2.siteground.net`) — ahí se editan los registros (Site Tools → Domain → DNS Zone Editor). El **correo del equipo está en Microsoft 365** (MX raíz → `rstaxlegal-cl.mail.protection.outlook.com`); los registros de Resend van en el subdominio `send`, sin tocar ese MX.
- **Redirect URLs (Supabase Auth):** deben incluir `https://rstaxlegal-panel.vercel.app/**`, `https://rstaxlegal-k3dl.vercel.app/**` y `http://localhost:3000/**`. El **Site URL** sigue siendo el sitio viejo (`k3dl`); por eso, para aterrizar en el panel nuevo hay que **pedir el magic link DESDE la URL del panel** (si no, Supabase cae al Site URL = sitio viejo).

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

Migrar los 4 HTML standalone a un proyecto Next.js + TypeScript + Tailwind + shadcn/ui dentro de la MISMA carpeta del repo (subcarpeta `app/`), sin borrar los HTML. Stack: Next.js 16 App Router (se scaffoldeó con `create-next-app@latest`, que ya instala la 16; decisión explícita de quedarse en 16), TypeScript estricto, Tailwind v4, shadcn/ui, Supabase JS SDK oficial (`@supabase/ssr` con sesión por cookies). Durante toda la migración el sistema HTML actual sigue operando en Vercel; cuando los módulos React estén probados, se hace el switch del root del repo.

**Visión del proyecto `app/`:** no es solo migrar los 4 HTML, sino construir una **plataforma interna de operaciones** con dos tipos de módulos: (a) *ciclos* (Liquidaciones, Conciliación, F29 — registran estado de cumplimiento, ya existen como HTML) y (b) *gestiones / procesos guiados* nuevos (contrato de trabajo, finiquito, anexos, cartas) donde el trabajador carga lo mínimo y el sistema arma el documento desde la info que ya tiene del cliente. Supabase = fuente única de verdad. El **contrato de trabajo** es el arquetipo: el trabajador elige cliente/empresa → "Contrato nuevo" → el sistema precarga datos del empleador y pide solo los del empleado → merge con la plantilla tipo que cargó Felipe (abogado/admin) → documento que (1) se descarga, (2) queda en Supabase, y (3) da de alta al trabajador en el Excel compartido del cliente (Google Drive) que alimenta las liquidaciones. Datos personales (RUT, remuneración, domicilio) bajo **Ley 21.719 vigente** → RLS por rol desde el diseño.

**Roadmap:** Fase 0 shell (✓ hecho) · Fase 1 modelo de datos (`empresas`, `trabajadores`, `plantillas_documento`, `documentos_generados` + RLS) · Fase 2 módulo "Contrato nuevo" · Fase 3 integración Excel compartido (Google Sheets API) · Fase 4+ replicar patrón a otras gestiones y migrar ciclos.

**Estado del proyecto `app/` (al 09-06-2026):**
- **Stack/base (✓):** Next 16.2.7 App Router, TS estricto, Tailwind v4, shadcn/ui sobre **Base UI** (usa prop `render`, NO `asChild` de Radix), `@supabase/ssr` con sesión por cookies. Estructura con `src/` (rutas en `app/src/app/`). Env en `.env.local` (no versionado; ejemplo en `.env.example`).
- **Auth (✓):** login por magic link en `/login` con la MISMA validación contra `usuarios` (`correo` + `activo`) que el HTML, vía Server Action (`login/actions.ts`); callback en `/auth/callback` (soporta flujo PKCE `code` y `token_hash`); protección de rutas en `src/proxy.ts` (convención `proxy` de Next 16). Clientes Supabase en `src/lib/supabase/{client,server,middleware}.ts`; helper de sesión en `src/lib/auth.ts` (`getUsuarioActual`). Para login local: agregar `http://localhost:3000/**` a Redirect URLs en Supabase Auth.
- **Fase 0 — app-shell (✓):** sidebar colapsable (variante flotante) con secciones + menú de usuario (cierre de sesión vía cliente browser), topbar con fecha, layout autenticado en `src/app/(app)/layout.tsx`, home lanzador en `src/app/(app)/page.tsx` con tarjetas-stat de conteos reales de cartera. Todo se alimenta del **registro único de módulos** en `src/lib/modules.ts` (agregar módulo = una entrada ahí; estados `activo`/`desarrollo`/`proximamente`; visibilidad por rol).
- **Diseño (✓):** identidad corporativa extraída de rstaxlegal.cl — navy `#0B2545` (primario), teal `#17A2B8` (acento), slate `#34495E`; tipografía **Playfair Display** (títulos, util `font-heading`) + **Manrope** (cuerpo). Tokens y utilidades (`.stat-*`, `.card-soft`, gradiente del sidebar) en `src/app/globals.css`. Layout inspirado en un dashboard moderno (sidebar gradiente navy, tarjetas redondeadas, sombras suaves).
- **Liquidaciones (✓ migrado) y F29 (✓ migrado):** rutas `/liquidaciones` y `/f29` en `(app)`. Patrón: page servidor lee la vista (`v_checklist_mensual` / `v_checklist_f29`) + `usuarios` por período (searchParam `?periodo=YYYY-MM`, default = mes ANTERIOR al actual, porque lo que se trabaja/paga en un mes corresponde al período del mes previo —ej. en junio se trabaja mayo— vía `periodoPorDefecto()`) → client component (`*-client.tsx`) con resumen, filtros client-side, tabla y diálogo de edición → Server Action (`actions.ts`) hace el `update` con la sesión autenticada (RLS) y `revalidatePath`. Liquidaciones hereda responsable/modalidad a `clientes`; F29 NO (responsable independiente). Helpers compartidos: `src/lib/periodos.ts`, `src/lib/format.ts`, `src/lib/ciclos.ts` (tipos de vistas + clases de badges). Períodos generados dinámicamente (ya no hardcode 2026-05/06/07). Falta migrar: Conciliación.

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
