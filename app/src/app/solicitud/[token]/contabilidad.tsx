"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  TrendingUp, ShoppingCart, Coins, ReceiptText, Truck, Store,
} from "lucide-react";
import {
  cargarContabilidad, cargarContabilidadMes,
  type ContabilidadInfo, type MesDetalle,
} from "./portal-actions";
import { BarrasVentasCompras, BarrasHorizontales, LineasVentasCompras } from "./mini-charts";
import { DocumentosSolicitar, type TipoDoc } from "./documentos";
import { formatFecha, formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function nombreMes(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES_LARGO[m - 1] ?? "?"} ${y}`;
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
  const [mesSel, setMesSel] = useState("");
  const [mesInfo, setMesInfo] = useState<MesDetalle | null>(null);

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

  // Al cambiar de año, volver al general (año completo).
  useEffect(() => {
    setMesSel("");
  }, [anio]);

  // Detalle del mes seleccionado (proveedores/clientes/facturas del período).
  useEffect(() => {
    if (!mesSel) {
      setMesInfo(null);
      return;
    }
    let vivo = true;
    void cargarContabilidadMes(token, mesSel).then((r) => {
      if (vivo && r.ok && r.mes) setMesInfo(r.mes);
    });
    return () => {
      vivo = false;
    };
  }, [token, mesSel]);

  const periodos = useMemo(() => {
    const base = [{ value: `${anio}`, label: `Acumulado ${anio}` }];
    const meses = (info?.meses ?? []).map((m) => ({
      value: m.periodo,
      label: `${mesCorto(m.periodo)} ${anio}`,
    }));
    return [...base, ...meses.reverse()];
  }, [info, anio]);

  const totales = info?.totales;
  const esMes = mesSel !== "";
  const mesData = (info?.meses ?? []).find((m) => m.periodo === mesSel) ?? null;
  const f29Vista = esMes
    ? (info?.f29?.find((f) => f.periodo === mesSel) ?? null)
    : (info?.f29 && info.f29.length > 0 ? info.f29[info.f29.length - 1] : null);

  // Vista activa: año completo (general) o el mes seleccionado en el gráfico.
  const vista = esMes
    ? {
        titulo: nombreMes(mesSel),
        ventas_neto: mesInfo?.ventas_neto ?? mesData?.ventas_neto ?? 0,
        compras_neto: mesInfo?.compras_neto ?? mesData?.compras_neto ?? 0,
        iva_debito: mesInfo?.iva_debito ?? mesData?.iva_debito ?? 0,
        iva_credito: mesInfo?.iva_credito ?? mesData?.iva_credito ?? 0,
        iva_pagar:
          (mesInfo?.iva_debito ?? mesData?.iva_debito ?? 0) -
          (mesInfo?.iva_credito ?? mesData?.iva_credito ?? 0),
        top_proveedores: mesInfo?.top_proveedores ?? [],
        top_clientes: mesInfo?.top_clientes ?? [],
        ultimas_facturas: mesInfo?.ultimas_facturas ?? [],
      }
    : {
        titulo: `Acumulado ${anio}`,
        ventas_neto: totales?.ventas_neto ?? 0,
        compras_neto: totales?.compras_neto ?? 0,
        iva_debito: totales?.iva_debito ?? 0,
        iva_credito: totales?.iva_credito ?? 0,
        iva_pagar: totales?.iva_pagar ?? 0,
        top_proveedores: info?.top_proveedores ?? [],
        top_clientes: info?.top_clientes ?? [],
        ultimas_facturas: info?.ultimas_facturas ?? [],
      };
  const resultadoBruto = vista.ventas_neto - vista.compras_neto;

  return (
    <div className="space-y-5">
      {/* Barra de período */}
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
          {/* Vista activa: año completo (general) o mes seleccionado */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium capitalize">{vista.titulo}</p>
            {esMes ? (
              <Button variant="outline" size="sm" onClick={() => setMesSel("")}>
                Ver año completo
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Toca un mes en el gráfico para ver su detalle.</span>
            )}
          </div>

          {/* Titulares (datos gruesos) */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Kpi feat icon={<TrendingUp className="size-3.5" />} label="Ventas netas" valor={formatMonto(vista.ventas_neto)} sub={vista.titulo} />
            <Kpi icon={<ShoppingCart className="size-3.5" />} label="Compras netas" valor={formatMonto(vista.compras_neto)} sub={vista.titulo} />
            <Kpi icon={<Coins className="size-3.5" />} label="IVA a pagar" valor={formatMonto(vista.iva_pagar)} sub="débito − crédito" />
            <Kpi feat icon={<ReceiptText className="size-3.5" />} label="Resultado bruto" valor={formatMonto(resultadoBruto)} sub="ventas − compras" />
          </div>

          {/* Evolución — cada mes es un botón para ver su detalle */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Evolución mensual · ventas y compras</CardTitle>
              <CardDescription className="mt-1">
                Toca un mes para ver su detalle; tócalo de nuevo (o &quot;Ver año completo&quot;) para volver al año.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BarrasVentasCompras
                meses={info.meses ?? []}
                seleccionado={mesSel || null}
                onSeleccionar={(p) => setMesSel((prev) => (prev === p ? "" : p))}
              />
            </CardContent>
          </Card>

          {/* Fluctuación — líneas con puntos (tendencia anual) */}
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-base">Fluctuación · ventas y compras</CardTitle>
              <CardDescription className="mt-1">
                Tendencia mes a mes de las ventas y compras netas del año.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LineasVentasCompras meses={info.meses ?? []} />
            </CardContent>
          </Card>

          {/* Info relevante (IVA y F29) — arriba de proveedores/clientes */}
          <Card className="card-soft border-transparent">
            <CardContent className="flex flex-wrap gap-x-8 gap-y-2 pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">IVA débito{esMes ? "" : " (acum.)"}</p>
                <p className="font-semibold">{formatMonto(vista.iva_debito)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IVA crédito{esMes ? "" : " (acum.)"}</p>
                <p className="font-semibold">{formatMonto(vista.iva_credito)}</p>
              </div>
              {f29Vista ? (
                <div>
                  <p className="text-xs text-muted-foreground">
                    {esMes ? "F29" : "Último F29"} ({mesCorto(f29Vista.periodo)} {anio})
                  </p>
                  <p className="font-semibold">
                    {f29Vista.fecha_f29_presentado ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        Presentado {formatFecha(f29Vista.fecha_f29_presentado)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">En proceso</span>
                    )}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Top proveedores / clientes — sección protagonista */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck className="size-5 text-[var(--brand-navy)]" />
                  Proveedores más comunes
                </CardTitle>
                <CardDescription className="mt-1">Por monto de compras · {vista.titulo}</CardDescription>
              </CardHeader>
              <CardContent>
                <BarrasHorizontales grande rows={vista.top_proveedores.map((p) => ({ nombre: p.nombre, monto: p.monto }))} color="#0b2545" />
              </CardContent>
            </Card>
            <Card className="card-soft border-transparent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Store className="size-5 text-[var(--brand-teal)]" />
                  Compradores más comunes
                </CardTitle>
                <CardDescription className="mt-1">Por monto de ventas · {vista.titulo}</CardDescription>
              </CardHeader>
              <CardContent>
                <BarrasHorizontales grande rows={vista.top_clientes.map((p) => ({ nombre: p.nombre, monto: p.monto }))} color="#17a2b8" />
              </CardContent>
            </Card>
          </div>

          <DocumentosSolicitar token={token} area="contabilidad" titulo="Documentos contables" docs={DOCS_CONTAB} periodos={periodos} />
        </>
      )}
    </div>
  );
}
