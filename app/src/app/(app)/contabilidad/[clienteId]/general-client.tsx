"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpenCheck, FileSpreadsheet, Upload } from "lucide-react";
import { formatMonto } from "@/lib/format";
import { etiquetaPeriodo } from "@/lib/periodos";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ContabilidadTabs } from "./contabilidad-tabs";

export type KpisPeriodo = {
  ventasNeto: number;
  ivaDebito: number;
  comprasNeto: number;
  ivaCredito: number;
  liqDocs: number;
  liqMonto: number;
};

export type ResumenMes = {
  periodo: string;
  ventasNeto: number;
  comprasNeto: number;
};

function Kpi({ label, valor, hint }: { label: string; valor: number; hint?: string }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatMonto(valor)}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function GeneralClient({
  clienteId,
  razonSocial,
  rutEmpresa,
  contabilidadCompleta,
  periodo,
  kpis,
  tendencia,
}: {
  clienteId: string;
  razonSocial: string;
  rutEmpresa: string | null;
  contabilidadCompleta: boolean;
  periodo: string;
  kpis: KpisPeriodo;
  tendencia: ResumenMes[];
}) {
  const router = useRouter();
  const resultado = kpis.ventasNeto - kpis.comprasNeto;
  const ivaNeto = kpis.ivaDebito - kpis.ivaCredito;
  const ult = tendencia.slice(-6);
  const maxBarra = Math.max(1, ...ult.map((m) => Math.max(m.ventasNeto, m.comprasNeto)));

  return (
    <div className="space-y-5 pt-2">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{razonSocial}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rutEmpresa ? `RUT ${rutEmpresa} · ` : ""}
            {contabilidadCompleta ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Contabilidad completa
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border bg-muted/40">
                Solo documentos
              </Badge>
            )}
          </p>
        </div>
        <SelectorPeriodo
          periodo={periodo}
          onCambio={(p) => router.push(`/contabilidad/${clienteId}?periodo=${p}`)}
        />
      </div>

      <ContabilidadTabs clienteId={clienteId} periodo={periodo} active="general" />

      {/* ── KPIs del período ── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Resumen de {etiquetaPeriodo(periodo)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Ventas netas" valor={kpis.ventasNeto} />
          <Kpi label="Compras netas" valor={kpis.comprasNeto} />
          <Kpi
            label="Resultado operacional aprox."
            valor={resultado}
            hint="Ventas − compras (sin sueldos/otros gastos)"
          />
          <Kpi label="IVA Débito" valor={kpis.ivaDebito} />
          <Kpi label="IVA Crédito" valor={kpis.ivaCredito} />
          <Kpi
            label={ivaNeto >= 0 ? "IVA a pagar (aprox.)" : "Remanente IVA (aprox.)"}
            valor={Math.abs(ivaNeto)}
            hint="Débito − crédito del período"
          />
        </div>
      </div>

      {/* ── Alertas / pendientes ── */}
      <div className="card-soft rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="size-4" /> Para revisar
        </h2>
        <ul className="ml-5 list-disc space-y-0.5 text-xs text-amber-900">
          {kpis.liqDocs > 0 ? (
            <li>
              {kpis.liqDocs} liquidación(es)-factura de comisionista por{" "}
              <strong>{formatMonto(kpis.liqMonto)}</strong> — excluidas del resultado (la venta
              bruta es del mandante). Requieren criterio del contador.
            </li>
          ) : null}
          <li>Sueldos, otros gastos y pagos F29/Previred: pendientes de cargar su data.</li>
        </ul>
      </div>

      {/* ── Tendencia ── */}
      {ult.length > 0 ? (
        <div className="card-soft rounded-xl bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Tendencia (últimos meses)</h2>
          <div className="space-y-2">
            {ult.map((m) => (
              <div key={m.periodo} className="flex items-center gap-3 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">
                  {etiquetaPeriodo(m.periodo)}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 rounded bg-emerald-400/70"
                      style={{ width: `${(m.ventasNeto / maxBarra) * 100}%` }}
                    />
                    <span className="tabular-nums text-muted-foreground">
                      V {formatMonto(m.ventasNeto)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 rounded bg-sky-400/70"
                      style={{ width: `${(m.comprasNeto / maxBarra) * 100}%` }}
                    />
                    <span className="tabular-nums text-muted-foreground">
                      C {formatMonto(m.comprasNeto)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Accesos rápidos ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          variant="outline"
          className="h-auto justify-start py-3"
          render={<Link href={`/contabilidad/${clienteId}/rcv?periodo=${periodo}`} />}
        >
          <FileSpreadsheet className="size-4" />
          <span className="text-left">
            <span className="block font-medium">Libro C/V</span>
            <span className="block text-xs text-muted-foreground">Compras, ventas y honorarios</span>
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start py-3"
          render={<Link href={`/contabilidad/${clienteId}/balance?periodo=${periodo}`} />}
        >
          <BookOpenCheck className="size-4" />
          <span className="text-left">
            <span className="block font-medium">Contabilidad y Balance</span>
            <span className="block text-xs text-muted-foreground">Libro diario y 8 columnas</span>
          </span>
        </Button>
        <Button
          variant="outline"
          className="h-auto justify-start py-3"
          render={<Link href={`/contabilidad/${clienteId}/documentos?periodo=${periodo}`} />}
        >
          <Upload className="size-4" />
          <span className="text-left">
            <span className="block font-medium">Carga de documentos</span>
            <span className="block text-xs text-muted-foreground">RCV, boletas, respaldos del mes</span>
          </span>
        </Button>
      </div>
    </div>
  );
}
