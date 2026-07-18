"use client";

import { useEffect, useState } from "react";
import { Loader2, Landmark, Info, Sprout } from "lucide-react";
import { cargarRenta, type Renta } from "./reportes-actions";
import { cargarEstadoResultado, type MesResultado } from "./estado-resultado-actions";
import { cargarIndicadores } from "./portal-actions";

function clp(n: number): string {
  return (n < 0 ? "-$" : "$") + new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(n)));
}

const MES_ABR = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Proyeccion = {
  resultadoAnual: number;
  ventaAnual: number;
  gastosMenores: number;
  base: number;
  impuesto: number;
  ppm: number;
  rentaPagar: number;
  // Beneficio de reinversión (50% de la base, tope 5.000 UF).
  deduccion50: number; // 50% de la base (antes de tope)
  uf: number | null; // valor UF del indicador Previred
  topeUf5000: number | null; // 5.000 UF en $
  topado: boolean; // el 50% supera el tope
  deduccionMax: number; // rebaja efectiva (min 50% vs tope)
  ahorroReinv: number; // ahorro de impuesto con la rebaja efectiva
  tasaPct: number;
  mesesReales: number;
  mesesProyectados: number[]; // índices 1..12 proyectados
};

/**
 * Proyección de la renta: los meses no cerrados se estiman como el promedio de
 * los 3 meses inmediatamente anteriores, en cascada (un mes proyectado alimenta
 * el siguiente). Cerrado = mes con remuneraciones cargadas (info completa).
 */
