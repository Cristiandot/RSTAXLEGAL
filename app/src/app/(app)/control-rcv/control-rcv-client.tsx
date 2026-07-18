"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatMonto } from "@/lib/format";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";

export type EmpresaControl = {
  id: string;
  razon_social: string;
  rut_empresa: string;
  tieneClave: boolean;
  contabilidad: boolean;
  grupoCodigo: string;
};

/** Clave de orden por categoría: letra (A→D→…) y luego número (C.2 antes que C.10). */
function claveOrdenGrupo(codigo: string): [string, number] {
  const m = /^([A-Za-z]+)\.?(\d+)?/.exec(codigo ?? "");
  const letra = m?.[1]?.toUpperCase() ?? "ZZZ"; // sin código va al final
  const num = m?.[2] ? parseInt(m[2], 10) : 9999;
  return [letra, num];
}

export type DescargaRcv = {
  cliente_id: string;
  periodo: string;
  ventas_docs: number;
  compras_docs: number;
  ventas_docs_sii: number | null;
  compras_docs_sii: number | null;
  /** Montos del resumen oficial del SII (NC restadas). null = cuadratura vieja, solo por conteo. */
  ventas_total_sii: number | null;
  compras_total_sii: number | null;
  alto_volumen: boolean;
  ultima_descarga: string;
};

/** Fila de `v_rcv_totales_periodo`: totales del registro por empresa y mes (NC negativas). */
export type TotalesRcv = {
  cliente_id: string;
  periodo: string;
  ventas_total: number | string | null;
  ventas_nc_total: number | string | null;
  ventas_nc_docs: number | null;
  compras_total: number | string | null;
  compras_nc_total: number | string | null;
  compras_nc_docs: number | null;
  // Boletas de honorarios del período (brutos, sin anuladas).
  bhe_emitidas_total: number | string | null;
  bhe_emitidas_docs: number | null;
  bhe_recibidas_total: number | string | null;
  bhe_recibidas_docs: number | null;
  // Sumas COMPARABLES con el resumen del SII (excluyen tipos que el RCV no
  // lista, ej. DIN 914 de importación). Solo para el semáforo de cuadratura.
  ventas_total_rcv: number | string | null;
  compras_total_rcv: number | string | null;
};

type Props = {
  periodos: string[];
  etiquetas: string[];
  empresas: EmpresaControl[];
  descargas: DescargaRcv[];
  totales: TotalesRcv[];
  errorCarga: string | null;
};

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** "2026-01" → "Ene" (o "Ene 25" si el rango cruza de año, para no confundir). */
function etiquetaCorta(periodo: string, multiAnio: boolean): string {
  const [y, m] = periodo.split("-").map(Number);
  const mes = MESES_CORTOS[(m ?? 1) - 1] ?? periodo;
  return multiAnio ? `${mes} ${String(y).slice(2)}` : mes;
}

/** Estado de un mes concreto de una empresa. */
type EstadoCelda = "sin-clave" | "falta" | "parcial" | "sin-verificar" | "cuadra" | "revisar";

function estadoDeCelda(d: DescargaRcv | null, tieneClave: boolean, tot: TotalesRcv | null): EstadoCelda {
  if (!tieneClave) return "sin-clave";
  if (!d) return "falta";
  if (d.alto_volumen) return "parcial";
  if (d.ventas_docs_sii === null || d.compras_docs_sii === null) return "sin-verificar";
  if (d.ventas_docs !== d.ventas_docs_sii || d.compras_docs !== d.compras_docs_sii) return "revisar";
  // Cuadratura por MONTO (cuando la descarga/cuadratura guardó los totales del SII):
  // los conteos pueden calzar y aun así diferir la plata (doc reemplazado, boleta
  // ajustada). Se compara la suma COMPARABLE (sin tipos fuera del RCV, ej. DIN 914).
  if (d.ventas_total_sii !== null && Number(tot?.ventas_total_rcv ?? 0) !== Number(d.ventas_total_sii)) return "revisar";
  if (d.compras_total_sii !== null && Number(tot?.compras_total_rcv ?? 0) !== Number(d.compras_total_sii)) return "revisar";
  return "cuadra";
}

/** Rango para ordenar por el estado de un mes: de mejor (cuadra) a peor (sin clave). */
const RANGO_ESTADO_CELDA: Record<EstadoCelda, number> = {
  "cuadra": 0,
  "sin-verificar": 1,
  "parcial": 2,
  "revisar": 3,
  "falta": 4,
  "sin-clave": 5,
};

