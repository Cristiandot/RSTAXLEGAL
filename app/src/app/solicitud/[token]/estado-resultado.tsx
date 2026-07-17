"use client";

import { useEffect, useState } from "react";
import { Loader2, Info, ReceiptText } from "lucide-react";
import {
  cargarEstadoResultado,
  type MesResultado,
  type CorteInfo,
} from "./estado-resultado-actions";

const MESES = ["01","02","03","04","05","06","07","08","09","10","11","12"];
const NOMBRE_MES: Record<string, string> = {
  "01":"Ene","02":"Feb","03":"Mar","04":"Abr","05":"May","06":"Jun",
  "07":"Jul","08":"Ago","09":"Sep","10":"Oct","11":"Nov","12":"Dic",
};

function clp(n: number): string {
  const s = new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(n)));
  return (n < 0 ? "-$" : "$") + s;
}
function fmtFecha(v: string | null | undefined): string {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}
function fmtPeriodo(v: string | null | undefined): string {
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})/);
  return m ? `${NOMBRE_MES[m[2]] ?? m[2]} ${m[1]}` : v;
}

export function EstadoResultado({ token }: { token: string }) {
  const [anio, setAnio] = useState(2026);
  const [meses, setMeses] = useState<MesResultado[] | null>(null);
  const [corte, setCorte] = useState<CorteInfo | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargarEstadoResultado(token, anio).then((r) => {
      if (!vivo) return;
      setMeses(r.ok ? (r.meses ?? []) : []);
      setCorte(r.corte ?? null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [token, anio]);

  const total = (k: keyof MesResultado) =>
    (meses ?? []).reduce((a, m) => a + (Number(m[k]) || 0), 0);
  const totIng = total("ingresos");
  const totRes = total("resultado");
  const margen = totIng ? Math.round((totRes / totIng) * 100) : 0;
  const faltaRemun = (meses ?? []).some((m) => !m.remun_cargada);

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-heading text-lg font-semibold tracking-tight">
          <ReceiptText className="mr-1.5 inline size-5 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
          Estado de resultado
        </span>
        <div className="inline-flex rounded-md bg-muted p-0.5">
          {[2025, 2026].map((a) => (
            <button
              key={a}
              onClick={() => setAnio(a)}
              className={`rounded px-3 py-1 text-sm font-medium transition ${
                anio === a ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {corte ? (
        <p className="-mt-1 mb-3 text-xs text-muted-foreground">
          Información al {fmtFecha(corte.generado)} · ventas y compras hasta{" "}
          {fmtPeriodo(corte.compras_hasta)} · remuneraciones hasta{" "}
          {fmtPeriodo(corte.remun_hasta)}
        </p>
      ) : null}

      {cargando ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </div>
      ) : !meses || meses.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Sin información para {anio}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Ingresos {anio}</div>
              <div className="text-xl font-semibold tabular-nums">{clp(totIng)}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Resultado {anio}</div>
              <div className={`text-xl font-semibold tabular-nums ${totRes < 0 ? "text-red-600" : "text-emerald-600"}`}>{clp(totRes)}</div>
            </div>
            <div className="rounded-md bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">Margen</div>
              <div className="text-xl font-semibold tabular-nums">{margen}%</div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-right text-sm tabular-nums">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Mes</th>
                  <th className="py-2 font-medium">Ingresos</th>
                  <th className="py-2 font-medium">Serv. prof.</th>
                  <th className="py-2 font-medium">Insumos</th>
                  <th className="py-2 font-medium">Remuner.</th>
                  <th className="py-2 font-medium">Resultado</th>
                  <th className="py-2 font-medium">Margen</th>
                </tr>
              </thead>
              <tbody>
                {MESES.map((mm) => {
                  const m = meses.find((x) => x.periodo === `${anio}-${mm}`);
                  if (!m) return null;
                  const mg = m.ingresos ? Math.round((m.resultado / m.ingresos) * 100) : 0;
                  return (
                    <tr key={mm} className="border-b border-border/60">
                      <td className="py-1.5 text-left font-medium">{NOMBRE_MES[mm]}</td>
                      <td className="py-1.5">{clp(m.ingresos)}</td>
                      <td className="py-1.5 text-muted-foreground">{clp(m.servicios)}</td>
                      <td className="py-1.5 text-muted-foreground">{clp(m.insumos)}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {m.remun_cargada ? clp(m.remuneraciones) : "—"}
                      </td>
                      <td className={`py-1.5 font-medium ${m.resultado < 0 ? "text-red-600" : ""}`}>{clp(m.resultado)}</td>
                      <td className="py-1.5">{mg}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="m-0 text-xs text-amber-800">
              Estimación de gestión en base a compraventa (RCV) y remuneraciones,
              con información al {fmtFecha(corte?.generado)} (ventas y compras hasta{" "}
              {fmtPeriodo(corte?.compras_hasta)}, remuneraciones hasta{" "}
              {fmtPeriodo(corte?.remun_hasta)}). Giro exento: el IVA de las compras
              se considera costo. No incluye depreciación, gastos financieros ni
              provisiones.
              {faltaRemun ? " Los meses con remuneraciones sin cargar muestran “—” y su resultado aún no las descuenta." : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
