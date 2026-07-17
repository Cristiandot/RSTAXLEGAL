"use client";

import { useEffect, useState } from "react";
import { Loader2, Landmark, AlertTriangle, Info } from "lucide-react";
import { cargarRenta, type Renta } from "./reportes-actions";

const NOMBRE_MES: Record<string, string> = {
  "01":"enero","02":"febrero","03":"marzo","04":"abril","05":"mayo","06":"junio",
  "07":"julio","08":"agosto","09":"septiembre","10":"octubre","11":"noviembre","12":"diciembre",
};
function clp(n: number): string {
  return (n < 0 ? "-$" : "$") + new Intl.NumberFormat("es-CL").format(Math.abs(Math.round(n)));
}
function mesDe(p: string) { const m = p.match(/-(\d{2})$/); return m ? NOMBRE_MES[m[1]] : p; }

export function RentaProyectada({ token, anio = 2026 }: { token: string; anio?: number }) {
  const [d, setD] = useState<Renta | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargarRenta(token, anio).then((r) => {
      if (!vivo) return;
      setD(r.ok ? (r.data ?? null) : null);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [token, anio]);

  const card = "card-soft rounded-xl bg-card p-5";
  if (cargando) return <div className={`${card} flex items-center gap-2 text-sm text-muted-foreground`}><Loader2 className="size-4 animate-spin" /> Cargando…</div>;
  if (!d) return null;

  const linea = (etq: string, val: number, op = "", fuerte = false) => (
    <div className={`flex justify-between py-1.5 ${fuerte ? "border-t border-border font-medium" : "border-b border-border/60"}`}>
      <span>{op}{etq}</span>
      <span className={`tabular-nums ${fuerte ? "" : "text-muted-foreground"}`}>{clp(val)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Alerta de F29 sin declarar */}
      {d.f29_pendientes.length > 0 ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
          <p className="flex items-center gap-2 font-medium text-red-800">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {d.f29_pendientes.length} F29 sin declarar en {anio}
          </p>
          <p className="mt-1 text-sm text-red-700">
            Períodos pendientes: {d.f29_pendientes.map(mesDe).join(", ")}. Regularizar
            evita intereses, multas y pérdida del crédito de PPM contra la renta.
          </p>
        </div>
      ) : null}

      {/* Renta proyectada */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-heading text-lg font-semibold tracking-tight">
            <Landmark className="mr-1.5 inline size-5 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
            Renta proyectada {anio}
          </span>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Renta a pagar (est.)</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{clp(d.renta_a_pagar)}</div>
          </div>
        </div>

        <div className="text-sm">
          {linea("Resultado anualizado", d.resultado_anualizado)}
          {linea(`Impuesto 1ª categoría (${d.tasa_pct}% ProPyme)`, d.renta_estimada, "= ")}
          {linea("PPM acumulado (crédito)", d.ppm_acumulado, "− ")}
          {linea("Renta a pagar proyectada", d.renta_a_pagar, "= ", true)}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="m-0 text-xs text-amber-800">
            Estimación de gestión: resultado anualizado sobre {d.meses_completos} meses con
            información completa, tasa transitoria ProPyme 14D N°3 ({d.tasa_pct}%), menos el
            PPM acumulado del año. No reemplaza el cálculo formal de la Renta Líquida Imponible.
          </p>
        </div>
      </div>
    </div>
  );
}
