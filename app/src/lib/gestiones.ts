/** Tipos y utilidades de la bandeja unificada de gestiones (v_gestiones_oficina). */

/** Fila de `v_gestiones_oficina`: una gestión de cualquier módulo, normalizada. */
export type GestionRow = {
  fuente:
    | "solicitudes_rrhh"
    | "contratos"
    | "licencias_medicas"
    | "solicitudes_documento";
  gestion_id: string;
  tipo: string; // contrato | anexo | amonestacion | finiquito | vacaciones | permiso | licencia | documento
  trabajador: string | null;
  detalle: string | null;
  cliente_id: string | null;
  razon_social: string | null;
  estado: string;
  pendiente: boolean;
  responsable_id: string | null;
  responsable: string | null;
  asignado_at: string | null;
  created_at: string;
  updated_at: string | null;
};

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
