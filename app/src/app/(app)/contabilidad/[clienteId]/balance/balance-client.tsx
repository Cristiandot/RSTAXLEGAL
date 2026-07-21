"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import { etiquetaRango } from "@/lib/periodos";
import { SelectorRangoPeriodo } from "@/components/selector-rango-periodo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LineaDiario, OrigenAsiento } from "@/lib/contabilidad/centralizacion";
import type { BalanceFila, BalanceTotales } from "@/lib/contabilidad/balance";
import { ContabilidadTabs } from "../contabilidad-tabs";

const thNum = "px-2 py-1.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap";
const thTxt = "px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap";
const tdNum = "px-2 py-1 text-right tabular-nums whitespace-nowrap";

/** $ con guion para los ceros, y rojo para negativos. */
function Money({ v, bold }: { v: number; bold?: boolean }) {
  if (Math.round(v) === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={`${v < 0 ? "text-red-600" : ""} ${bold ? "font-semibold" : ""}`}>
      {formatMonto(v)}
    </span>
  );
}

const ORIGEN_LABEL: Record<OrigenAsiento, string> = {
  compras: "Compras",
  ventas: "Ventas",
  honorarios: "Honorarios",
  sueldos: "Sueldos",
  otros_gastos: "Otros gastos",
  f29: "F29",
};

