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
  fecha_datos_nomina_ok: string | null;
  fecha_liq_confirmadas: string | null;
  fecha_previred_listo_pago: string | null;
  fecha_previred_pagado: string | null;
  fecha_dnp_declarado: string | null;
  monto_previred_total: number | string | null;
  observaciones: string | null;
};

/** Fila de `v_checklist_conciliacion` (ciclo Conciliación SII/KAME). */
export type ConciliacionRow = {
  ciclo_id: string;
  cliente_id: string;
  periodo: string;
  razon_social: string;
  rut_empresa: string | null;
  es_profesional_salud: boolean | null;
  kame_cert_estado: string | null;
  kame_cert_observacion: string | null;
  kame_cert_ultima_revision: string | null;
  rubro: string | null;
  responsable_id: string | null;
  responsable: string | null;
  fecha_compras_descargadas: string | null;
  fecha_ventas_descargadas: string | null;
  fecha_conciliacion_kame_ok: string | null;
  kame_cert_estado_al_cierre: string | null;
  observaciones: string | null;
  estado: string;
  iva_salud_ejecuciones: number;
  ultima_ejecucion_iva: string | null;
};

/** Ejecución de cambio IVA recuperable → no recuperable (clientes salud). */
export type IvaEjecucionRow = {
  id: string;
  cliente_id: string;
  fecha_ejecutada: string;
  observaciones: string | null;
  responsable_nombre: string | null;
};

/** Fila de `v_checklist_f29` (ciclo F29). */
export type F29Row = {
  ciclo_id: string;
  cliente_id: string;
  periodo: string;
  razon_social: string;
  rut_empresa: string | null;
  conciliacion_ok: boolean;
  estado: string;
  responsable: string | null;
  plazo_f29: string | null; // ya corrido al próximo día hábil (sáb/dom/feriado)
  dias_restantes_f29: number | null;
  fecha_f29_armado: string | null;
  fecha_f29_presentado: string | null;
  monto_a_pagar: number | string | null;
  ppm: number | string | null; // PPM pagado del período
  folio_f29: string | null;
  pago_por: string | null; // 'rs' | 'cliente' | null
  fecha_pago_oficina: string | null; // cuando paga RS: fecha en que el cliente pagó a la oficina
  correo_empresa: string | null; // correo del cliente (ficha) para el aviso de F29
  fecha_correo_f29_enviado: string | null; // último envío del aviso al cliente
  numero_operacion: string | null; // N° de operación del pago (cuando paga RS)
  fecha_pago_f29: string | null; // fecha en que se pagó el F29 (cuando paga RS)
  fecha_correo_pago_enviado: string | null; // último envío del aviso de pago al cliente
  observaciones: string | null;
};

/** Clase de color para el badge de estado (Tailwind). */
export function claseEstado(estado: string): string {
  switch (estado) {
    case "Pagado":
    case "Previred pagado":
    case "DNP declarado":
    case "Conciliado":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Cerrado":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Sin iniciar":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "Descargando":
      return "border-violet-200 bg-violet-50 text-violet-700";
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
  if (estado === "Pagado" || estado === "Previred pagado" || estado === "DNP declarado")
    return "text-muted-foreground";
  if (dias === null) return "text-muted-foreground";
  if (dias <= 5) return "font-semibold text-red-600";
  if (dias <= 10) return "font-medium text-amber-600";
  return "text-foreground";
}