function proyectar(
  meses: MesResultado[],
  ppm: number,
  tasaPct: number,
  uf: number | null,
): Proyeccion | null {
  if (meses.length === 0) return null;
  const resultado: (number | null)[] = Array(13).fill(null);
  const ventas: (number | null)[] = Array(13).fill(null);
  let ultimoReal = 0;
  let hayCerrado = false;
  for (const m of meses) {
    const mes = Number(m.periodo.slice(5, 7));
    if (mes < 1 || mes > 12) continue;
    resultado[mes] = Number(m.resultado ?? 0);
    ventas[mes] = Number(m.ingresos ?? 0);
    if (m.remun_cargada) {
      hayCerrado = true;
      if (mes > ultimoReal) ultimoReal = mes;
    }
  }
  // Sin meses cerrados (p. ej. año histórico sin remuneraciones): se toman como
  // reales todos los meses con datos y se proyecta solo lo que falte al final.
  if (!hayCerrado) {
    for (let mes = 12; mes >= 1; mes--) {
      if (resultado[mes] !== null) { ultimoReal = mes; break; }
    }
  }

  const proyectados: number[] = [];
  const prom3 = (arr: (number | null)[], mes: number) => {
    const v = [arr[mes - 1], arr[mes - 2], arr[mes - 3]].filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  for (let mes = 1; mes <= 12; mes++) {
    const esReal = mes <= ultimoReal && resultado[mes] !== null;
    if (esReal) continue;
    resultado[mes] = prom3(resultado, mes);
    ventas[mes] = prom3(ventas, mes);
    proyectados.push(mes);
  }

  const sum = (arr: (number | null)[]) => arr.reduce((a: number, b) => a + (b ?? 0), 0);
  const resultadoAnual = sum(resultado);
  const ventaAnual = sum(ventas);
  const gastosMenores = ventaAnual * 0.05;
  const base = resultadoAnual - gastosMenores;
  const tasa = tasaPct / 100;
  const impuesto = base * tasa;
  const rentaPagar = impuesto - ppm;
  // Reinversión: rebaja del 50% de la base, con tope de 5.000 UF.
  const deduccion50 = base * 0.5;
  const topeUf5000 = uf ? uf * 5000 : null;
  const topado = topeUf5000 !== null && deduccion50 > topeUf5000;
  const deduccionMax = topeUf5000 !== null ? Math.min(deduccion50, topeUf5000) : deduccion50;
  return {
    resultadoAnual,
    ventaAnual,
    gastosMenores,
    base,
    impuesto,
    ppm,
    rentaPagar,
    deduccion50,
    uf,
    topeUf5000,
    topado,
    deduccionMax,
    ahorroReinv: deduccionMax * tasa,
    tasaPct,
    mesesReales: ultimoReal,
    mesesProyectados: proyectados,
  };
}

export function RentaProyectada({ token, anio = 2026 }: { token: string; anio?: number }) {
  const [p, setP] = useState<Proyeccion | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    Promise.all([
      cargarRenta(token, anio),
      cargarEstadoResultado(token, anio),
      cargarIndicadores(token),
    ]).then(([rRenta, rEr, rInd]) => {
      if (!vivo) return;
      const d: Renta | null = rRenta.ok ? (rRenta.data ?? null) : null;
      const meses = rEr.ok ? (rEr.meses ?? []) : [];
      const uf = rInd.ok && rInd.ind?.uf ? Number(rInd.ind.uf) : null;
      setP(d ? proyectar(meses, Number(d.ppm_acumulado ?? 0), d.tasa_pct ?? 12.5, uf) : null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [token, anio]);

  const card = "card-soft rounded-xl bg-card p-5";
  if (cargando) return <div className={`${card} flex items-center gap-2 text-sm text-muted-foreground`}><Loader2 className="size-4 animate-spin" /> Cargando…</div>;
  if (!p) return null;

  const linea = (etq: string, val: number, op = "", fuerte = false) => (
    <div className={`flex justify-between py-1.5 ${fuerte ? "border-t border-border font-medium" : "border-b border-border/60"}`}>
      <span>{op}{etq}</span>
      <span className={`tabular-nums ${fuerte ? "" : "text-muted-foreground"}`}>{clp(val)}</span>
    </div>
  );

  const proyTxt = p.mesesProyectados.length
    ? p.mesesProyectados.map((m) => MES_ABR[m]).join(", ")
    : null;

  // Equivalente en UF de un monto en $, con la UF del indicador Previred.
  const enUf = (monto: number) =>
    p.uf ? `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(monto / p.uf)} UF` : null;

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-heading text-lg font-semibold tracking-tight">
            <Landmark className="mr-1.5 inline size-5 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
            Renta proyectada {anio}
          </span>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Renta a pagar (est.)</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{clp(p.rentaPagar)}</div>
          </div>
        </div>

        <div className="text-sm">
          {linea("Resultado anualizado proyectado", p.resultadoAnual)}
          {linea("Gastos menores proyectados (5% ventas)", p.gastosMenores, "− ")}
          {linea("Base afecta estimada", p.base, "= ")}
          {linea(`Impuesto 1ª categoría (${p.tasaPct}% ProPyme)`, p.impuesto, "= ")}
          {linea("PPM acumulado (crédito)", p.ppm, "− ")}
          {linea("Renta a pagar proyectada", p.rentaPagar, "= ", true)}
        </div>

        {/* Beneficio de reinversión (ProPyme 14 D N°3 · incentivo al ahorro) */}
        <div className="mt-3 flex items-start gap-2 rounded-md bg-emerald-50 p-3">
          <Sprout className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <p className="m-0 text-xs text-emerald-800">
            <strong>Beneficio de reinversión (50%).</strong> Si reinviertes utilidades, puedes rebajar
            de la base el 50% de lo reinvertido, con <strong>tope de 5.000 UF</strong> (ProPyme 14D N°3,
            incentivo al ahorro). El 50% de tu base es {clp(p.deduccion50)}
            {enUf(p.deduccion50) ? ` (${enUf(p.deduccion50)})` : ""}.{" "}
            {p.topado && p.topeUf5000 !== null ? (
              <>
                Como supera el tope, la rebaja máxima es <strong>{clp(p.topeUf5000)}</strong> (5.000 UF),
                con un ahorro de impuesto de hasta {clp(p.ahorroReinv)}.
              </>
            ) : (
              <>Con ese monto, el ahorro de impuesto sería de hasta {clp(p.ahorroReinv)}.</>
            )}{" "}
            Lo calculamos con el monto exacto a reinvertir antes del cierre.
          </p>
        </div>

        <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="m-0 text-xs text-amber-800">
            Estimación de gestión: {p.mesesReales} meses reales
            {proyTxt ? `; los meses ${proyTxt} se proyectan como el promedio de los 3 meses anteriores` : ""}.
            Tasa transitoria ProPyme 14D N°3 ({p.tasaPct}%), menos el PPM acumulado del año. No
            reemplaza el cálculo formal de la Renta Líquida Imponible.
          </p>
        </div>
      </div>
    </div>
  );
}
