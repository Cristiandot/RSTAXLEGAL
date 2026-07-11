"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  Copy,
  ExternalLink,
  Megaphone,
  Minus,
  Plus,
  Search,
  Target,
} from "lucide-react";
import { formatFecha, montoCLP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  actualizarCarteraItem,
  actualizarDeudaCliente,
  actualizarMetaCategoria,
  actualizarPosicion,
  crearAd,
  crearCarteraItem,
  crearDeudaCliente,
  crearLinkPlan,
  crearPosicion,
} from "./actions";
import { GraficoCrecimiento, TabCrecimiento, etiquetaMes } from "./gerencia-crecimiento";
import { TabEmision } from "./gerencia-emision";
import {
  CATEGORIAS_GERENCIA,
  type CarteraItem,
  type DatosGerencia,
  type Posicion,
} from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

const CATEGORIA_BADGE: Record<string, string> = {
  OPEN: "border-violet-200 bg-violet-50 text-violet-700",
  SEGUNDA: "border-sky-200 bg-sky-50 text-sky-700",
  TERCERA: "border-teal-200 bg-teal-50 text-teal-700",
  PUBA: "border-amber-200 bg-amber-50 text-amber-700",
};

/** Pestañas del módulo — espejo de las hojas del Excel de gerencia. */
const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "crecimiento", label: "Crecimiento" },
  { id: "metas", label: "META RS" },
  { id: "emision", label: "Emisión del mes" },
  { id: "posiciones", label: "Posiciones" },
  { id: "ads", label: "Ads · Deudas" },
  { id: "links", label: "Links de pago" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Fecha (ISO) de la cuota n (base 1) de una posición: primera_cuota + (n-1) meses. */
function fechaCuota(p: Posicion, n: number): string {
  const [a, m, d] = p.primera_cuota.split("-").map(Number);
  const fecha = new Date(a, m - 1 + (n - 1), 1);
  const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
  fecha.setDate(Math.min(d, ultimoDia));
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

function uf2(v: number): string {
  return v.toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function ModuloGerencia({
  datos,
  recargar,
}: {
  datos: DatosGerencia;
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [tab, setTab] = useState<TabId>("resumen");
  const [busquedaCartera, setBusquedaCartera] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [formCartera, setFormCartera] = useState(false);
  const [formPosicion, setFormPosicion] = useState(false);
  const [formAd, setFormAd] = useState<"" | "gasto" | "conversion">("");
  const [formDeuda, setFormDeuda] = useState(false);
  const [formLink, setFormLink] = useState(false);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  const { cartera, metasCategoria, hitos, crecimiento, posiciones, ads, deudas, links, emision, ufActual } =
    datos;

  const mesActual = new Date().toISOString().slice(0, 7);

  // ---- cálculos derivados de la cartera (mismas fórmulas de la hoja META RS) ----
  const clientesCerrados = useMemo(() => cartera.filter((c) => !c.es_prospecto), [cartera]);
  const prospectos = useMemo(() => cartera.filter((c) => c.es_prospecto), [cartera]);
  const sumaCartera = useMemo(
    () => clientesCerrados.reduce((s, c) => s + c.valor, 0),
    [clientesCerrados],
  );
  const carteraUF = sumaCartera / ufActual;

  const filasMeta = useMemo(
    () =>
      metasCategoria.map((m) => {
        const del = clientesCerrados.filter((c) => c.categoria === m.categoria);
        const realUF = del.reduce((s, c) => s + c.valor, 0) / ufActual;
        const esperableUF = m.rango_uf * m.objetivo_cantidad;
        return {
          ...m,
          cerrados: del.length,
          restantes: Math.max(0, m.objetivo_cantidad - del.length),
          cumplimiento: m.objetivo_cantidad ? del.length / m.objetivo_cantidad : 0,
          esperableUF,
          realUF,
          diferenciaUF: realUF - esperableUF,
          incidencia: sumaCartera ? del.reduce((s, c) => s + c.valor, 0) / sumaCartera : 0,
        };
      }),
    [metasCategoria, clientesCerrados, ufActual, sumaCartera],
  );

  const puntoMes = crecimiento.find((p) => p.mes === mesActual);
  const serieGrafico = useMemo(
    () => crecimiento.filter((p) => p.mes >= "2025-01" && p.mes <= mesActual),
    [crecimiento, mesActual],
  );

  const carteraFiltrada = useMemo(() => {
    const q = busquedaCartera.trim().toLowerCase();
    return clientesCerrados.filter((c) => {
      if (filtroCategoria && c.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return `${c.codigo ?? ""} ${c.cliente}`.toLowerCase().includes(q);
    });
  }, [clientesCerrados, busquedaCartera, filtroCategoria]);

  // ---- posiciones / ads / deudas / emisión ----
  const posicionesActivas = posiciones.filter((p) => p.estado === "activa");
  const saldoPosiciones = posicionesActivas.reduce(
    (s, p) => s + (p.num_cuotas - p.cuotas_pagadas) * p.valor_cuota,
    0,
  );
  const gastoAds = ads.filter((a) => a.tipo === "gasto").reduce((s, a) => s + a.monto, 0);
  const conversionAds = ads.filter((a) => a.tipo === "conversion").reduce((s, a) => s + a.monto, 0);
  const deudasPendientes = deudas.filter((d) => d.status === "pendiente");
  const emisionMes = emision.filter((e) => e.periodo === mesActual);
  const porEmitir = emisionMes.filter((e) => !e.emitida);

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Error al guardar.");
        return;
      }
      toast.success(exito);
      await recargar();
    });
  }

  function copiarLink(id: string, link: string) {
    void navigator.clipboard.writeText(link).then(() => {
      setLinkCopiado(id);
      toast.success("Link copiado.");
      setTimeout(() => setLinkCopiado(null), 2000);
    });
  }

  const v = (fd: FormData, k: string) => (fd.get(k) as string)?.trim() || null;
  const vNum = (fd: FormData, k: string): number | null => {
    const s = (fd.get(k) as string)?.replace(/\./g, "").replace(",", ".").trim();
    if (!s) return null;
    const x = Number(s);
    return Number.isFinite(x) ? x : null;
  };

  const contadorTab: Partial<Record<TabId, string>> = {
    emision: porEmitir.length ? `${porEmitir.length}` : undefined,
    posiciones: posicionesActivas.length ? `${posicionesActivas.length}` : undefined,
    "ads": deudasPendientes.length ? `${deudasPendientes.length}` : undefined,
  };

  return (
    <div className="space-y-5">
      {/* ===== Pestañas (espejo de las hojas del Excel) ===== */}
      <div className="flex flex-nowrap gap-1 overflow-x-auto rounded-xl border bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition ${
              tab === t.id
                ? "bg-[var(--brand-navy,#0B2545)] text-white"
                : "text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {t.label}
            {contadorTab[t.id] ? (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === t.id ? "bg-white/20" : "bg-amber-100 text-amber-800"
                }`}
              >
                {contadorTab[t.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ===================== RESUMEN ===================== */}
      {tab === "resumen" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-muted-foreground">
                Facturación {etiquetaMes(mesActual)} (mes en curso)
              </p>
              <p className="mt-1 text-2xl font-bold">
                {puntoMes?.real != null ? montoCLP(Math.round(puntoMes.real)) : "—"}
              </p>
              {puntoMes?.real != null ? (
                <p className={`text-xs ${puntoMes.real >= puntoMes.meta ? "text-teal-700" : "text-muted-foreground"}`}>
                  {Math.round((puntoMes.real / puntoMes.meta) * 100)}% de la meta ({montoCLP(Math.round(puntoMes.meta))})
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-muted-foreground">Cartera mensual recurrente</p>
              <p className="mt-1 text-2xl font-bold">{montoCLP(Math.round(sumaCartera))}</p>
              <p className="text-xs text-muted-foreground">
                UF {uf2(carteraUF)} · {clientesCerrados.length} clientes (UF {uf2(ufActual)})
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-muted-foreground">Por emitir {etiquetaMes(mesActual)}</p>
              <p className="mt-1 text-2xl font-bold">
                {montoCLP(Math.round(porEmitir.reduce((s, e) => s + e.valor, 0)))}
              </p>
              <p className="text-xs text-muted-foreground">
                {porEmitir.length} facturas pendientes de emitir
              </p>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs text-muted-foreground">Deuda financiera viva</p>
              <p className="mt-1 text-2xl font-bold">{montoCLP(Math.round(saldoPosiciones))}</p>
              <p className="text-xs text-muted-foreground">{posicionesActivas.length} posiciones activas</p>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="mr-auto text-sm font-semibold">Facturación vs meta</h3>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#17A2B8]" /> Real
                <span className="ml-3 inline-block h-0.5 w-5 border-t-2 border-dashed border-[#0B2545]" /> Meta
              </span>
            </div>
            <GraficoCrecimiento puntos={serieGrafico} />
            <p className="mt-2 text-xs text-muted-foreground">
              Detalle mes a mes (y ajustes manuales) en la pestaña Crecimiento.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Hitos de cartera (UF mensuales recurrentes)</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {hitos.map((h) => {
                if (h.uf_objetivo === null) {
                  return (
                    <div key={h.id} className="flex items-center gap-3 rounded-xl border border-dashed bg-white p-3">
                      <Target className="size-5 shrink-0 text-[#0B2545]" />
                      <div>
                        <p className="text-sm font-semibold">{h.nombre}</p>
                        <p className="text-xs text-muted-foreground">{h.descripcion}</p>
                      </div>
                    </div>
                  );
                }
                const avance = Math.min(1, carteraUF / h.uf_objetivo);
                const logrado = carteraUF >= h.uf_objetivo;
                return (
                  <div key={h.id} className="rounded-xl border bg-white p-3">
                    <div className="mb-1 flex items-baseline justify-between">
                      <p className="text-sm font-semibold">
                        {h.nombre} · UF {h.uf_objetivo}
                      </p>
                      <p className={`text-xs font-semibold ${logrado ? "text-teal-700" : "text-muted-foreground"}`}>
                        {Math.round(avance * 100)}%
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${logrado ? "bg-teal-500" : "bg-[#17A2B8]"}`}
                        style={{ width: `${avance * 100}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {montoCLP(Math.round(h.uf_objetivo * ufActual))} · faltan UF{" "}
                      {logrado ? "0" : uf2(h.uf_objetivo - carteraUF)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* ===================== CRECIMIENTO ===================== */}
      {tab === "crecimiento" ? (
        <TabCrecimiento
          crecimiento={crecimiento}
          mesActual={mesActual}
          pendiente={pendiente}
          ejecutar={ejecutar}
        />
      ) : null}

      {/* ===================== EMISIÓN DEL MES ===================== */}
      {tab === "emision" ? (
        <TabEmision
          emision={emision}
          mesActual={mesActual}
          pendiente={pendiente}
          ejecutar={ejecutar}
          recargar={recargar}
        />
      ) : null}

      {/* ===================== META RS ===================== */}
      {tab === "metas" ? (
        <div className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">
              Meta por categoría{" "}
              <span className="font-normal text-muted-foreground">(se calcula sola desde la cartera)</span>
            </h3>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Rango UF</TableHead>
                    <TableHead className="text-right">Objetivo</TableHead>
                    <TableHead className="text-right">Cerrados</TableHead>
                    <TableHead className="text-right">Restantes</TableHead>
                    <TableHead>Cumplimiento</TableHead>
                    <TableHead className="text-right">Esperable UF</TableHead>
                    <TableHead className="text-right">Real UF</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead className="text-right">Incidencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filasMeta.map((f) => (
                    <TableRow key={f.categoria}>
                      <TableCell>
                        <Badge variant="outline" className={CATEGORIA_BADGE[f.categoria] ?? ""}>
                          {f.categoria}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{f.rango_uf}</TableCell>
                      <TableCell className="text-right">
                        <input
                          type="number"
                          className={`${selectClase} w-16 text-right`}
                          defaultValue={f.objetivo_cantidad}
                          disabled={pendiente}
                          onBlur={(e) => {
                            const nuevo = Number(e.target.value);
                            if (Number.isFinite(nuevo) && nuevo > 0 && nuevo !== f.objetivo_cantidad)
                              ejecutar(
                                () => actualizarMetaCategoria(f.categoria, { objetivo_cantidad: nuevo }),
                                "Objetivo actualizado.",
                              );
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">{f.cerrados}</TableCell>
                      <TableCell className="text-right text-sm">{f.restantes}</TableCell>
                      <TableCell className="min-w-32">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[#17A2B8]"
                              style={{ width: `${Math.min(100, f.cumplimiento * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs">{Math.round(f.cumplimiento * 100)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{f.esperableUF}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{uf2(f.realUF)}</TableCell>
                      <TableCell
                        className={`text-right text-sm ${f.diferenciaUF < 0 ? "text-red-600" : "text-teal-700"}`}
                      >
                        {uf2(f.diferenciaUF)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {Math.round(f.incidencia * 100)}%
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell className="text-right text-sm">
                      {filasMeta.reduce((s, f) => s + f.objetivo_cantidad, 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {filasMeta.reduce((s, f) => s + f.cerrados, 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {filasMeta.reduce((s, f) => s + f.restantes, 0)}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right text-sm">
                      {filasMeta.reduce((s, f) => s + f.esperableUF, 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {uf2(filasMeta.reduce((s, f) => s + f.realUF, 0))}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {uf2(filasMeta.reduce((s, f) => s + f.diferenciaUF, 0))}
                    </TableCell>
                    <TableCell className="text-right text-sm">{montoCLP(Math.round(sumaCartera))}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-sm font-semibold">
                Cartera analizada ({clientesCerrados.length} clientes
                {prospectos.length ? ` · ${prospectos.length} prospectos` : ""})
              </h3>
              <Button size="sm" onClick={() => setFormCartera((x) => !x)}>
                <Plus className="size-4" />
                Agregar cliente / prospecto
              </Button>
            </div>

            {formCartera ? (
              <form
                className="mb-4 rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const uf = vNum(fd, "uf");
                  const valor = vNum(fd, "valor") ?? (uf !== null ? Math.round(uf * ufActual) : 0);
                  ejecutar(
                    () =>
                      crearCarteraItem({
                        codigo: v(fd, "codigo"),
                        cliente: (fd.get("cliente") as string) ?? "",
                        modalidad: v(fd, "modalidad"),
                        categoria: (fd.get("categoria") as string) || "PUBA",
                        uf,
                        valor,
                        es_prospecto: fd.get("es_prospecto") === "on",
                      }),
                    "Agregado a la cartera.",
                  );
                  setFormCartera(false);
                }}
              >
                <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className={labelClase}>Cliente *</label>
                    <Input name="cliente" required placeholder="Razón social o nombre" />
                  </div>
                  <div>
                    <label className={labelClase}>Código (A.1 / B.2 / C.3 / D.4…)</label>
                    <Input name="codigo" placeholder="D.50" />
                  </div>
                  <div>
                    <label className={labelClase}>Categoría</label>
                    <select name="categoria" className={`${selectClase} w-full`} defaultValue="PUBA">
                      {CATEGORIAS_GERENCIA.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClase}>Modalidad</label>
                    <select name="modalidad" className={`${selectClase} w-full`} defaultValue="Suscripción">
                      <option>Suscripción</option>
                      <option>Factura</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClase}>UF mensuales</label>
                    <Input name="uf" placeholder="1,5" />
                  </div>
                  <div>
                    <label className={labelClase}>Valor $ (si es tarifa fija, no UF)</label>
                    <Input name="valor" placeholder="Se calcula solo si pones UF" />
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <input type="checkbox" name="es_prospecto" className="size-4" />
                    Es prospecto (aún no cerrado)
                  </label>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={pendiente}>
                    Guardar
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormCartera(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : null}

            {prospectos.length ? (
              <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-violet-800">Prospectos en análisis</p>
                <div className="flex flex-wrap gap-2">
                  {prospectos.map((p) => (
                    <span key={p.id} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs">
                      <b>{p.cliente}</b>
                      <Badge variant="outline" className={CATEGORIA_BADGE[p.categoria] ?? ""}>
                        {p.categoria}
                      </Badge>
                      {montoCLP(Math.round(p.valor))}
                      <button
                        type="button"
                        disabled={pendiente}
                        className="font-semibold text-teal-700 hover:underline"
                        onClick={() =>
                          ejecutar(
                            () => actualizarCarteraItem(p.id, { es_prospecto: false }),
                            `${p.cliente} pasó a cliente cerrado.`,
                          )
                        }
                      >
                        Marcar cerrado
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  value={busquedaCartera}
                  onChange={(e) => setBusquedaCartera(e.target.value)}
                  placeholder="Buscar por código o cliente…"
                  className="pl-8"
                />
              </div>
              {CATEGORIAS_GERENCIA.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFiltroCategoria((prev) => (prev === c ? "" : c))}
                  className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                    filtroCategoria === c
                      ? "border-[#17A2B8] bg-accent font-semibold"
                      : "bg-white text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="max-h-[440px] overflow-auto rounded-xl border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Modalidad</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">UF</TableHead>
                    <TableHead className="text-right">Valor $</TableHead>
                    <TableHead className="text-right">Trab.</TableHead>
                    <TableHead className="text-right">Soc.</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carteraFiltrada.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                        Sin clientes que calcen con el filtro.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {carteraFiltrada.map((c) => (
                    <FilaCartera key={c.id} item={c} pendiente={pendiente} ejecutar={ejecutar} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===================== POSICIONES ===================== */}
      {tab === "posiciones" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold">
              <Banknote className="size-4 text-[#17A2B8]" />
              Posiciones de financiamiento · saldo vivo {montoCLP(Math.round(saldoPosiciones))}
            </h3>
            <Button size="sm" onClick={() => setFormPosicion((x) => !x)}>
              <Plus className="size-4" />
              Nueva posición
            </Button>
          </div>

          {formPosicion ? (
            <form
              className="mb-4 rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const monto = vNum(fd, "monto") ?? 0;
                const cuota = vNum(fd, "cuota") ?? 0;
                const n = Number(fd.get("cuotas") ?? 0);
                if (!monto || !cuota || !n) {
                  toast.error("Monto, valor cuota y N° de cuotas son obligatorios.");
                  return;
                }
                ejecutar(
                  () =>
                    crearPosicion({
                      financista: (fd.get("financista") as string) ?? "",
                      monto_total: monto,
                      valor_cuota: cuota,
                      num_cuotas: n,
                      primera_cuota: (fd.get("primera") as string) ?? "",
                      capital_cuota: vNum(fd, "capital"),
                      interes_cuota: vNum(fd, "interes"),
                      observaciones: v(fd, "obs"),
                    }),
                  "Posición registrada.",
                );
                setFormPosicion(false);
              }}
            >
              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelClase}>Financista *</label>
                  <Input name="financista" required placeholder="Nombre" />
                </div>
                <div>
                  <label className={labelClase}>Monto total *</label>
                  <Input name="monto" required placeholder="1.000.000" />
                </div>
                <div>
                  <label className={labelClase}>Valor cuota *</label>
                  <Input name="cuota" required placeholder="100.000" />
                </div>
                <div>
                  <label className={labelClase}>N° cuotas *</label>
                  <Input name="cuotas" type="number" required min={1} placeholder="12" />
                </div>
                <div>
                  <label className={labelClase}>Primera cuota *</label>
                  <Input name="primera" type="date" required />
                </div>
                <div>
                  <label className={labelClase}>Capital por cuota</label>
                  <Input name="capital" placeholder="opcional" />
                </div>
                <div>
                  <label className={labelClase}>Interés por cuota</label>
                  <Input name="interes" placeholder="opcional" />
                </div>
                <div>
                  <label className={labelClase}>Observaciones</label>
                  <Input name="obs" placeholder="condiciones, contexto…" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pendiente}>
                  Guardar posición
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setFormPosicion(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-x-auto rounded-xl border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Financista</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Cuota</TableHead>
                  <TableHead>Cuotas pagadas</TableHead>
                  <TableHead>Próxima cuota</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posiciones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Sin posiciones registradas.
                    </TableCell>
                  </TableRow>
                ) : null}
                {posiciones.map((p) => {
                  const restantes = p.num_cuotas - p.cuotas_pagadas;
                  const saldo = restantes * p.valor_cuota;
                  const proxima = restantes > 0 ? fechaCuota(p, p.cuotas_pagadas + 1) : null;
                  const hoyIso = new Date().toISOString().slice(0, 10);
                  const atrasada = p.estado === "activa" && proxima !== null && proxima < hoyIso;
                  return (
                    <TableRow key={p.id} className={p.estado !== "activa" ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="text-sm font-medium">{p.financista}</div>
                        {p.observaciones ? (
                          <div className="text-xs text-muted-foreground">{p.observaciones}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right text-sm">{montoCLP(p.monto_total)}</TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {montoCLP(Math.round(p.valor_cuota))}
                        {p.interes_cuota ? (
                          <div className="text-[11px] text-muted-foreground">
                            int. {montoCLP(Math.round(p.interes_cuota))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-6"
                            disabled={pendiente || p.cuotas_pagadas <= 0}
                            onClick={() =>
                              ejecutar(
                                () => actualizarPosicion(p.id, { cuotas_pagadas: p.cuotas_pagadas - 1 }),
                                "Cuotas actualizadas.",
                              )
                            }
                          >
                            <Minus className="size-3" />
                          </Button>
                          <span className="min-w-14 text-center text-sm font-semibold">
                            {p.cuotas_pagadas} / {p.num_cuotas}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="size-6"
                            disabled={pendiente || restantes <= 0}
                            onClick={() =>
                              ejecutar(
                                () =>
                                  actualizarPosicion(p.id, {
                                    cuotas_pagadas: p.cuotas_pagadas + 1,
                                    ...(restantes === 1 ? { estado: "pagada" } : {}),
                                  }),
                                restantes === 1 ? "Última cuota — posición pagada." : "Cuota registrada.",
                              )
                            }
                          >
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className={`text-sm whitespace-nowrap ${atrasada ? "font-semibold text-red-600" : ""}`}>
                        {proxima ? formatFecha(proxima) : "—"}
                        {atrasada ? <div className="text-[11px]">vencida</div> : null}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {montoCLP(Math.round(saldo))}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatFecha(fechaCuota(p, p.num_cuotas))}
                      </TableCell>
                      <TableCell>
                        <select
                          className={selectClase}
                          value={p.estado}
                          disabled={pendiente}
                          onChange={(e) =>
                            ejecutar(
                              () => actualizarPosicion(p.id, { estado: e.target.value }),
                              "Estado actualizado.",
                            )
                          }
                        >
                          <option value="activa">Activa</option>
                          <option value="pagada">Pagada</option>
                          <option value="renegociada">Renegociada</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {/* ===================== ADS + DEUDAS ===================== */}
      {tab === "ads" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto flex items-center gap-2 text-sm font-semibold">
                <Megaphone className="size-4 text-[#17A2B8]" />
                Ads · gasto {montoCLP(Math.round(gastoAds))} → conversión {montoCLP(Math.round(conversionAds))}
                {gastoAds > 0 ? (
                  <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                    x{(conversionAds / gastoAds).toFixed(1)}
                  </Badge>
                ) : null}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setFormAd(formAd === "gasto" ? "" : "gasto")}>
                <Plus className="size-4" />
                Gasto
              </Button>
              <Button size="sm" onClick={() => setFormAd(formAd === "conversion" ? "" : "conversion")}>
                <Plus className="size-4" />
                Conversión
              </Button>
            </div>

            {formAd ? (
              <form
                className="mb-3 rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  ejecutar(
                    () =>
                      crearAd({
                        tipo: formAd as "gasto" | "conversion",
                        fecha: (fd.get("fecha") as string) || new Date().toISOString().slice(0, 10),
                        detalle: (fd.get("detalle") as string) ?? "",
                        monto: vNum(fd, "monto") ?? 0,
                        categoria: formAd === "conversion" ? v(fd, "categoria") : null,
                      }),
                    formAd === "gasto" ? "Gasto registrado." : "Conversión registrada.",
                  );
                  setFormAd("");
                }}
              >
                <div className="mb-2 grid gap-2 sm:grid-cols-4">
                  <div>
                    <label className={labelClase}>Fecha</label>
                    <Input name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div>
                    <label className={labelClase}>{formAd === "gasto" ? "Concepto *" : "Cliente *"}</label>
                    <Input name="detalle" required placeholder={formAd === "gasto" ? "Google" : "Nombre"} />
                  </div>
                  <div>
                    <label className={labelClase}>Monto *</label>
                    <Input name="monto" required placeholder="122.000" />
                  </div>
                  {formAd === "conversion" ? (
                    <div>
                      <label className={labelClase}>Categoría</label>
                      <select name="categoria" className={`${selectClase} w-full`} defaultValue="TERCERA">
                        {CATEGORIAS_GERENCIA.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
                <Button type="submit" size="sm" disabled={pendiente}>
                  Guardar
                </Button>
              </form>
            ) : null}

            <div className="max-h-96 overflow-auto rounded-xl border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        Sin movimientos de ads.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {ads.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs whitespace-nowrap">{formatFecha(a.fecha)}</TableCell>
                      <TableCell className="text-sm">
                        {a.detalle}
                        {a.categoria ? (
                          <Badge variant="outline" className={`ml-2 ${CATEGORIA_BADGE[a.categoria] ?? ""}`}>
                            {a.categoria}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            a.tipo === "gasto"
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-teal-200 bg-teal-50 text-teal-700"
                          }
                        >
                          {a.tipo === "gasto" ? "Gasto" : "Conversión"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">{montoCLP(Math.round(a.monto))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="mr-auto text-sm font-semibold">
                Deudas de clientes con la oficina
                {deudasPendientes.length ? (
                  <span className="ml-2 text-xs font-normal text-red-600">
                    {deudasPendientes.length} pendiente{deudasPendientes.length > 1 ? "s" : ""} ·{" "}
                    {montoCLP(Math.round(deudasPendientes.reduce((s, d) => s + d.monto, 0)))}
                  </span>
                ) : null}
              </h3>
              <Button size="sm" onClick={() => setFormDeuda((x) => !x)}>
                <Plus className="size-4" />
                Nueva deuda
              </Button>
            </div>

            {formDeuda ? (
              <form
                className="mb-3 rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  ejecutar(
                    () =>
                      crearDeudaCliente({
                        cliente: (fd.get("cliente") as string) ?? "",
                        monto: vNum(fd, "monto") ?? 0,
                        motivo: v(fd, "motivo"),
                      }),
                    "Deuda registrada.",
                  );
                  setFormDeuda(false);
                }}
              >
                <div className="mb-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <label className={labelClase}>Cliente *</label>
                    <Input name="cliente" required placeholder="Nombre" />
                  </div>
                  <div>
                    <label className={labelClase}>Monto *</label>
                    <Input name="monto" required placeholder="11.000" />
                  </div>
                  <div>
                    <label className={labelClase}>Motivo</label>
                    <Input name="motivo" placeholder="Certificados CBR, F29…" />
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={pendiente}>
                  Guardar
                </Button>
              </form>
            ) : null}

            <div className="max-h-96 overflow-auto rounded-xl border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deudas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        Sin deudas registradas.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {deudas.map((d) => (
                    <TableRow key={d.id} className={d.status === "pagado" ? "opacity-60" : ""}>
                      <TableCell className="text-sm font-medium">{d.cliente}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.motivo ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{montoCLP(Math.round(d.monto))}</TableCell>
                      <TableCell>
                        <select
                          className={selectClase}
                          value={d.status}
                          disabled={pendiente}
                          onChange={(e) =>
                            ejecutar(
                              () => actualizarDeudaCliente(d.id, { status: e.target.value }),
                              "Status actualizado.",
                            )
                          }
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="pagado">Pagado</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===================== LINKS ===================== */}
      {tab === "links" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-sm font-semibold">Links de suscripción MercadoPago</h3>
            <Button size="sm" variant="outline" onClick={() => setFormLink((x) => !x)}>
              <Plus className="size-4" />
              Nuevo link
            </Button>
          </div>

          {formLink ? (
            <form
              className="mb-3 rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                ejecutar(
                  () =>
                    crearLinkPlan({
                      nombre: (fd.get("nombre") as string) ?? "",
                      monto: v(fd, "monto"),
                      observaciones: v(fd, "obs"),
                      link: (fd.get("link") as string) ?? "",
                    }),
                  "Link registrado.",
                );
                setFormLink(false);
              }}
            >
              <div className="mb-2 grid gap-2 sm:grid-cols-4">
                <div>
                  <label className={labelClase}>Nombre *</label>
                  <Input name="nombre" required placeholder="Plan UF 2" />
                </div>
                <div>
                  <label className={labelClase}>Monto</label>
                  <Input name="monto" placeholder="2 UF / $60.000" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClase}>Link *</label>
                  <Input name="link" required placeholder="https://www.mercadopago.cl/…" />
                </div>
                <div className="sm:col-span-4">
                  <label className={labelClase}>Observaciones</label>
                  <Input name="obs" placeholder="Tarifa especial…" />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={pendiente}>
                Guardar
              </Button>
            </form>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5">
                <div className="mr-auto min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {l.nombre} <span className="font-normal text-muted-foreground">· {l.monto ?? ""}</span>
                  </p>
                  {l.observaciones ? (
                    <p className="truncate text-[11px] text-muted-foreground" title={l.observaciones}>
                      {l.observaciones}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 shrink-0"
                  title="Copiar link"
                  onClick={() => copiarLink(l.id, l.link)}
                >
                  {linkCopiado === l.id ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}
                </Button>
                <a
                  href={l.link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                  title="Abrir link"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Fila editable de la cartera: UF, valor y categoría se editan inline. */
function FilaCartera({
  item,
  pendiente,
  ejecutar,
}: {
  item: CarteraItem;
  pendiente: boolean;
  ejecutar: (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;
}) {
  return (
    <TableRow>
      <TableCell className="text-xs font-semibold whitespace-nowrap">{item.codigo ?? "—"}</TableCell>
      <TableCell className="max-w-64 truncate text-sm" title={item.cliente}>
        {item.cliente}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{item.modalidad ?? "—"}</TableCell>
      <TableCell>
        <select
          className={selectClase}
          value={item.categoria}
          disabled={pendiente}
          onChange={(e) =>
            ejecutar(
              () => actualizarCarteraItem(item.id, { categoria: e.target.value }),
              "Categoría actualizada.",
            )
          }
        >
          {CATEGORIAS_GERENCIA.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </TableCell>
      <TableCell className="text-right">
        <input
          type="text"
          className={`${selectClase} w-14 text-right`}
          defaultValue={item.uf ?? ""}
          disabled={pendiente}
          onBlur={(e) => {
            const s = e.target.value.replace(",", ".").trim();
            const nuevo = s === "" ? null : Number(s);
            if (nuevo !== null && !Number.isFinite(nuevo)) return;
            if (nuevo !== item.uf)
              ejecutar(() => actualizarCarteraItem(item.id, { uf: nuevo }), "UF actualizada.");
          }}
        />
      </TableCell>
      <TableCell className="text-right">
        <input
          type="text"
          className={`${selectClase} w-24 text-right`}
          defaultValue={Math.round(item.valor)}
          disabled={pendiente}
          onBlur={(e) => {
            const nuevo = Number(e.target.value.replace(/\./g, "").trim());
            if (!Number.isFinite(nuevo)) return;
            if (nuevo !== Math.round(item.valor))
              ejecutar(() => actualizarCarteraItem(item.id, { valor: nuevo }), "Valor actualizado.");
          }}
        />
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {item.n_trabajadores ?? "—"}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">
        {item.n_sociedades ?? "—"}
      </TableCell>
      <TableCell className="text-right">
        <button
          type="button"
          disabled={pendiente}
          className="text-[11px] text-muted-foreground hover:text-red-600 hover:underline"
          title="Sacar de la cartera (queda inactivo, no se borra)"
          onClick={() => {
            if (window.confirm(`¿Sacar a ${item.cliente} de la cartera analizada?`))
              ejecutar(
                () => actualizarCarteraItem(item.id, { activo: false }),
                `${item.cliente} quedó inactivo.`,
              );
          }}
        >
          Sacar
        </button>
      </TableCell>
    </TableRow>
  );
}
