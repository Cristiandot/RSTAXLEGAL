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
  estado: string;
  pendiente: boolean;
  responsable_id: string | null;
  responsable: string | null;
  asignado_at: string | null;
  created_at: string;
  updated_at: string | null;
  canal: string | null; // portal | dashboard | correo | wati | telefono | otro
  plazo: string | null; // plazo de entrega (tareas manuales)
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

/** Días transcurridos desde una fecha ISO (timestamptz) hasta hoy. */
export function diasDesde(iso: string): number {
  const d = new Date(iso);
  const hoy = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}
