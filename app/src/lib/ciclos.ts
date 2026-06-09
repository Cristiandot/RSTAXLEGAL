/** Tipos de las vistas Postgres de ciclos y utilidades compartidas. */

export type UsuarioOpcion = { id: string; nombre: string };

/** Fila de `v_checklist_mensual` (ciclo Previred / Liquidaciones). */
export type LiquidacionRow = {
  ciclo_id: string;
  cliente_id: string;
  periodo: string;
  razon_social: string;
  rut_empresa: string | null;
  previred_rut: string | null;
  modalidad_previred: string;
  estado: string;
  responsable: string | null;
  responsable_default: string | null;
  responsable_default_id: string | null;
  plazo_previred: string | null;
  dias_restantes_previred: number | null;
  fecha_consulta_enviada: string | null;
  fecha_detalle_recibido: string | null;
  fecha_liquidaciones_enviadas: string | null;
  fecha_previred_presentada: string | null;
  fecha_previred_listo_pago: string | null;
  fecha_previred_pagado: string | null;
  monto_previred_total: number | string | null;
  observaciones: string | null;
};

/** Fila de `v_checklist_f29` (ciclo F29). */
export type F29Row = {
  ciclo_id: string;
  periodo: string;
  razon_social: string;
  rut_empresa: string | null;
  conciliacion_ok: boolean;
  estado: string;
  responsable: string | null;
  plazo_f29: string | null;
  dias_restantes_f29: number | null;
  fecha_f29_armado: string | null;
  fecha_f29_presentado: string | null;
  monto_a_pagar: number | string | null;
  folio_f29: string | null;
  observaciones: string | null;
};

/** Clase de color para el badge de estado (Tailwind). */
export function claseEstado(estado: string): string {
  switch (estado) {
    case "Cerrado":
    case "Previred pagado":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Sin iniciar":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "Pendiente Previred":
    case "Pendiente presentación":
    case "Previred listo para pago RS":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

/** Clase de color para la celda de días restantes. */
export function claseDias(estado: string, dias: number | null): string {
  if (estado === "Cerrado" || estado === "Previred pagado")
    return "text-muted-foreground";
  if (dias === null) return "text-muted-foreground";
  if (dias <= 5) return "font-semibold text-red-600";
  if (dias <= 10) return "font-medium text-amber-600";
  return "text-foreground";
}
