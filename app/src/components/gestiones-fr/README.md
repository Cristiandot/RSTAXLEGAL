# Módulo "Gestiones Felipe Rodríguez"

Panel personal de Felipe Rodríguez dentro del dashboard RSTL. Ruta `/(app)/gestiones-fr`;
componente raíz `@/components/gestiones-felipe` (protegido por **clave de 4 dígitos `5753`**,
guardada en `sessionStorage`). Toda la data se carga de una vez con `cargarGestionesFR()` +
`cargarGerencia()` (server actions en `actions.ts`) al desbloquear.

Supabase: proyecto `nnwoknmbbxbjzswrkzmw`. Deploy: push a `main` → Vercel (ver más abajo).

## Pestañas (en `gestiones-felipe.tsx`)

Orden y vista por defecto: **Time Box** (default) · Causas judiciales · Gestiones · Prospección & Cotizaciones · Gerencia · Pendientes.

| Pestaña | Componente | Descripción |
|---|---|---|
| Time Box | `modulo-timebox.tsx` | Vista de inicio. Agenda del día (navegable) por franjas horarias + tarjeta "Propuesta del día". |
| Causas judiciales | `modulo-causas.tsx` | Causas agrupadas por estado, ficha lateral (Sheet), calendario judicial. |
| Gestiones | `modulo-gestiones.tsx` | Trabajo legal no litigioso (compraventas, estudios, solicitudes…). Misma UX que Causas. |
| Prospección & Cotizaciones | `modulo-comercial.tsx` | Contactos y cotizaciones. |
| Gerencia | `modulo-gerencia.tsx` | Facturación vs meta, cartera, posiciones, etc. |
| Pendientes | `modulo-pendientes.tsx` | Agenda personal: pendientes propios + requerimientos del equipo + vencimientos derivados. |

## Modelo de datos (tablas propias en Supabase)

Todas con RLS igual a las `gestion_*`: `authenticated` hace SELECT/INSERT/UPDATE (qual `true`),
DELETE solo `es_admin()`.

- **`gestion_causas_rs`** (+ `gestion_causas_hitos`): causas judiciales. Campos clave: `caratula`
  (formato `DEMANDANTE/DEMANDADO`), `materia`, `calidad` (Ataque=demandante / Defensa=demandado),
  `tribunal`, `rit_rol`, `estado`, `proxima_gestion_fecha/hora/detalle`,
  `proxima_audiencia_fecha/hora/tipo`, `carpeta_sharepoint`. `plazo_fatal*` quedó sin uso en la UI.
- **`gestion_legal_rs`** (+ `gestion_legal_hitos`): gestiones legales. `titulo`, `tipo`, `cliente`,
  `contraparte`, `estado`, `proxima_gestion_fecha/hora/detalle`, `notas`, `carpeta_sharepoint`.
- **`pendientes_fr`** (+ `pendientes_fr_hitos`): pendientes manuales. `numero` (correlativo persistente,
  `default nextval(pendientes_fr_numero_seq)`, único — no se reordena ni reutiliza), `titulo`, `detalle`,
  `area` (causas/gestiones/prospeccion/gerencia/otro), `fecha`+`hora` (vencimiento), `hecho`,
  `causa_id` (fk → `gestion_causas_rs`, on delete set null).
- **`agenda_externa`**: eventos copiados del calendario Outlook de Felipe. `ext_id` (id del evento,
  único), `fecha`, `hora`, `fin_hora`, `titulo`, `ubicacion`, `fuente`.
- **`propuesta_diaria_fr`**: propuesta de trabajo diaria. `fecha` (pk), `contenido` (texto), `generada_at`.

Lecturas de otras tablas: **`v_gestiones_oficina`** (requerimientos — ver Pendientes), `contactos`,
`gestion_cotizaciones_rs`, `gerencia_*`, `indicadores_previred`.

## Catálogos y convenciones (`tipos.ts`)

- `ESTADOS_CAUSA` (13, replican la vista Causas de ClickUp): prospecto · inspección del trabajo ·
  redacción · tramitación · stand by - seguimiento · contestación · audiencia preparatoria ·
  audiencia de juicio · corte apelaciones · corte suprema · acuerdo · sentencia · **cerrada**
  (terminal → histórico). `ESTADO_COLOR` da el color por estado. `ESTADOS_CAUSA_TERMINALES`.
- `MATERIAS_CAUSA` (Laboral/Familia/Civil) — pestañas de materia en Causas. `TRIBUNALES_CAUSA` (catálogo
  + texto libre vía datalist).
