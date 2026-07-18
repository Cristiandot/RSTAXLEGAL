"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Receipt, Building2 } from "lucide-react";
import { cargarReportes, type Reportes as RepData } from "./reportes-actions";

const NOMBRE_MES: Record<string, string> = {
  "01":"Ene","02":"Feb","03":"Mar","04":"Abr","05":"May","06":"Jun",
  "07":"Jul","08":"Ago","09":"Sep","10":"Oct","11":"Nov","12":"Dic",
};
function clp(n: number): string {
  return (n < 0 ? "-$" : "$") + new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(n)));
}
function mesDe(p: string) { const m = p.match(/-(\d{2})$/); return m ? NOMBRE_MES[m[1]] : p; }


export function Reportes({ token, anio }: { token: string; anio: number }) {
  const [d, setD] = useState<RepData | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargarReportes(token, anio).then((r) => {
      if (!vivo) return;
      setD(r.ok ? (r.data ?? null) : null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [token, anio]);

  const card = "card-soft rounded-xl bg-card p-5";

  if (cargando) {
    return <div className={`${card} flex items-center gap-2 text-sm text-muted-foreground`}><Loader2 className="size-4 animate-spin" /> Cargando reportes…</div>;
  }
  if (!d) return null;

  const ing = d.estructura.ingresos || 0;
  const resultado =
    ing -
    d.estructura.servicios -
    d.estructura.insumos -
    d.estructura.otros -
    d.estructura.honorarios -
    d.estructura.remuneraciones;
  const seg = { ...d.estructura, resultado };
  const hayHon = (d.estructura.honorarios || 0) > 0;
  const segmentos = [
    { key: "servicios", label: "Servicios prof.", color: "#1baf7a" },
    { key: "insumos", label: "Insumos y gastos", color: "#eda100" },
    { key: "otros", label: "Otros gastos", color: "#8b5cf6" },
    ...(hayHon ? [{ key: "honorarios", label: "Honorarios", color: "#d6772a" }] : []),
    { key: "remuneraciones", label: "Remuneraciones", color: "#2a78d6" },
    { key: "resultado", label: "Resultado", color: "#0a7d0a" },
  ] as const;
  const pct = (v: number) => (ing ? Math.round((v / ing) * 100) : 0);
  const totalComp = d.total_compras || 0;
  const top1 = d.top_proveedores[0];
  const concentracion = totalComp && top1 ? Math.round((top1.monto / totalComp) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 1. Estructura de costos y márgenes */}
      <div className={card}>
        <p className="mb-3 text-sm font-medium">Estructura de costos y márgenes</p>
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {segmentos.map((s) => {
            const v = Math.max(0, seg[s.key as keyof typeof seg] as number);
            const w = ing ? (v / ing) * 100 : 0;
            return w > 0 ? <div key={s.key} style={{ width: `${w}%`, background: s.color }} title={`${s.label}: ${clp(v)}`} /> : null;
          })}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {segmentos.map((s) => {
            const v = seg[s.key as keyof typeof seg] as number;
            return (
              <div key={s.key}>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
                </div>
                <div className={`text-sm font-medium tabular-nums ${s.key === "resultado" && v < 0 ? "text-red-600" : ""}`}>{clp(v)} <span className="text-xs text-muted-foreground">({pct(v)}%)</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Boletas y ticket promedio */}
      {d.boletas_mensual.length > 0 ? (() => {
        const totN = d.boletas_mensual.reduce((a, m) => a + m.n, 0);
        const totMonto = d.boletas_mensual.reduce((a, m) => a + m.monto, 0);
        const ticketProm = totN ? Math.round(totMonto / totN) : 0;
        return (
          <div className={card}>
            <p className="mb-1 text-sm font-medium"><Receipt className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Boletas y ticket promedio</p>
            <p className="mb-2 text-xs text-muted-foreground">{totN.toLocaleString("es-CL")} boletas en {anio} · ticket promedio {clp(ticketProm)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm tabular-nums">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-1.5 text-left font-medium">Mes</th><th className="py-1.5 font-medium">N° boletas</th><th className="py-1.5 font-medium">Ingreso</th><th className="py-1.5 font-medium">Ticket prom.</th></tr></thead>
                <tbody>
                  {d.boletas_mensual.map((m) => (
                    <tr key={m.periodo} className="border-b border-border/60">
                      <td className="py-1.5 text-left font-medium">{mesDe(m.periodo)}</td>
                      <td className="py-1.5 text-muted-foreground">{m.n.toLocaleString("es-CL")}</td>
                      <td className="py-1.5 text-muted-foreground">{clp(m.monto)}</td>
                      <td className="py-1.5">{clp(m.ticket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })() : null}

      {/* 3. Top proveedores + concentración */}
      <div className={card}>
        <p className="mb-1 text-sm font-medium"><Building2 className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Top proveedores</p>
        {concentracion >= 40 ? (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-amber-700"><AlertTriangle className="size-3.5" />{top1.nombre} concentra el {concentracion}% de tus compras.</p>
        ) : null}
        <div className="space-y-2">
          {d.top_proveedores.slice(0, 6).map((p) => {
            const w = totalComp ? (p.monto / totalComp) * 100 : 0;
            return (
              <div key={p.nombre}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate" title={p.nombre}>{p.nombre}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{clp(p.monto)} · {Math.round(w)}%</span>
                </div>
                <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[var(--brand-teal)]" style={{ width: `${w}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4b. Facturas por clasificar (caen en Otros gastos hasta clasificarse) */}
      {d.sin_clasificar.length > 0 ? (
        <div className={card}>
          <p className="mb-1 text-sm font-medium"><Building2 className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Facturas por clasificar</p>
          <p className="mb-2 text-xs text-muted-foreground">Proveedores exentos sin categoría — hoy suman en &ldquo;Otros gastos&rdquo;. Clasifícalos más arriba para ordenar el Estado de Resultado.</p>
          <div className="space-y-1.5 text-sm">
            {d.sin_clasificar.slice(0, 8).map((p) => (
              <div key={p.nombre} className="flex justify-between gap-2">
                <span className="truncate" title={p.nombre}>{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{clp(p.monto)} · {p.docs} doc{p.docs === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}
