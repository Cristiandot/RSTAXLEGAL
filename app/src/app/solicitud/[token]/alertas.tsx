"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { cargarF29Situacion, type F29Periodo, type F29Estado } from "./alertas-actions";

const MES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function etiqueta(p: string): { mes: string; anio: string } {
  const m = p.match(/^(\d{4})-(\d{2})/);
  return m ? { mes: MES[+m[2]] ?? m[2], anio: m[1].slice(2) } : { mes: p, anio: "" };
}

const ESTILO: Record<F29Estado, { bg: string; label: string }> = {
  declarada: { bg: "border-emerald-200 bg-emerald-100 text-emerald-800", label: "Declarada" },
  observada: { bg: "border-red-200 bg-red-100 text-red-800", label: "Observada" },
  postergado: { bg: "border-orange-200 bg-orange-100 text-orange-800", label: "Postergado" },
  guardada: { bg: "border-amber-200 bg-amber-100 text-amber-800", label: "Guardada" },
  sin_declarar: { bg: "border-slate-200 bg-slate-100 text-slate-500", label: "Sin declarar" },
};
const ORDEN: F29Estado[] = ["declarada", "postergado", "observada", "guardada", "sin_declarar"];

/**
 * Recuadro "Situación de tus F29": semáforo de los últimos 12 meses. Verde
 * declarada, rojo observada, ámbar guardada (lista pero no en el SII), gris sin
 * declarar. Resalta observadas y guardadas pendientes.
 */
export function AlertasFinancieras({ token, anio }: { token: string; anio: number }) {
  const [periodos, setPeriodos] = useState<F29Periodo[] | null>(null);

  useEffect(() => {
    let vivo = true;
    setPeriodos(null);
    cargarF29Situacion(token, anio).then((r) => {
      if (vivo) setPeriodos(r.ok ? (r.periodos ?? []) : []);
    });
    return () => { vivo = false; };
  }, [token, anio]);

  if (periodos === null) {
    return (
      <div className="card-soft flex items-center gap-2 rounded-xl bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando situación de F29…
      </div>
    );
  }
  if (periodos.length === 0) return null;

  const obs = periodos.filter((p) => p.estado === "observada");
  const guard = periodos.filter((p) => p.estado === "guardada");
  const post = periodos.filter((p) => p.estado === "postergado");
  const usados = ORDEN.filter((e) => periodos.some((p) => p.estado === e));
  const fmt = (p: F29Periodo) => { const e = etiqueta(p.periodo); return `${e.mes} 20${e.anio}`; };

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <p className="mb-1 text-sm font-medium">
        <ShieldCheck className="mr-1.5 inline size-4 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
        Situación de tus F29
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Estado de tus declaraciones mensuales de IVA (F29) según el SII y el trabajo de la oficina,
        durante {anio}.
      </p>

      {obs.length > 0 ? (
        <p className="mb-2 flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {obs.length === 1 ? "El F29 de" : "Los F29 de"} {obs.map(fmt).join(", ")}{" "}
            {obs.length === 1 ? "tiene" : "tienen"} observaciones del SII. Hay que regularizar para
            evitar multas y no perder el crédito de PPM.
          </span>
        </p>
      ) : null}
      {post.length > 0 ? (
        <p className="mb-2 text-xs text-orange-700">
          {post.length} {post.length === 1 ? "F29 con IVA postergado" : "F29 con IVA postergado"}{" "}
          ({post.map(fmt).join(", ")}).
        </p>
      ) : null}
      {guard.length > 0 ? (
        <p className="mb-3 text-xs text-amber-700">
          {guard.length} {guard.length === 1 ? "declaración guardada pendiente" : "declaraciones guardadas pendientes"}{" "}
          de presentar o pagar ({guard.map(fmt).join(", ")}).
        </p>
      ) : null}

      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {periodos.map((p) => {
          const e = ESTILO[p.estado];
          const et = etiqueta(p.periodo);
          return (
            <div
              key={p.periodo}
              title={`${et.mes} 20${et.anio}: ${e.label}`}
              className={`rounded-md border px-1 py-1.5 text-center ${e.bg}`}
            >
              <div className="text-[11px] font-semibold leading-tight">{et.mes}</div>
              <div className="text-[10px] leading-tight opacity-70">&rsquo;{et.anio}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {usados.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <span className={`inline-block size-2.5 rounded-sm border ${ESTILO[e].bg}`} />
            {ESTILO[e].label}
          </span>
        ))}
      </div>
    </div>
  );
}
