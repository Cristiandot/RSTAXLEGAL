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

export const ESTADOS_CAUSA = [
  "En preparacion",
  "En curso",
  "En espera",
  "Terminada",
  "Archivada",
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
