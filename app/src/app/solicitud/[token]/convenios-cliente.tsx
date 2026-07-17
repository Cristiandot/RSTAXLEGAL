"use client";

import { useEffect, useState } from "react";
import { Loader2, Landmark } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { cargarConveniosCliente, type ConvenioCliente } from "./convenios-cliente-actions";

const ORGANISMO: Record<ConvenioCliente["organismo"], string> = {
  tesoreria: "Tesorería General de la República",
  sii: "SII",
  dt: "Dirección del Trabajo",
  otro: "",
};

/**
 * Tarjeta "Convenios de pago" del portal del cliente: muestra las deudas que
 * están en proceso de regularización mediante un convenio de pago vigente, con
 * el avance de cuotas, la próxima cuota y el saldo. Se alimenta del módulo
 * interno (RPC portal_convenios); si no hay convenios vigentes, no se muestra.
 */
export function ConveniosCliente({ token }: { token: string }) {
  const [convenios, setConvenios] = useState<ConvenioCliente[] | null>(null);

  useEffect(() => {
    let vivo = true;
    setConvenios(null);
    cargarConveniosCliente(token).then((r) => {
      if (vivo) setConvenios(r.ok ? (r.convenios ?? []) : []);
    });
    return () => {
      vivo = false;
    };
  }, [token]);

  if (convenios === null) {
    return (
      <div className="card-soft flex items-center gap-2 rounded-xl bg-card p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Cargando convenios de pago…
      </div>
    );
  }
  if (convenios.length === 0) return null;

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <p className="mb-1 text-sm font-medium">
        <Landmark className="mr-1.5 inline size-4 align-middle text-[var(--brand-teal)]" aria-hidden="true" />
        Convenios de pago
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Deudas en proceso de regularización mediante un convenio de pago vigente.
      </p>

      <div className="flex flex-col gap-3">
        {convenios.map((c) => {
          const total = Number(c.monto_total ?? 0);
          const pagado = Number(c.monto_pagado ?? 0);
          const saldo = Math.max(total - pagado, 0);
          const pct = c.n_cuotas > 0 ? Math.round((c.cuotas_pagadas / c.n_cuotas) * 100) : 0;
          return (
            <div key={c.id} className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{c.concepto ?? "Convenio de pago"}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORGANISMO[c.organismo]}
                    {c.folio ? ` · convenio N° ${c.folio}` : ""}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                  En proceso de regularización
                </span>
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {c.cuotas_pagadas} de {c.n_cuotas} cuotas pagadas
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-[var(--brand-teal)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">Próxima cuota</div>
                  <div className="text-sm font-medium tabular-nums">
                    {c.proximo_vencimiento ? formatFecha(c.proximo_vencimiento) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Saldo pendiente</div>
                  <div className="text-sm font-medium tabular-nums">{formatMonto(saldo)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Pagado / total</div>
                  <div className="text-sm font-medium tabular-nums">
                    {formatMonto(pagado)} / {formatMonto(total)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