export function BalanceClient({
  clienteId,
  razonSocial,
  rutEmpresa,
  desde,
  hasta,
  lineas,
  filas,
  totales,
  advertencias,
  conteos,
}: {
  clienteId: string;
  razonSocial: string;
  rutEmpresa: string | null;
  desde: string;
  hasta: string;
  lineas: LineaDiario[];
  filas: BalanceFila[];
  totales: BalanceTotales;
  advertencias: string[];
  conteos: { compras: number; ventas: number; honorarios: number };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"balance" | "diario">("balance");
  const [filtroOrigen, setFiltroOrigen] = useState<OrigenAsiento | "todos">("todos");
  const [filtroCuenta, setFiltroCuenta] = useState<string | null>(null);

  // Cierre de resultado (utilidad/pérdida del ejercicio) para cuadrar 8 columnas
  const cierre = useMemo(() => {
    const res = totales.resultadoEjercicio;
    return {
      utilidad: res,
      perdidaCol: res >= 0 ? res : 0,
      gananciaCol: res < 0 ? -res : 0,
      pasivoCol: res >= 0 ? res : 0,
      activoCol: res < 0 ? -res : 0,
    };
  }, [totales]);

  const lineasVis = useMemo(
    () =>
      lineas.filter(
        (l) =>
          (filtroOrigen === "todos" || l.origen === filtroOrigen) &&
          (!filtroCuenta || l.cuenta === filtroCuenta),
      ),
    [lineas, filtroOrigen, filtroCuenta],
  );

  return (
    <div className="space-y-5">
      <ContabilidadTabs clienteId={clienteId} periodo={hasta} active="balance" />
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            render={<Link href={`/contabilidad/${clienteId}/rcv?periodo=${hasta}`} />}
          >
            <ArrowLeft className="size-4" />
            Volver a los libros RCV
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Contabilidad — {razonSocial}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rutEmpresa ? `RUT ${rutEmpresa} · ` : ""}
            Centralización automática y Balance de 8 columnas de{" "}
            {etiquetaRango(desde, hasta)}.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-medium text-muted-foreground">Período (desde → hasta)</span>
          <SelectorRangoPeriodo
            desde={desde}
            hasta={hasta}
            onCambio={(d, h) =>
              router.push(`/contabilidad/${clienteId}/balance?desde=${d}&hasta=${h}`)
            }
          />
        </div>
      </div>

      {/* ── Cuadratura ── */}
      <div
        className={`card-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ${
          totales.cuadra ? "bg-emerald-50" : "bg-red-50"
        }`}
      >
        <div className="flex items-center gap-2">
          {totales.cuadra ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-5 text-red-600" />
          )}
          <span className="text-sm font-medium">
            {totales.cuadra
              ? "Libro diario cuadrado (Debe = Haber)"
              : "El libro diario NO cuadra — revisar"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm tabular-nums">
          <span className="text-muted-foreground">
            Debe <strong className="text-foreground">{formatMonto(totales.debe)}</strong>
          </span>
          <span className="text-muted-foreground">
            Haber <strong className="text-foreground">{formatMonto(totales.haber)}</strong>
          </span>
          <span className="text-muted-foreground">
            Resultado{" "}
            <strong className={totales.resultadoEjercicio >= 0 ? "text-emerald-700" : "text-red-600"}>
              {formatMonto(totales.resultadoEjercicio)}
            </strong>
          </span>
        </div>
      </div>

      {/* ── Pendientes ── */}
      {advertencias.length > 0 ? (
        <div className="card-soft rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AlertTriangle className="size-4" /> Datos pendientes (esqueleto)
          </h2>
          <ul className="ml-5 list-disc space-y-0.5 text-xs text-amber-900">
            {advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Tabs ── */}
      <div className="card-soft rounded-xl bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 pt-3 pb-0">
          <div className="flex gap-1">
            {(
              [
                { v: "balance", label: "Balance 8 columnas" },
                { v: "diario", label: `Libro diario (${lineas.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={`rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.v
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="pb-2 text-xs text-muted-foreground">
            {conteos.ventas} ventas · {conteos.compras} compras · {conteos.honorarios} honorarios
          </span>
        </div>

        {tab === "balance" ? (
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className={thTxt}>Cuenta</th>
                  <th className={thTxt}>Nombre</th>
                  <th className={thNum} colSpan={2}>
                    Sumas
                  </th>
                  <th className={thNum} colSpan={2}>
                    Saldos
                  </th>
                  <th className={thNum} colSpan={2}>
                    Inventario
                  </th>
                  <th className={thNum} colSpan={2}>
                    Resultado
                  </th>
                </tr>
                <tr className="bg-card">
                  <th className={thTxt} />
                  <th className={thTxt} />
                  <th className={thNum}>Debe</th>
                  <th className={thNum}>Haber</th>
                  <th className={thNum}>Deudor</th>
                  <th className={thNum}>Acreedor</th>
                  <th className={thNum}>Activo</th>
                  <th className={thNum}>Pasivo</th>
                  <th className={thNum}>Pérdida</th>
                  <th className={thNum}>Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.codigo}
                    className="cursor-pointer border-t border-border/40 hover:bg-muted/30"
                    onClick={() => {
                      setFiltroCuenta(f.codigo);
                      setFiltroOrigen("todos");
                      setTab("diario");
                    }}
                    title="Ver los movimientos de esta cuenta en el libro diario"
                  >
                    <td className="px-2 py-1 tabular-nums">{f.codigo}</td>
                    <td className="px-2 py-1">{f.nombre}</td>
                    <td className={tdNum}><Money v={f.debe} /></td>
                    <td className={tdNum}><Money v={f.haber} /></td>
                    <td className={tdNum}><Money v={f.saldoDeudor} /></td>
                    <td className={tdNum}><Money v={f.saldoAcreedor} /></td>
                    <td className={tdNum}><Money v={f.activo} /></td>
                    <td className={tdNum}><Money v={f.pasivo} /></td>
                    <td className={tdNum}><Money v={f.perdida} /></td>
                    <td className={tdNum}><Money v={f.ganancia} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card shadow-[0_-1px_0_0_var(--border)]">
                <tr className="border-t border-border font-semibold">
                  <td className="px-2 py-1.5" colSpan={2}>Sumas</td>
                  <td className={tdNum}>{formatMonto(totales.debe)}</td>
                  <td className={tdNum}>{formatMonto(totales.haber)}</td>
                  <td className={tdNum}>{formatMonto(totales.saldoDeudor)}</td>
                  <td className={tdNum}>{formatMonto(totales.saldoAcreedor)}</td>
                  <td className={tdNum}>{formatMonto(totales.activo)}</td>
                  <td className={tdNum}>{formatMonto(totales.pasivo)}</td>
                  <td className={tdNum}>{formatMonto(totales.perdida)}</td>
                  <td className={tdNum}>{formatMonto(totales.ganancia)}</td>
                </tr>
                <tr className="border-t border-border/60">
                  <td className="px-2 py-1.5" colSpan={2}>
                    {cierre.utilidad >= 0 ? "Utilidad del ejercicio" : "Pérdida del ejercicio"}
                  </td>
                  <td className={tdNum} colSpan={4} />
                  <td className={tdNum}><Money v={cierre.activoCol} /></td>
                  <td className={tdNum}><Money v={cierre.pasivoCol} /></td>
                  <td className={tdNum}><Money v={cierre.perdidaCol} /></td>
                  <td className={tdNum}><Money v={cierre.gananciaCol} /></td>
                </tr>
                <tr className="border-t border-border font-semibold">
                  <td className="px-2 py-1.5" colSpan={2}>Totales</td>
                  <td className={tdNum}>{formatMonto(totales.debe)}</td>
                  <td className={tdNum}>{formatMonto(totales.haber)}</td>
                  <td className={tdNum}>{formatMonto(totales.saldoDeudor)}</td>
                  <td className={tdNum}>{formatMonto(totales.saldoAcreedor)}</td>
                  <td className={tdNum}>{formatMonto(totales.activo + cierre.activoCol)}</td>
                  <td className={tdNum}>{formatMonto(totales.pasivo + cierre.pasivoCol)}</td>
                  <td className={tdNum}>{formatMonto(totales.perdida + cierre.perdidaCol)}</td>
                  <td className={tdNum}>{formatMonto(totales.ganancia + cierre.gananciaCol)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-1 px-4 py-2">
              {(["todos", "ventas", "compras", "honorarios", "f29"] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setFiltroOrigen(o)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    filtroOrigen === o
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {o === "todos" ? "Todos" : ORIGEN_LABEL[o as OrigenAsiento]}
                </button>
              ))}
              {filtroCuenta ? (
                <button
                  type="button"
                  onClick={() => setFiltroCuenta(null)}
                  className="ml-2 rounded-md border border-primary bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
                  title="Quitar filtro de cuenta"
                >
                  Cuenta {filtroCuenta} ✕
                </button>
              ) : null}
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                  <tr>
                    <th className={thTxt}>Comprobante</th>
                    <th className={thTxt}>Fecha</th>
                    <th className={thTxt}>Cuenta</th>
                    <th className={`${thNum} text-right`}>Debe</th>
                    <th className={`${thNum} text-right`}>Haber</th>
                    <th className={thTxt}>Documento</th>
                    <th className={thTxt}>Contraparte</th>
                  </tr>
                </thead>
                <tbody>
                  {lineasVis.map((l, i) => (
                    <tr key={i} className="border-t border-border/40 hover:bg-muted/30">
                      <td className="px-2 py-1">
                        <Badge variant="outline" className="border-border bg-muted/40">
                          {l.tipo_comprobante}
                        </Badge>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap">{formatFecha(l.fecha)}</td>
                      <td className="px-2 py-1 tabular-nums">{l.cuenta}</td>
                      <td className={tdNum}><Money v={l.debe} /></td>
                      <td className={tdNum}><Money v={l.haber} /></td>
                      <td className="max-w-64 truncate px-2 py-1" title={`${l.nombre_doc ?? ""} ${l.folio_doc ?? ""}`}>
                        {l.nombre_doc} {l.folio_doc ? `· ${l.folio_doc}` : ""}
                      </td>
                      <td className="max-w-64 truncate px-2 py-1" title={l.razon_ficha ?? ""}>
                        {l.razon_ficha}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Flujo de trabajo: en los libros RCV clasifica cada compra con su{" "}
          <strong>Cuenta de gasto</strong> y ajusta el <strong>% pagado</strong>; el libro diario y
          el balance se recalculan solos con esa clasificación. Haz clic en una cuenta del balance
          para ver sus movimientos en el diario. Las notas de crédito (61) restan. Sueldos, otros
          gastos y pagos F29/Previred se incorporan cuando llegue su data (ver pendientes arriba).
        </p>
      </div>
    </div>
  );
}
