/** Tipos y catálogos del módulo Gestiones Felipe Rodríguez (sección con clave del dashboard). */

export type HitoCausa = {
  id: string;
  causa_id: string;
  fecha: string;
  detalle: string;
};

export type Causa = {
  id: string;
  caratula: string;
  materia: string | null;
  procedimiento: string | null;
  cliente: string | null;
  calidad: string | null;
  tribunal: string | null;
  rit_rol: string | null;
  fecha_notificacion: string | null;
  fecha_contestacion: string | null;
  proxima_gestion_fecha: string | null;
  proxima_gestion_detalle: string | null;
  proxima_audiencia_fecha: string | null;
  proxima_audiencia_tipo: string | null;
  carpeta_sharepoint: string | null;
  estado: string | null;
  plazo_fatal: string | null;
  plazo_fatal_detalle: string | null;
  hitos: HitoCausa[];
};

export type Contacto = {
  id: number;
  nombre: string;
  segmento: string;
  empresa_rubro: string | null;
  medio_preferido: string | null;
  contacto: string | null;
  referido_por: string | null;
  estado: string;
  fecha_proxima_accion: string | null;
  notas: string | null;
};

export type Cotizacion = {
  id: string;
  numero: string;
  fecha_emision: string | null;
  destinatario: string;
  tier: string | null;
  monto: string | null;
  estado: string;
  proxima_accion_fecha: string | null;
  proxima_accion_detalle: string | null;
  notas: string | null;
};

/** Workflow procesal, replicando exacto la vista Causas de ClickUp (espacio
 *  "Juicios y Gestiones"). El orden es el ciclo de vida de la causa. */
export const ESTADOS_CAUSA = [
  "prospecto",
  "inspección del trabajo",
  "redacción",
  "tramitación",
  "stand by - seguimiento",
  "contestación",
  "audiencia preparatoria",
  "audiencia de juicio",
  "corte apelaciones",
  "corte suprema",
  "acuerdo",
  "sentencia",
  "cerrada",
] as const;

/** Estados terminales (causa cerrada): se excluyen de plazos fatales y alertas. */
export const ESTADOS_CAUSA_TERMINALES = ["acuerdo", "sentencia", "cerrada"] as const;

/** Materias, según catálogo de ClickUp. */
export const MATERIAS_CAUSA = ["Laboral", "Familia", "Civil"] as const;

/** Tribunales frecuentes (catálogo de ClickUp). El campo admite además texto
 *  libre para tribunales fuera de esta lista. */
export const TRIBUNALES_CAUSA = [
  "JL Trabajo Valpo",
  "JLT Santiago 1°",
  "JLT Santiago 2°",
  "24° JC de Santiago",
  "2° J Familia Stgo",
  "JF de Viña del Mar",
  "27° JC de Santiago",
  "2° JL Quilpué",
  "3° JC de Viña del Mar",
  "JF de San Fernando",
  "JLT Puerto Montt",
  "29° JC Santiago",
] as const;

/** Deben calzar EXACTO con el CHECK de la tabla `contactos`. */
export const ESTADOS_CONTACTO = [
  "Por contactar",
  "Contactado",
  "Respondió",
  "Reunión agendada",
  "Traspasado a cotizaciones",
  "Sin respuesta (pausa)",
  "Sin interés",
  "Referido entregado",
] as const;

export const SEGMENTOS_CONTACTO = ["A", "B", "C", "D"] as const;

/** Deben calzar EXACTO con el CHECK de la tabla `contactos`. */
export const MEDIOS_CONTACTO = [
  "WhatsApp",
  "Llamada",
  "LinkedIn",
  "Instagram",
  "Correo",
  "Presencial/tercero",
] as const;

/** Deben calzar EXACTO con el CHECK de la tabla `gestion_cotizaciones_rs`. */
export const ESTADOS_COTIZACION = [
  "Emitida",
  "En seguimiento",
  "En cierre",
  "Cerrada",
  "Cerrada y pagada",
  "Perdida",
] as const;

export const SEGMENTO_LABEL: Record<string, string> = {
  A: "A · Prospecto directo",
  B: "B · Fuente de referidos",
  C: "C · Cliente actual",
  D: "D · Referido recibido",
};

// ===================== Gerencia =====================

/** Deben calzar EXACTO con el CHECK de las tablas gerencia_*. */
export const CATEGORIAS_GERENCIA = ["OPEN", "SEGUNDA", "TERCERA", "PUBA"] as const;
export type CategoriaGerencia = (typeof CATEGORIAS_GERENCIA)[number];

export type CarteraItem = {
  id: string;
  codigo: string | null;
  cliente: string;
  modalidad: string | null;
  categoria: string;
  uf: number | null;
  valor: number;
  n_trabajadores: number | null;
  n_sociedades: number | null;
  es_prospecto: boolean;
  activo: boolean;
  notas: string | null;
};

export type MetaCategoria = {
  categoria: string;
  rango_uf: number;
  objetivo_cantidad: number;
  orden: number;
};

export type HitoGerencia = {
  id: string;
  nombre: string;
  uf_objetivo: number | null;
  descripcion: string | null;
  orden: number;
};

/** Un punto de la serie de crecimiento. El real efectivo es realManual si Felipe
 *  lo digitó (criterio propio, como en el Excel) y si no, el neto en vivo del panel. */
export type PuntoCrecimiento = {
  mes: string; // YYYY-MM
  meta: number;
  real: number | null; // realManual ?? realVivo
  realVivo: number | null; // neto emitido según la grilla de facturación
  realManual: number | null; // valor digitado a mano (override)
  uf: number | null;
  enVivo: boolean; // true = mes con documentos en el panel
};

export type Posicion = {
  id: string;
  financista: string;
  monto_total: number;
  capital_cuota: number | null;
  interes_cuota: number | null;
  valor_cuota: number;
  num_cuotas: number;
  primera_cuota: string;
  cuotas_pagadas: number;
  estado: string;
  observaciones: string | null;
};

export type AdItem = {
  id: string;
  tipo: "gasto" | "conversion";
  fecha: string;
  detalle: string;
  monto: number;
  categoria: string | null;
};

export type DeudaCliente = {
  id: string;
  cliente: string;
  monto: number;
  motivo: string | null;
  status: string;
};

export type LinkPlan = {
  id: string;
  nombre: string;
  monto: string | null;
  observaciones: string | null;
  link: string;
  orden: number;
};

export type EmisionItem = {
  id: string;
  periodo: string; // YYYY-MM
  cliente: string;
  rut: string | null;
  valor: number;
  observaciones: string | null;
  emitida: boolean;
  activo: boolean;
};

export type DatosGerencia = {
  cartera: CarteraItem[];
  metasCategoria: MetaCategoria[];
  hitos: HitoGerencia[];
  crecimiento: PuntoCrecimiento[];
  posiciones: Posicion[];
  ads: AdItem[];
  deudas: DeudaCliente[];
  links: LinkPlan[];
  emision: EmisionItem[];
  ufActual: number;
  pendienteMes: number;
};
