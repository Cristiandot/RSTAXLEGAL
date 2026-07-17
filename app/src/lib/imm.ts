/**
 * Ingreso Mínimo Mensual vigente — única fuente de verdad para las notas de
 * referencia de la UI (contratos, solicitudes).
 *
 * Los CÁLCULOS (liquidaciones, gratificación, finiquitos) NO usan esta
 * constante: toman `rmi_general` de `indicadores_previred` del período.
 * Esta constante existe para los formularios que no cargan indicadores.
 *
 * Al cambiar el IMM: actualizar valor y vigencia aquí, y verificar que
 * `indicadores_previred.rmi_general` del período nuevo esté cargado.
 */
export const IMM_VIGENTE = 553_553; // desde junio 2026 (retroactivo mayo pagado como ajuste)
export const JORNADA_ORDINARIA_HRS = 42; // Ley 21.561

/** Piso legal proporcional del sueldo base según horas semanales pactadas. */
export function immProporcional(horas: number): number {
  return Math.round((IMM_VIGENTE * horas) / JORNADA_ORDINARIA_HRS);
}

const clp = (n: number) => "$" + n.toLocaleString("es-CL");

/** Texto de referencia estándar para las cajas informativas de sueldos mínimos. */
export const IMM_REFERENCIA = {
  imm: clp(IMM_VIGENTE),
  h42: clp(immProporcional(42)),
  h30: clp(immProporcional(30)),
  h20: clp(immProporcional(20)),
};