const ESTILO_CELDA: Record<EstadoCelda, { clase: string; glifo: string }> = {
  "cuadra": { clase: "border-emerald-200 bg-emerald-50 text-emerald-700", glifo: "✓" },
  "revisar": { clase: "border-amber-200 bg-amber-50 text-amber-700", glifo: "≠" },
  "parcial": { clase: "border-violet-200 bg-violet-50 text-violet-700", glifo: "≈" },
  "sin-verificar": { clase: "border-sky-200 bg-sky-50 text-sky-700", glifo: "•" },
  "falta": { clase: "border-red-200 bg-red-50 text-red-600", glifo: "✗" },
  "sin-clave": { clase: "border-transparent text-slate-300", glifo: "·" },
};

function ResumenCard({ label, valor, tono }: { label: string; valor: number; tono?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className={cn("text-2xl font-semibold tabular-nums", tono)}>{valor}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ControlRcvClient({ periodos, etiquetas, empresas, descargas, totales, errorCarga }: Props) {
  const [buscar, setBuscar] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [orden, setOrden] = useState<Orden>(null);
  // Mes cuyos totales (ventas/compras/NC) se muestran en las columnas de montos.
  const [mesTotales, setMesTotales] = useState(periodos[periodos.length - 1]);

  const mapa = useMemo(() => {
    const m = new Map<string, DescargaRcv>();
    for (const d of descargas) m.set(`${d.cliente_id}|${d.periodo}`, d);
    return m;
  }, [descargas]);

  const mapaTotales = useMemo(() => {
    const m = new Map<string, TotalesRcv>();
    for (const t of totales) m.set(`${t.cliente_id}|${t.periodo}`, t);
    return m;
  }, [totales]);

  const multiAnio = new Set(periodos.map((p) => p.slice(0, 4))).size > 1;

  const filas = useMemo(() => {
    const base = empresas.map((e) => {
      const celdas = periodos.map((p) => {
        const d = mapa.get(`${e.id}|${p}`) ?? null;
        const tot = mapaTotales.get(`${e.id}|${p}`) ?? null;
        return { d, tot, estado: estadoDeCelda(d, e.tieneClave, tot) };
      });
      const descargados = celdas.filter((c) => c.d !== null).length;
      const faltanMeses = e.tieneClave && descargados < periodos.length;
      const hayRevisar = celdas.some((c) => c.estado === "revisar" || c.estado === "parcial");
      const haySinVerificar = celdas.some((c) => c.estado === "sin-verificar");
      // "Al día" = con clave, todos los meses descargados y todos cuadran (verificados).
      const alDia = e.tieneClave && !faltanMeses && !hayRevisar && !haySinVerificar;
      return { empresa: e, celdas, descargados, faltanMeses, hayRevisar, haySinVerificar, alDia };
    });
    // Orden por categoría de cliente (A → D → …), luego número y razón social.
    return base.sort((a, b) => {
      const [la, na] = claveOrdenGrupo(a.empresa.grupoCodigo);
      const [lb, nb] = claveOrdenGrupo(b.empresa.grupoCodigo);
      return la.localeCompare(lb) || na - nb || a.empresa.razon_social.localeCompare(b.empresa.razon_social, "es");
    });
  }, [empresas, periodos, mapa, mapaTotales]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((f) => {
      if (q && !`${f.empresa.razon_social} ${f.empresa.rut_empresa}`.toLowerCase().includes(q)) return false;
      if (soloPendientes && f.alDia) return false;
      return true;
    });
    // Sin orden activo se mantiene el orden por defecto A → D (claveOrdenGrupo).
    if (!orden) return out;
    const val = (f: (typeof filas)[number]): unknown => {
      // Columnas de mes: se ordena por el estado del mes (de mejor a peor).
      const iMes = periodos.indexOf(orden.col);
      if (iMes >= 0) return RANGO_ESTADO_CELDA[f.celdas[iMes].estado];
      const tot = mapaTotales.get(`${f.empresa.id}|${mesTotales}`);
      switch (orden.col) {
        case "empresa":
          return f.empresa.razon_social;
        case "ventas":
          return tot?.ventas_total !== null && tot?.ventas_total !== undefined ? Number(tot.ventas_total) : null;
        case "compras":
          return tot?.compras_total !== null && tot?.compras_total !== undefined ? Number(tot.compras_total) : null;
        case "bhe_emitidas":
          return tot?.bhe_emitidas_total !== null && tot?.bhe_emitidas_total !== undefined ? Number(tot.bhe_emitidas_total) : null;
        case "bhe_recibidas":
          return tot?.bhe_recibidas_total !== null && tot?.bhe_recibidas_total !== undefined ? Number(tot.bhe_recibidas_total) : null;
        case "estado":
          // Estado global: al día → sin verificar → revisar → faltan → sin clave.
          if (!f.empresa.tieneClave) return 4;
          if (f.faltanMeses) return 3;
          if (f.hayRevisar) return 2;
          if (f.haySinVerificar) return 1;
          return 0;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [filas, buscar, soloPendientes, orden, periodos, mapaTotales, mesTotales]);

  const resumen = useMemo(() => {
    let alDia = 0, porRevisar = 0, conFaltantes = 0, sinClave = 0;
    for (const f of filas) {
      if (!f.empresa.tieneClave) { sinClave++; continue; }
      if (f.faltanMeses) conFaltantes++;
      else if (f.hayRevisar) porRevisar++;
      else if (f.alDia) alDia++;
    }
    return { total: filas.length, alDia, porRevisar, conFaltantes, sinClave };
  }, [filas]);

  return (
    <div className="space-y-4 py-4">
      <div>
        <h1 className="text-xl font-semibold">Control de descargas RCV</h1>
        <p className="text-sm text-muted-foreground">
          Por empresa y mes: si el Registro de Compras y Ventas está descargado del SII y si los
          documentos cuadran con lo que el SII declara. Las columnas de Ventas, Compras y BHE
          (boletas de honorarios emitidas y recibidas, brutos) traen los totales del mes elegido —
          con las notas de crédito ya restadas y detalladas debajo — para cuadrar contra el SII sin
          entrar empresa por empresa. Pasa el cursor por una celda para ver el detalle.
        </p>
      </div>

      {errorCarga && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Error al cargar: {errorCarga}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ResumenCard label="Empresas" valor={resumen.total} />
        <ResumenCard label="Al día (descargado y cuadra)" valor={resumen.alDia} tono="text-emerald-600" />
        <ResumenCard label="Por revisar (no cuadra)" valor={resumen.porRevisar} tono="text-amber-600" />
        <ResumenCard label="Con meses faltantes" valor={resumen.conFaltantes} tono="text-red-600" />
        <ResumenCard label="Sin clave SII" valor={resumen.sinClave} tono="text-slate-500" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Input
          placeholder="Buscar empresa o RUT…"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={soloPendientes} onCheckedChange={(v) => setSoloPendientes(Boolean(v))} />
          Solo con pendientes
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Totales de
          <select
            aria-label="Mes de los totales"
            className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={mesTotales}
            onChange={(e) => setMesTotales(e.target.value)}
          >
            {periodos.map((p, i) => (
              <option key={p} value={p}>{etiquetas[i]}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LeyendaItem clase="bg-emerald-500" texto="cuadra" />
          <LeyendaItem clase="bg-amber-500" texto="revisar" />
          <LeyendaItem clase="bg-sky-500" texto="descargado sin verificar" />
          <LeyendaItem clase="bg-violet-500" texto="alto volumen" />
          <LeyendaItem clase="bg-red-400" texto="falta" />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow>
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="min-w-[240px]">
                Empresa
              </ThSort>
              {periodos.map((p, i) => (
                <ThSort key={p} col={p} orden={orden} setOrden={setOrden} className="w-14 text-center">
                  <span title={etiquetas[i]}>{etiquetaCorta(p, multiAnio)}</span>
                </ThSort>
              ))}
              <ThSort col="ventas" orden={orden} setOrden={setOrden} className="text-right">
                Ventas {etiquetaCorta(mesTotales, multiAnio)}
              </ThSort>
              <ThSort col="compras" orden={orden} setOrden={setOrden} className="text-right">
                Compras {etiquetaCorta(mesTotales, multiAnio)}
              </ThSort>
              <ThSort col="bhe_emitidas" orden={orden} setOrden={setOrden} className="text-right">
                <span title={`Boletas de honorarios emitidas — brutos de ${etiquetaCorta(mesTotales, multiAnio)}`}>BHE emit.</span>
              </ThSort>
              <ThSort col="bhe_recibidas" orden={orden} setOrden={setOrden} className="text-right">
                <span title={`Boletas de honorarios recibidas (incluye BTE) — brutos de ${etiquetaCorta(mesTotales, multiAnio)}`}>BHE recib.</span>
              </ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden} className="text-center">
                Estado
              </ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((f) => (
              <TableRow key={f.empresa.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {f.empresa.grupoCodigo && (
                      <span className="inline-flex w-10 shrink-0 justify-center rounded bg-muted px-1 py-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                        {f.empresa.grupoCodigo}
                      </span>
                    )}
                    <div>
                      <div className="font-medium leading-tight">{f.empresa.razon_social}</div>
                      <div className="text-xs text-muted-foreground">{f.empresa.rut_empresa}</div>
                    </div>
                  </div>
                </TableCell>

                {f.celdas.map((c, i) => (
                  <TableCell key={periodos[i]} className="px-1 text-center">
                    {f.empresa.tieneClave ? (
                      <Link href={`/control-rcv/${f.empresa.id}?periodo=${periodos[i]}`} className="inline-block hover:opacity-80" title="Ver detalle del mes">
                        <CeldaEstado estado={c.estado} d={c.d} tot={c.tot} />
                      </Link>
                    ) : (
                      <CeldaEstado estado={c.estado} d={c.d} tot={c.tot} />
                    )}
                  </TableCell>
                ))}

                <CeldaTotales
                  tot={mapaTotales.get(`${f.empresa.id}|${mesTotales}`) ?? null}
                  d={mapa.get(`${f.empresa.id}|${mesTotales}`) ?? null}
                  registro="ventas"
                />
                <CeldaTotales
                  tot={mapaTotales.get(`${f.empresa.id}|${mesTotales}`) ?? null}
                  d={mapa.get(`${f.empresa.id}|${mesTotales}`) ?? null}
                  registro="compras"
                />
                <CeldaBhe tot={mapaTotales.get(`${f.empresa.id}|${mesTotales}`) ?? null} tipo="emitidas" />
                <CeldaBhe tot={mapaTotales.get(`${f.empresa.id}|${mesTotales}`) ?? null} tipo="recibidas" />

                <TableCell className="text-center">
                  <EstadoEmpresa fila={f} totalMeses={periodos.length} />
                </TableCell>
              </TableRow>
            ))}
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={periodos.length + 6} className="py-8 text-center text-muted-foreground">
                  Sin empresas para el filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LeyendaItem({ clase, texto }: { clase: string; texto: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-2.5 rounded-full", clase)} />
      {texto}
    </span>
  );
}

/** Celda por (empresa, período): estado de descarga + cuadratura, con el detalle en el tooltip. */
function CeldaEstado({ estado, d, tot }: { estado: EstadoCelda; d: DescargaRcv | null; tot: TotalesRcv | null }) {
  const { clase, glifo } = ESTILO_CELDA[estado];
  if (estado === "sin-clave") return <span className="text-slate-300">·</span>;

  const nuestros = d ? `${d.ventas_docs} ventas / ${d.compras_docs} compras` : "—";
  const sii =
    d && d.ventas_docs_sii !== null
      ? `${d.ventas_docs_sii} ventas / ${d.compras_docs_sii} compras`
      : "sin verificar";
  // Cuadratura por monto: solo cuando la descarga guardó los totales del SII.
  // Se muestran las sumas comparables (sin tipos fuera del RCV, ej. DIN 914).
  const montos =
    d && d.ventas_total_sii !== null
      ? `\nVentas: ${formatMonto(Number(tot?.ventas_total_rcv ?? 0))} (SII ${formatMonto(Number(d.ventas_total_sii))})` +
        `\nCompras: ${formatMonto(Number(tot?.compras_total_rcv ?? 0))} (SII ${formatMonto(Number(d.compras_total_sii ?? 0))})`
      : "";
  const titulo =
    estado === "falta"
      ? "No descargado"
      : `Descargado: ${nuestros}\nSegún SII: ${sii}` +
        montos +
        (estado === "parcial" ? "\nAlto volumen: falta descarga asíncrona" : "") +
        (estado === "revisar" ? "\n⚠ No cuadra con el SII" : "") +
        (d?.ultima_descarga ? `\nDescargado el ${new Date(d.ultima_descarga).toLocaleDateString("es-CL")}` : "");

  return (
    <span
      className={cn("inline-flex size-6 items-center justify-center rounded-md border text-[11px] font-medium", clase)}
      title={titulo}
    >
      {glifo}
    </span>
  );
}

/**
 * Totales del mes seleccionado para la cuadratura de la contadora contra el
 * SII: total del registro (las NC vienen negativas, o sea es el neto) y, si
 * hay notas de crédito, su monto y cantidad debajo. Si la descarga guardó el
 * total oficial del SII y no calza con el nuestro, se muestra en ámbar.
 */
function CeldaTotales({ tot, d, registro }: { tot: TotalesRcv | null; d: DescargaRcv | null; registro: "ventas" | "compras" }) {
  const total = registro === "ventas" ? tot?.ventas_total : tot?.compras_total;
  const nc = registro === "ventas" ? tot?.ventas_nc_total : tot?.compras_nc_total;
  const ncDocs = (registro === "ventas" ? tot?.ventas_nc_docs : tot?.compras_nc_docs) ?? 0;
  const totalSii = registro === "ventas" ? d?.ventas_total_sii : d?.compras_total_sii;
  // La comparación usa la suma comparable (sin tipos fuera del RCV, ej. DIN 914);
  // la celda igual muestra el total completo.
  const comparable = registro === "ventas" ? tot?.ventas_total_rcv : tot?.compras_total_rcv;
  const difiereSii = totalSii !== null && totalSii !== undefined && Number(comparable ?? 0) !== Number(totalSii);
  if (total === null || total === undefined) {
    return (
      <TableCell className="text-right">
        <span className="text-muted-foreground/50">—</span>
        {difiereSii && (
          <div className="text-[11px] font-medium text-amber-600 tabular-nums" title="El SII declara movimientos que no tenemos descargados">
            SII {formatMonto(Number(totalSii))}
          </div>
        )}
      </TableCell>
    );
  }
  return (
    <TableCell className="text-right">
      <div className="font-medium tabular-nums">{formatMonto(Number(total))}</div>
      {difiereSii && (
        <div className="text-[11px] font-medium text-amber-600 tabular-nums" title="No cuadra con el total que declara el SII">
          SII {formatMonto(Number(totalSii))}
        </div>
      )}
      {ncDocs > 0 && (
        <div className="text-[11px] text-red-500 tabular-nums" title={`${ncDocs} nota${ncDocs === 1 ? "" : "s"} de crédito incluida${ncDocs === 1 ? "" : "s"} en el total`}>
          NC {formatMonto(Number(nc ?? 0))} ({ncDocs})
        </div>
      )}
    </TableCell>
  );
}

/**
 * Boletas de honorarios del mes seleccionado (brutos, anuladas excluidas):
 * emitidas por la empresa (profesionales que boletean) o recibidas (incluye BTE).
 */
function CeldaBhe({ tot, tipo }: { tot: TotalesRcv | null; tipo: "emitidas" | "recibidas" }) {
  const total = tipo === "emitidas" ? tot?.bhe_emitidas_total : tot?.bhe_recibidas_total;
  const docs = (tipo === "emitidas" ? tot?.bhe_emitidas_docs : tot?.bhe_recibidas_docs) ?? 0;
  if (total === null || total === undefined) {
    return <TableCell className="text-right text-muted-foreground/50">—</TableCell>;
  }
  return (
    <TableCell className="text-right">
      <div className="font-medium tabular-nums">{formatMonto(Number(total))}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        {docs} boleta{docs === 1 ? "" : "s"}
      </div>
    </TableCell>
  );
}

/** Estado global de la empresa en el rango. */
function EstadoEmpresa({
  fila,
  totalMeses,
}: {
  fila: { empresa: EmpresaControl; descargados: number; faltanMeses: boolean; hayRevisar: boolean; haySinVerificar: boolean; alDia: boolean };
  totalMeses: number;
}) {
  if (!fila.empresa.tieneClave)
    return <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">sin clave</Badge>;
  if (fila.faltanMeses)
    return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">faltan {totalMeses - fila.descargados}</Badge>;
  if (fila.hayRevisar)
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">revisar</Badge>;
  if (fila.haySinVerificar)
    return <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">sin verificar</Badge>;
  return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">al día</Badge>;
}
