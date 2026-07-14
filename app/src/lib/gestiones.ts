/** Tipos y utilidades de la bandeja unificada de gestiones (v_gestiones_oficina). */

/** Fila de `v_gestiones_oficina`: una gestión de cualquier módulo, normalizada. */
export type GestionRow = {
  fuente:
    | "solicitudes_rrhh"
    | "contratos"
    | "licencias_medicas"
    | "solicitudes_documento"
    | "tareas_oficina";
  gestion_id: string;
  tipo: string; // contrato | anexo | amonestacion | finiquito | vacaciones | permiso | licencia | documento
  trabajador: string | null;
  detalle: string | null;
  cliente_id: string | null;
  razon_social: string | null; // empresa (razón social de la sociedad)
  cliente: string | null; // cliente = grupo (la relación/persona que atendemos)
  cliente_codigo: string | null; // código del grupo (p.ej. A.2)
  grupo_id: string | null; // id del grupo (para listar sus empresas)
  titulo: string | null; // solo tareas: título editable
  detalle_raw: string | null; // solo tareas: detalle editable (sin el título)
  estado: string;
  pendiente: boolean;
  responsable_id: string | null;
  responsable: string | null;
  asignado_at: string | null;
  created_at: string;
  updated_at: string | null;
  canal: string | null; // portal | dashboard | correo | wati | telefono | otro
  plazo: string | null; // plazo de entrega (tareas manuales)
  resuelto_at: string | null; // cuándo salió de pendiente (estampado por trigger)
  justificacion_atraso: string | null; // nota del atraso (si se justificó)
  sla_horas: number | null; // SLA de su categoría, en horas
  cumplimiento: "a_tiempo" | "atrasado" | null; // solo cuando ya está resuelto
};

/** Canales por los que puede llegar un requerimiento. Correo/Wati aún no
 * están conectados al dashboard, pero la opción queda para cuando se integren. */
export const CANAL_LABEL: Record<string, string> = {
  portal: "Portal",
  dashboard: "Dashboard",
  correo: "Mail",
  wati: "Wati",
  telefono: "Teléfono",
  otro: "Otro",
};

/** Canales elegibles al crear una tarea manual con el botón "+". */
export const CANALES_TAREA = ["dashboard", "correo", "wati", "telefono", "otro"];

/** Etiqueta legible por tipo de gestión. */
export const TIPO_GESTION_LABEL: Record<string, string> = {
  contrato: "Contrato",
  anexo: "Anexo",
  amonestacion: "Amonestación",
  finiquito: "Finiquito",
  vacaciones: "Vacaciones",
  permiso: "Permiso",
  licencia: "Licencia médica",
  documento: "Documento",
  tarea: "Tarea",
};

/** Ruta del módulo donde se trabaja cada tipo de gestión. */
export const TIPO_GESTION_HREF: Record<string, string> = {
  contrato: "/contratos",
  anexo: "/anexos",
  amonestacion: "/amonestaciones",
  finiquito: "/finiquitos",
  vacaciones: "/vacaciones",
  permiso: "/permisos",
  licencia: "/licencias",
  documento: "/documentos",
  tarea: "/", // las tareas manuales viven en la bandeja del inicio
};

/** Clase Tailwind del badge por tipo de gestión. */
export function claseTipoGestion(tipo: string): string {
  switch (tipo) {
    case "contrato":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "anexo":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "amonestacion":
      return "border-red-200 bg-red-50 text-red-700";
    case "finiquito":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "vacaciones":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "permiso":
      return "border-teal-200 bg-teal-50 text-teal-700";
    case "licencia":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "documento":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "tarea":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

/**
 * SLA de atención por categoría del cliente, leída de la primera letra de su
 * código (A.2 → A). Reloj 24/7 (horas corridas). Open es la máxima prioridad.
 */
export const SLA_CATEGORIA: Record<
  string,
  { label: string; horas: number; orden: number }
> = {
  A: { label: "Open", horas: 12, orden: 1 },
  B: { label: "Segunda", horas: 24, orden: 2 },
  C: { label: "Tercera", horas: 36, orden: 3 },
  D: { label: "Puba", horas: 72, orden: 4 },
};

export type Categoria = {
  letra: string;
  label: string;
  horas: number;
  orden: number;
};

/** Categoría a partir del código del cliente/grupo (A.2 → Open). null si no aplica (p.ej. W). */
export function categoriaDe(codigo: string | null): Categoria | null {
  if (!codigo) return null;
  const letra = codigo[0]?.toUpperCase() ?? "";
  const s = SLA_CATEGORIA[letra];
  return s ? { letra, ...s } : null;
}

/** Clase Tailwind del badge de categoría (más prominente mientras más alta). */
export function claseCategoria(letra: string): string {
  switch (letra) {
    case "A":
      return "border-amber-300 bg-amber-100 text-amber-800";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "D":
      return "border-zinc-200 bg-zinc-100 text-zinc-500";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

export type Semaforo = {
  estado: "verde" | "amarillo" | "rojo";
  horas: number; // horas transcurridas desde que llegó (24/7)
  slaHoras: number;
  restante: number; // horas hasta vencer (negativo si ya venció)
};

/**
 * Semáforo SLA: horas corridas desde `createdAtIso` vs SLA de la categoría.
 * Verde <50% del SLA, amarillo 50–100%, rojo al vencer (≥100%).
 */
export function semaforoSla(createdAtIso: string, slaHoras: number): Semaforo {
  const horas = Math.max(0, (Date.now() - new Date(createdAtIso).getTime()) / 3_600_000);
  const ratio = slaHoras > 0 ? horas / slaHoras : 0;
  const estado = ratio >= 1 ? "rojo" : ratio >= 0.5 ? "amarillo" : "verde";
  return { estado, horas, slaHoras, restante: slaHoras - horas };
}

/**
 * Urgencia SLA para ordenar la bandeja: horas transcurridas / SLA de la
 * categoría. >1 = vencido. Devuelve -1 si el cliente no tiene categoría (va al final).
 */
export function urgenciaSla(createdAtIso: string, codigo: string | null): number {
  const c = categoriaDe(codigo);
  if (!c) return -1;
  const horas = Math.max(0, (Date.now() - new Date(createdAtIso).getTime()) / 3_600_000);
  return horas / c.horas;
}

/** "5h", "18h", "2d", "3d" — duración compacta en horas/días. */
export function formatDuracion(horas: number): string {
  const h = Math.round(Math.abs(horas));
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Días transcurridos desde una fecha ISO (timestamptz) hasta hoy. */
export function diasDesde(iso: string): number {
  const d = new Date(iso);
  const hoy = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