- `ESTADOS_GESTION` (En análisis → En trámite → En espera de terceros → Por firmar → Terminada),
  `TIPOS_GESTION`, `ESTADO_GESTION_COLOR`.
- `AREAS_PENDIENTE`, `AREA_PENDIENTE_LABEL`.
- **`FELIPE_ID` = `a93e8f17-7f21-418a-9895-c612aa02dd0c`** (en `actions.ts`) — para filtrar sus requerimientos.

### Fechas con hora
Cada fecha relevante lleva una columna `*_hora` (texto `HH:mm`) al lado — **no** se migró a
`timestamptz` (para no romper el agrupado por fecha del calendario). En la UI se editan con un solo
input `datetime-local`; el util `fecha-hora.ts` (`dtLocal` / `splitDT` / `fmtFechaHora`) combina y
separa fecha+hora.

## Notas por vista

- **Causas**: agrupadas por estado (encabezados de color), ficha lateral con intervinientes (parsea la
  carátula por `/` o ` con `), datos, estado y agenda editables, bitácora de hitos. Pestañas por materia
  + toggle "Histórico" (estado `cerrada`). Calendario (`calendario.tsx`) muestra audiencias/gestiones,
  **feriados nacionales de Chile** (`FERIADOS`, 2026-2027, solo nacionales) y la **capa "Mi calendario"**
  (agenda_externa, índigo). Clic en un evento abre la ficha de esa causa.
- **Pendientes** (orden de las secciones): (1) *Requerimientos del equipo asignados a mí* — espejo de
  `v_gestiones_oficina` (`fuente=tareas_oficina`, `responsable_id=FELIPE_ID`, `pendiente`), misma info que
  la bandeja de Inicio (#N, cliente + categoría/SLA con `lib/gestiones`, empresa, canal, semáforo);
  "terminar" cierra la tarea en `tareas_oficina` (mismo mecanismo que la bandeja → aparece cerrada allá).
  (2) *Mis pendientes* — manuales con `area != "otro"`, ordenados por vencimiento, con `numero` visible,
  días de atraso ("+N d"), bitácora y **"Causa relacionada"** (al completar un pendiente con `causa_id`
  se inserta un hito en esa causa); incluye el formulario "Nuevo pendiente". (3) *Otros pendientes* —
  los manuales con `area == "otro"`, en panel aparte (misma fila/ficha; helpers `listaManual`/`hechosBloque`
  reutilizados). (4) *Vencimientos de mis áreas* — derivado (solo lectura) de próximas gestiones de
  causas/gestiones y próximas acciones de prospección; ventana por defecto de **10 días** (+ vencidos),
  resto oculto. **Las audiencias NO son pendientes** (viven en la causa y el calendario); sí las gestiones.
- **Time Box**: bloques del día por hora (audiencias, gestiones, pendientes, prospección, agenda) + lo
  "sin hora" arriba + tarjeta con la `propuesta_diaria_fr` del día.

## Propuesta diaria automática
Agente programado **local** `propuesta-diaria-fr` (`~/.claude/scheduled-tasks/`), ~07:00 hora Chile:
lee causas/gestiones/pendientes/agenda vía Supabase MCP y hace upsert en `propuesta_diaria_fr`.
Corre **solo con la app Claude Code abierta** (si cerrada, al siguiente inicio). Alternativa robusta si
se necesita 100% garantizado: edge function + pg_cron (pero sin redacción con criterio).

## Copiar el calendario Outlook (proceso manual)
El panel **no** lee Outlook (no hay Microsoft Graph). Claude lo copia **bajo demanda** vía el MCP de
Outlook: lee los eventos, convierte la hora **UTC → Chile** (−4 hasta el 2026-09-05, −3 desde el
2026-09-06; DST: 1er sáb de abril y de septiembre) y (a) rellena `proxima_audiencia_hora` de las causas
cuya fecha coincide, y (b) inserta las citas propias (reuniones, comparendos, plazos) en `agenda_externa`.

## Deploy
`push` a `main` → Vercel (deploy Production desde `main`). Antes de commitear: `npx tsc --noEmit` +
`npx eslint <archivos>`. **El auto-deploy de Vercel gatilla con retraso y a veces no dispara**; el patrón
es empujar un **commit vacío** (`git commit --allow-empty`) y, si aún no toma, **re-gatillar con otro**.
Verificación del estado vía GitHub Deployments API (`gh api repos/Cristiandot/RSTAXLEGAL/deployments`).
