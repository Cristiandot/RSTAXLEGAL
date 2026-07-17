"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, TrendingUp, Users, Receipt, Building2 } from "lucide-react";
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
      <div className="flex items-center justify-between">
        <span className="font-heading text-lg font-semibold tracking-tight">
          <TrendingUp className="mr-1.5 inline size-5 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
          Reportes {anio}
        </span>
      </div>

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

      {/* 1b. Boletas y ticket promedio */}
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

      {/* 2. IVA crédito no recuperable */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">IVA crédito no recuperable</p>
            <p className="mt-1 text-xs text-muted-foreground">Giro exento: el IVA de las compras no se recupera y se vuelve costo.</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-amber-600">{clp(d.iva_credito_no_recuperable)}</div>
            <div className="text-xs text-muted-foreground">{anio}</div>
          </div>
        </div>
      </div>

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

      {/* 4. Servicios profesionales exentos (clasificados) */}
      {d.servicios_profesionales.length > 0 ? (
        <div className={card}>
          <p className="mb-2 text-sm font-medium"><Receipt className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Servicios profesionales (exentos)</p>
          <div className="space-y-1.5 text-sm">
            {d.servicios_profesionales.slice(0, 6).map((p) => (
              <div key={p.nombre} className="flex justify-between gap-2">
                <span className="truncate" title={p.nombre}>{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{clp(p.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

      {/* 4c. Honorarios de terceros (BHE recibidas) */}
      {hayHon && d.honorarios_recibidos.length > 0 ? (
        <div className={card}>
          <p className="mb-2 text-sm font-medium"><Receipt className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Honorarios de terceros</p>
          <div className="space-y-1.5 text-sm">
            {d.honorarios_recibidos.slice(0, 6).map((p) => (
              <div key={p.nombre} className="flex justify-between gap-2">
                <span className="truncate" title={p.nombre}>{p.nombre}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{clp(p.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 5. Costo de remuneraciones */}
      <div className={card}>
        <p className="mb-2 text-sm font-medium"><Users className="mr-1 inline size-4 align-middle text-muted-foreground" aria-hidden="true" />Costo de remuneraciones</p>
        {d.remuneraciones_mensual.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin remuneraciones cargadas para {anio}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm tabular-nums">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-1.5 text-left font-medium">Mes</th><th className="py-1.5 font-medium">Dotación</th><th className="py-1.5 font-medium">Costo empresa</th><th className="py-1.5 font-medium">% ingresos</th></tr></thead>
              <tbody>
                {d.remuneraciones_mensual.map((m) => (
                  <tr key={m.periodo} className="border-b border-border/60">
                    <td className="py-1.5 text-left font-medium">{mesDe(m.periodo)}</td>
                    <td className="py-1.5 text-muted-foreground">{m.dotacion}</td>
                    <td className="py-1.5">{clp(m.costo)}</td>
                    <td className="py-1.5 text-muted-foreground">{ing ? Math.round((m.costo / (ing / 12)) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted-foreground">% sobre ingreso mensual promedio del año.</p>
          </div>
        )}
      </div>
    </div>
  );
}
