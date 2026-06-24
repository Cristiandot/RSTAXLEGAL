/**
 * Factores de cálculo de horas extraordinarias (Art. 30-32 Código del Trabajo).
 *
 * Reproduce EXACTAMENTE la tabla "Factores de cálculo horas extras" de KAME
 * (validado fila por fila: jornadas 1..45 h × 4 bases de remuneración, recargo
 * 50%, diferencia 0). En vez de almacenar la tabla, usamos la fórmula que la
 * genera, así sirve para cualquier recargo (ej. 100%) y cualquier jornada.
 *
 * El factor convierte la remuneración en el valor de UNA hora extraordinaria:
 *   valor hora extra = remuneración base × factor
 *   total           = valor hora extra × nº de horas extras
 *
 * Bases (según cómo está pactada la remuneración del trabajador):
 *  - "mensual": sueldo mensual. Factor = 7·(1+r) / (J·30)
 *      (en un mes hay 30/7 semanas → horas ordinarias mensuales = J·30/7).
 *  - "semanal": sueldo semanal. Factor = (1+r) / J.
 *  - "diario_6": sueldo diario, jornada distribuida en 6 días. Factor = 6·(1+r) / J.
 *  - "diario_5": sueldo diario, jornada distribuida en 5 días. Factor = 5·(1+r) / J.
 *
 * donde J = horas de la jornada ordinaria SEMANAL pactada en el contrato (no el
 * máximo legal) y r = recargo (mínimo legal 0.5).
 */

export type BaseHoraExtra = "mensual" | "semanal" | "diario_6" | "diario_5";

/** Recargo mínimo legal de la hora extraordinaria (Art. 32 inc. 3). */
export const RECARGO_MINIMO = 0.5;

/**
 * Factor por el que se multiplica la remuneración base para obtener el valor de
 * una hora extraordinaria. `jornadaSemanal` en horas (> 0); `recargo` como
 * fracción (0.5 = 50%).
 */
export function factorHoraExtra(
  jornadaSemanal: number,
  base: BaseHoraExtra = "mensual",
  recargo: number = RECARGO_MINIMO,
): number {
  if (jornadaSemanal <= 0) return 0;
  const r = 1 + recargo;
  switch (base) {
    case "mensual":
      return (7 * r) / (jornadaSemanal * 30);
    case "semanal":
      return r / jornadaSemanal;
    case "diario_6":
      return (6 * r) / jornadaSemanal;
    case "diario_5":
      return (5 * r) / jornadaSemanal;
  }
}

/** Valor en pesos de UNA hora extraordinaria (sin redondear). */
export function valorHoraExtra(
  remuneracionBase: number,
  jornadaSemanal: number,
  base: BaseHoraExtra = "mensual",
  recargo: number = RECARGO_MINIMO,
): number {
  return remuneracionBase * factorHoraExtra(jornadaSemanal, base, recargo);
}

/**
 * Total de horas extras del período: valor hora × cantidad de horas.
 * `horas` admite decimales (ej. 1,5 h = 1 h 30 min). El redondeo final a peso
 * lo decide quien arma la liquidación (KAME redondea el total).
 */
export function totalHorasExtras(
  remuneracionBase: number,
  jornadaSemanal: number,
  horas: number,
  base: BaseHoraExtra = "mensual",
  recargo: number = RECARGO_MINIMO,
): number {
  return valorHoraExtra(remuneracionBase, jornadaSemanal, base, recargo) * horas;
}
