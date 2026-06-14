"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TrendingUp, ShoppingCart, Coins, ReceiptText, Download, FileSpreadsheet,
} from "lucide-react";
import {
  cargarContabilidad, type ContabilidadInfo,
} from "./portal-actions";
import { BarrasVentasCompras, BarrasHorizontales } from "./mini-charts";
import { DocumentosSolicitar, type TipoDoc } from "./documentos";
import { formatFecha, formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DOCS_CONTAB: TipoDoc[] = [
  { tipo: "Balance de 8 columnas", desc: "Sumas, saldos, inventario y resultado por cuenta." },
  { tipo: "Libro Mayor", desc: "Movimientos y saldo de cada cuenta del período." },
  { tipo: "Libro Diario", desc: "Asientos contables en orden cronológico." },
  { tipo: "Estado de resultados", desc: "Ingresos, costos y gastos del período." },
];

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function mesCorto(p: string): string {
  const m = Number(p.slice(5));
  return `${MESES[m - 1] ?? "?"}`;
}

function Kpi({
  icon, label, valor, sub, feat = false,
}: { icon: React.ReactNode; label: string; valor: string; sub?: string; feat?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${feat ? "bg-[var(--brand-navy)] text-white" : "border border-input bg-card"}`}>
      <p className={`flex items-center gap-1.5 text-xs ${feat ? "text-white/70" : "text-muted-foreground"}`}>
        <span className={feat ? "text-[var(--brand-teal)]" : "text-[var(--brand-teal)]"}>{icon}</span>
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {sub ? <p className={`text-[11px] ${feat ? "text-white/60" : "text-muted-foreground"}`}>{sub}</p> : null}
    </div>
  );
}

export function Contabilidad({ token }: { token: string }) {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [info, setInfo] = useState<ContabilidadInfo | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async (a: number) => {
    setCargando(true);
    const r = await cargarContabilidad(token, a);
    if (r.ok && r.info) setInfo(r.info);
    else toast.error(r.error ?? "No se pudo cargar la contabilidad.");
    setCargando(false);
  }, [token]);

  useEffect(() => {
    void recargar(anio);
  }, [anio, recargar]);

  const periodos = useMemo(() => {
    const base = [{ value: `${anio}`, label: `Acumulado ${anio}` }];
    const meses = (info?.meses ?? []).map((m) => ({
      value: m.periodo,
      label: `${mesCorto(m.periodo)} ${anio}`,
    }));
    return [...base, ...meses.reverse()];
  }, [info, anio]);

  const ultimoF29 = info?.f29 && info.f29.length > 0 ? info.f29[info.f29.length - 1] : null;
  const totales = info?.totales;
  const resultadoBruto = totales ? totales.ventas_neto - totales.compras_neto : 0;

  return (
    <div className="space-y-5">
      {/* Barra de período + descargas */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
        >
          {[anioActual, anioActual - 1].map((a) => (
            <option key={a} value={a}>Año {a}</option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => toast.info("La descarga estará disponible pronto.")}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info("La descarga estará disponible pronto.")}>
          <Download className="size-4" /> PDF
        </Button>
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : !info?.habilitado ? (
        <>
          <Card className="card-soft border-transparent">
            <CardContent className="pt-5 text-sm text-muted-foreground">
              El detalle contable en línea aún no está habilitado para tu empresa. Igualmente
              puedes solicitar tus documentos contables aquí abajo y el equipo te los preparará.
            </CardContent>
          </Card>
          <DocumentosSolicitar token={token} area="contabilidad" titulo="Documentos contables" docs={DOCS_CONTAB} periodos={[{ value: `${anio}`, label: `Acumulado ${anio}` }]} />
        </>
      ) : (
        <>
          {/* Titulares (datos gruesos) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi feat icon={<TrendingUp className="size-3.5" />} label="Ventas netas" valor={formatMonto(totales?.ventas_neto)} sub={`acum. ${anio}`} />
            <Kpi icon={<ShoppingCart className="size-3.5" />} label="Compras netas" valor={formatMonto(totales?.compras_neto)} sub={`acum. ${anio}`} />
            <Kpi icon={<Coins className="size-3.5" />} label="IVA a pagar" valor={formatMonto(totales?.iva_pagar)} sub="débito − crédito" />
            <Kpi feat icon={<ReceiptText className="size-3.5" />} label="Resultado bruto" valor={formatMonto(resultadoBruto)} sub="ventas − compras" />
          </div>

          {/* Evolución */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Evolución mensual · ventas y compras</CardTitle>
            </CardHeader>
            <CardContent>
              <BarrasVentasCompras meses={info.meses ?? []} />
            </CardContent>
          </Card>

          {/* Top proveedores / clientes */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Proveedores más comunes</CardTitle>
              </CardHeader>
              <CardContent>
                <BarrasHorizontales rows={(info.top_proveedores ?? []).map((p) => ({ nombre: p.nombre, monto: p.monto }))} color="#0b2545" />
              </CardContent>
            </Card>
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="text-base">Compradores más comunes</CardTitle>
              </CardHeader>
              <CardContent>
                <BarrasHorizontales rows={(info.top_clientes ?? []).map((p) => ({ nombre: p.nombre, monto: p.monto }))} color="#17a2b8" />
              </CardContent>
            </Card>
          </div>

          {/* Info relevante */}
          <Card className="card-soft border-transparent">
            <CardContent className="flex flex-wrap gap-x-8 gap-y-2 pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">IVA débito (acum.)</p>
                <p className="font-semibold">{formatMonto(totales?.iva_debito)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IVA crédito (acum.)</p>
                <p className="font-semibold">{formatMonto(totales?.iva_credito)}</p>
              </div>
              {ultimoF29 ? (
                <div>
                  <p className="text-xs text-muted-foreground">Último F29 ({mesCorto(ultimoF29.periodo)} {anio})</p>
                  <p className="font-semibold">
                    {ultimoF29.fecha_f29_presentado ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Presentado {formatFecha(ultimoF29.fecha_f29_presentado)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">En proceso</span>
                    )}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Historial de facturas */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Historial de facturas — últimos movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              {info.ultimas_facturas && info.ultimas_facturas.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Fecha</th>
                        <th className="py-2 pr-2 font-medium">Folio</th>
                        <th className="py-2 pr-2 font-medium">Proveedor / cliente</th>
                        <th className="py-2 pr-2 text-right font-medium">Total</th>
                        <th className="py-2 font-medium">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.ultimas_facturas.map((f, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 pr-2 tabular-nums">{formatFecha(f.fecha)}</td>
                          <td className="py-2 pr-2 tabular-nums">{f.folio}</td>
                          <td className="py-2 pr-2">{f.contraparte}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{formatMonto(f.total)}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${f.tipo === "venta" ? "bg-sky-100 text-sky-800" : "bg-pink-100 text-pink-800"}`}>
                              {f.tipo === "venta" ? "Venta" : "Compra"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin facturas en el período.</p>
              )}
            </CardContent>
          </Card>

          <DocumentosSolicitar token={token} area="contabilidad" titulo="Documentos contables" docs={DOCS_CONTAB} periodos={periodos} />
        </>
      )}
    </div>
  );
}
