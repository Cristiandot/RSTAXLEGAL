/** Tipos y utilidades del módulo Onboarding y Calidad de Datos. */

/** Etapa del onboarding de una empresa (col `clientes.onboarding_estado`). */
export const ESTADOS_ONBOARDING = [
  "pendiente_contacto",
  "invitado",
  "en_proceso",
  "en_revision",
  "completo",
] as const;
export type EstadoOnboarding = (typeof ESTADOS_ONBOARDING)[number];

export const LABEL_ESTADO: Record<string, string> = {
  pendiente_contacto: "Pendiente de contacto",
  invitado: "Invitado",
  en_proceso: "En proceso",
  en_revision: "En revisión",
  completo: "Completo",
};

/** Columna `onboarding_<estado>_at` que se estampa al pasar a cada etapa. */
export const HITO_ESTADO: Record<string, string | null> = {
  pendiente_contacto: null,
  invitado: "onboarding_invitado_at",
  en_proceso: "onboarding_en_proceso_at",
  en_revision: "onboarding_en_revision_at",
  completo: "onboarding_completo_at",
};

export function claseEstadoOnboarding(estado: string): string {
  switch (estado) {
    case "completo":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "en_revision":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "en_proceso":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "invitado":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

/** Clase del badge de fuente del dato. */
export function claseFuente(fuente: string): string {
  switch (fuente) {
    case "SII":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "KAME":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "CLIENTE":
      return "border-teal-200 bg-teal-50 text-teal-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

/** Color del % de completitud. */
export function claseCompletitud(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 90) return "font-semibold text-emerald-600";
  if (pct >= 60) return "font-medium text-amber-600";
  return "font-semibold text-red-600";
}

/** Opción de un selector cerrado (fila de `catalogo_valores`). */
export type CatalogoOpcion = { codigo: string; etiqueta: string };
/** Opciones por tipo de selector (afp, comuna, banco, …). */
export type Catalogos = Record<string, CatalogoOpcion[]>;

/** Letras de cartera OneDrive/ClickUp para clientes nuevos. */
export const GRUPOS_CARTERA = [
  { codigo: "A", etiqueta: "A — Cartera histórica" },
  { codigo: "B", etiqueta: "B — Grupo abril 2026 (1)" },
  { codigo: "C", etiqueta: "C — Grupo abril 2026 (2)" },
  { codigo: "D", etiqueta: "D — Cartera ligera" },
  { codigo: "Z", etiqueta: "Z — Otros" },
] as const;

/** Cliente (grupo de empresas): fila de `grupos_cliente` para el selector. */
export type GrupoClienteOpcion = {
  id: string;
  codigo: string | null;
  nombre: string;
};

/** Tipo de input para editar un campo, inferido por convención de nombre. */
export type TipoCampo = "texto" | "fecha" | "numero" | "rut" | "correo" | "lineas";

export function tipoCampo(campo: string): TipoCampo {
  if (campo.startsWith("fecha_")) return "fecha";
  if (campo === "sueldo_base" || campo === "horas_semanales") return "numero";
  if (campo === "rut" || campo === "rut_empresa" || campo.endsWith("_rut"))
    return "rut";
  if (campo.startsWith("correo") || campo.endsWith("_correo")) return "correo";
  if (campo === "socios" || campo === "actividades_sii") return "lineas";
  return "texto";
}

/** Placeholder de ayuda para los campos jsonb que se editan por líneas. */
export const PLACEHOLDER_LINEAS: Record<string, string> = {
  socios: "Una línea por socio: Nombre; RUT; % participación\nEj.: Juan Pérez; 12.345.678-5; 50",
  actividades_sii: "Un código o glosa de actividad por línea",
};

/** Definición de un campo del catálogo `onboarding_campos` (para formularios). */
export type CampoDef = {
  campo: string;
  etiqueta: string;
  grupo: string;
  fuente: string;
  selector: string | null;
  obligatorio: boolean;
};

/** Fila de la grilla de altas de /onboarding (empresa recién incorporada). */
export type AltaEmpresaRow = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  carpeta_onedrive: string | null;
  carpeta_solicitada_at: string | null;
  /** Carpeta raíz del cliente (fallback si la subcarpeta de la empresa no está identificada). */
  grupo_carpeta: string | null;
  /** Correo de contacto (de la empresa, o de la empresa misma, o del cliente). */
  correo: string | null;
  created_at: string;
};

/** Resumen de un cliente para la grilla de /clientes. */
export type ClienteResumenRow = {
  grupo_id: string;
  codigo: string | null;
  nombre: string;
  correo: string | null;
  n_empresas: number;
  /** % de completitud (promedio de fichas + trabajadores de sus empresas). */
  pct: number | null;
  faltan: number;
  carpeta_onedrive: string | null;
};

/** Empresa de un cliente (datos básicos para el detalle). */
export type EmpresaDeGrupo = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  pct: number | null;
  faltan: number;
  hace_f29: boolean | null;
  hace_liquidaciones: boolean | null;
  /** Trabajadores activos (dotación Previred de la sociedad). */
  n_trab_activos: number;
};

/** Fila de `v_onboarding_empresas` (+ el cliente/grupo al que pertenece). */
export type EmpresaOnboardingRow = {
  cliente_id: string;
  razon_social: string;
  rut_empresa: string | null;
  onboarding_estado: string;
  pct_empresa: number | null;
  faltan_empresa: number;
  n_trab: number;
  pct_trab: number | null;
  faltan_trab: number;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
};

/** Fila de `v_onboarding_por_campo`. */
export type PorCampoRow = {
  entidad: "cliente" | "trabajador";
  grupo: string;
  campo: string;
  etiqueta: string;
  fuente: string;
  requeridos: number;
  faltan: number;
};

/** Fila de detalle (drill-down): un campo faltante de un registro concreto. */
export type FaltanteRow = {
  entidad: "cliente" | "trabajador";
  registro_id: string;
  cliente_id: string;
  campo: string;
  etiqueta: string;
  grupo: string;
  fuente: string;
  registro_nombre: string;
  registro_rut: string | null;
};

/** Fila de la cola de validación (`cambios_propuestos` + nombres). */
export type CambioPropuestoRow = {
  id: string;
  entidad: "cliente" | "trabajador";
  registro_id: string;
  cliente_id: string | null;
  campo: string;
  etiqueta: string | null;
  valor_actual: string | null;
  valor_propuesto: string | null;
  origen: string;
  observacion: string | null;
  created_at: string;
  razon_social: string | null;
};
