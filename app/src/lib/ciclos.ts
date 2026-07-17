/** Tipos de las vistas Postgres de ciclos y utilidades compartidas. */

export type UsuarioOpcion = { id: string; nombre: string };

/** Fila de `v_checklist_mensual` (ciclo Previred / Liquidaciones). */
export type LiquidacionRow = {
  ciclo_id: string;
  cliente_id: string;
  periodo: string;
  razon_social: string;
  /** 'empresa' | 'casa_particular' (empleador persona natural, asesora del hogar). */
  tipo_cliente: string;
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
  fecha_dnp_pagado: string | null;
  monto_previred_total: number | string | null;
  observaciones: string | null;
  /** Aviso de imposiciones pagadas: fecha del correo + destinatarios a mostrar. */
  fecha_correo_previred_enviado: string | null;
  correo_empresa: string | null;
  contacto_correo: string | null;
  correos_adicionales: string[] | null;
  /** Correo a nivel de cliente (grupos_cliente) — último fallback del destino. */
  grupo_correo: string | null;
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
  postergacion_monto: number | string | null; // (dormido) monto histórico; la postergación hoy es booleana
  postergar_iva: boolean; // el cliente puede postergar el pago del IVA (lo postergable = IVA del desglose)
  comentario_correo: string | null; // comentario personalizado del contador — sale en la Comunicación mensual
  // Desglose del F29 para el detalle al cliente (solo se muestran los con monto).
  monto_iva: number | string | null;
  imp_unico: number | string | null;
  monto_retenciones: number | string | null;
  monto_otros: number | string | null;
  observaciones: string | null;
  grupo_codigo: string | null; // código del grupo (A.1, B.2, C.10…) para el orden por prioridad
  // Recargos por atraso y convenio de pago (captura interna; alimenta el detalle
  // F29 del cliente). La postergación de IVA es el booleano postergar_iva de arriba.
  multa: number | string | null; // interés y multa por presentación/pago fuera de plazo
  condonacion: number | string | null; // condonación de recargos otorgada
  convenio_folio: string | null; // N° de convenio de pago (Tesorería) que cubre el período
  convenio_monto: number | string | null; // monto de este F29 incluido en el convenio
};

/** Fila de `v_comunicacion_mensual` (resumen mensual de pagos por empresa). */
export type ComunicacionRow = {
  comunicacion_id: string;
  cliente_id: string;
  periodo: string;
  razon_social: string;
  rut_empresa: string | null;
  correo_empresa: string | null;
  previred_centros: number;
  previred_detalle_total: number | string | null; // suma de los centros de costo cargados
  previred_total_ciclo: number | string | null; // monto_previred_total del ciclo Liquidaciones
  monto_previred: number | string | null; // efectivo: detalle si hay, si no el del ciclo
  plazo_previred: string | null;
  monto_f29_override: number | string | null; // override manual guardado en el módulo
  monto_f29_ciclo: number | string | null; // monto_a_pagar del ciclo F29
  monto_f29: number | string | null; // efectivo: override si hay, si no el del ciclo
  plazo_f29: string | null;
  facturas_pendientes: number;
  facturas_pendientes_monto: number | string | null;
  total_a_pagar: number | string | null;
  observaciones: string | null;
  fecha_correo_enviado: string | null;
  estado: string; // 'Enviado' | 'Pendiente'
  grupo_id: string | null; // grupos_cliente: empresas del mismo cliente van en un solo correo
  grupo_nombre: string | null;
  dnp_declarado: boolean; // el ciclo de Liquidaciones quedó con DNP (declaración sin pago)
  fecha_dnp_declarado: string | null; // fecha en que se declaró el DNP
  fecha_dnp_pagado: string | null; // fecha en que el cliente pagó la planilla DNP
  f29_postergar_iva: boolean; // opción de postergar IVA habilitada (del módulo F29)
  f29_comentario: string | null; // comentario personalizado del contador (del módulo F29)
  correos_adicionales: string[] | null; // casillas extra del cliente — van en copia
  // Desglose del F29 (solo los conceptos con monto salen en el correo).
  f29_iva: number | string | null;
  f29_imp_unico: number | string | null;
  f29_retenciones: number | string | null;
  f29_ppm: number | string | null;
  f29_otros: number | string | null;
};

/**
 * Copias del correo de Comunicación mensual: SOLO los correos adicionales
 * asignados a las empresas incluidas (criterio Cristian 10-07-2026). El correo
 * principal de las otras empresas del grupo NO se suma automáticamente — si
 * corresponde, se agrega como correo adicional en la ficha. Dedupe y sin el
 * destinatario principal.
 */
export function copiasComunicacion(
  empresas: Pick<ComunicacionRow, "correo_empresa" | "correos_adicionales">[],
  destino: string,
): string[] {
  const vistos = new Map<string, string>();
  const destinoLc = destino.trim().toLowerCase();
  for (const emp of empresas) {
    const candidatos = Array.isArray(emp.correos_adicionales)
      ? emp.correos_adicionales
      : [];
    for (const raw of candidatos) {
      const correo = String(raw ?? "").trim();
      const clave = correo.toLowerCase();
      if (!correo.includes("@") || clave === destinoLc || vistos.has(clave)) continue;
      vistos.set(clave, correo);
    }
  }
  return [...vistos.values()];
}

/** Centro de costo con su monto Previred (tabla comunicacion_previred). */
export type CentroCostoRow = {
  id: string;
  comunicacion_id: string;
  centro_costo: string;
  monto: number | string;
  orden: number;
};

/** Factura RS pendiente de pago, para el detalle del mensaje. */
export type FacturaPendienteRow = {
  id: string;
  cliente_id: string;
  folio: number;
  periodo: string;
  monto: number | string | null;
};

/** Clase de color para el badge de estado (Tailwind). */
export function claseEstado(estado: string): string {
  switch (estado) {
    case "Pagado":
    case "Previred pagado":
    case "DNP declarado":
    case "DNP pagado":
    case "Conciliado":
    case "Enviado":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Declarado":
    case "Guardado y enviado":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "Declarado":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "Sin iniciar":
      return "border-slate-200 bg-slate-100 text-slate-600";
    case "Descargando":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "Fondos en RS":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "Pendiente Previred":
    case "Pendiente presentación":
    case "Previred listo para pago RS":
    case "Pendiente":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

/** Clase de color para la celda de días restantes. */
export function claseDias(estado: string, dias: number | null): string {
  if (
    estado === "Pagado" ||
    estado === "Previred pagado" ||
    estado === "DNP declarado" ||
    estado === "DNP pagado"
  )
    return "text-muted-foreground";
  if (dias === null) return "text-muted-foreground";
  if (dias <= 5) return "font-semibold text-red-600";
  if (dias <= 10) return "font-medium text-amber-600";
  return "text-foreground";
}
