/** Tipos y helpers del módulo Convenios y multas. */

export type TipoConvenio = "convenio" | "multa";
export type Organismo = "sii" | "tesoreria" | "dt" | "otro";
export type EstadoConvenio = "Vigente" | "Pagado" | "Caído";

/** Fila de `v_convenios` (convenio + cliente + progreso de cuotas). */
export type ConvenioRow = {
  id: string;
  cliente_id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_codigo: string | null;
  tipo: TipoConvenio;
  organismo: Organismo;
  folio: string | null;
  concepto: string | null;
  monto_total: number | string | null;
  fecha_suscripcion: string | null;
  caido: boolean;
  observaciones: string | null;
  responsable_id: string | null;
  responsable: string | null;
  n_cuotas: number;
  cuotas_pagadas: number;
  monto_pagado: number | string | null;
  proximo_vencimiento: string | null;
  estado: EstadoConvenio;
  periodos_f29: string[] | null;
};

/** Fila de `convenio_cuota`. */
export type CuotaRow = {
  id: string;
  convenio_id: string;
  n_cuota: number;
  monto: number | string | null;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
};

export const TIPO_LABEL: Record<TipoConvenio, string> = {
  convenio: "Convenio de pago",
  multa: "Multa",
};

export const ORGANISMO_LABEL: Record<Organismo, string> = {
  sii: "SII",
  tesoreria: "Tesorería",
  dt: "Dirección del Trabajo",
  otro: "Otro",
};

/** Clase de color del badge de estado, alineada al resto del panel. */
export function claseEstadoConvenio(estado: EstadoConvenio): string {
  switch (estado) {
    case "Pagado":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Caído":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}
