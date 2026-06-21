/**
 * Balance de Comprobación y Saldos de 8 columnas.
 *
 * A partir de las líneas del libro diario (CONTAB) agrega por cuenta y arma
 * las 8 columnas clásicas:
 *   Sumas:      Debe | Haber
 *   Saldos:     Deudor | Acreedor
 *   Inventario: Activo | Pasivo        (cuentas de balance)
 *   Resultado:  Pérdida | Ganancia     (cuentas de resultado)
 *
 * La utilidad (o pérdida) del ejercicio cuadra las dos últimas secciones.
 */

import type { LineaDiario } from "./centralizacion";

export type TipoCuenta = "activo" | "pasivo" | "ingreso" | "gasto";

export type CuentaPlan = {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
};

export type BalanceFila = {
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  debe: number;
  haber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
  activo: number;
  pasivo: number;
  perdida: number;
  ganancia: number;
};

export type BalanceTotales = {
  debe: number;
  haber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
  activo: number;
  pasivo: number;
  perdida: number;
  ganancia: number;
  /** > 0 utilidad del ejercicio; < 0 pérdida del ejercicio. */
  resultadoEjercicio: number;
  /** true si Σ Debe = Σ Haber (partida doble cuadrada). */
  cuadra: boolean;
};

export function construirBalance(
  lineas: LineaDiario[],
  cuentas: CuentaPlan[],
): { filas: BalanceFila[]; totales: BalanceTotales } {
  const planPorCodigo = new Map(cuentas.map((c) => [c.codigo, c]));

  // Agregar Debe/Haber por cuenta
  const acum = new Map<string, { debe: number; haber: number }>();
  for (const l of lineas) {
    const cur = acum.get(l.cuenta) ?? { debe: 0, haber: 0 };
    cur.debe += l.debe;
    cur.haber += l.haber;
    acum.set(l.cuenta, cur);
  }

  const filas: BalanceFila[] = [];
  for (const [codigo, mov] of acum) {
    const plan = planPorCodigo.get(codigo);
    const tipo: TipoCuenta = plan?.tipo ?? "activo";
    const nombre = plan?.nombre ?? "(cuenta fuera del plan)";
    const saldoDeudor = Math.max(0, mov.debe - mov.haber);
    const saldoAcreedor = Math.max(0, mov.haber - mov.debe);

    const esBalance = tipo === "activo" || tipo === "pasivo";
    filas.push({
      codigo,
      nombre,
      tipo,
      debe: mov.debe,
      haber: mov.haber,
      saldoDeudor,
      saldoAcreedor,
      activo: esBalance ? saldoDeudor : 0,
      pasivo: esBalance ? saldoAcreedor : 0,
      perdida: !esBalance ? saldoDeudor : 0,
      ganancia: !esBalance ? saldoAcreedor : 0,
    });
  }

  filas.sort((a, b) => a.codigo.localeCompare(b.codigo));

  const sum = (f: (x: BalanceFila) => number) =>
    filas.reduce((a, x) => a + f(x), 0);

  const totales: BalanceTotales = {
    debe: sum((x) => x.debe),
    haber: sum((x) => x.haber),
    saldoDeudor: sum((x) => x.saldoDeudor),
    saldoAcreedor: sum((x) => x.saldoAcreedor),
    activo: sum((x) => x.activo),
    pasivo: sum((x) => x.pasivo),
    perdida: sum((x) => x.perdida),
    ganancia: sum((x) => x.ganancia),
    resultadoEjercicio: 0,
    cuadra: false,
  };
  totales.resultadoEjercicio = totales.ganancia - totales.perdida;
  totales.cuadra = Math.abs(totales.debe - totales.haber) < 1;

  return { filas, totales };
}
