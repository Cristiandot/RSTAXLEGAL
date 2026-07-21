"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Lock, LockOpen, Plus, Trash2, Upload } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { etiquetaPeriodo } from "@/lib/periodos";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { nombreTipoDoc, periodoDesdeNombre, type LibroRcv } from "@/lib/contabilidad/rcv";
import { ContabilidadTabs } from "../contabilidad-tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  actualizarDocRcv,
  actualizarHonorario,
  actualizarMontosHonorario,
  actualizarMontosRcv,
  crearCuentaGasto,
  eliminarRcvPeriodo,
  guardarMontosF29,
  importarRcv,
  verificarClaveEdicion,
} from "./actions";

export type CuentaOpcion = {
  id: string;
  cliente_id: string | null;
  codigo: string;
  nombre: string;
  tipo: string;
};

export type DocCompra = {
  id: string;
  tipo_doc: number;
  tipo_compra: string | null;
  rut_proveedor: string;
  razon_social: string | null;
  folio: string;
  fecha_docto: string | null;
  monto_exento: number;
  monto_neto: number;
  iva_recuperable: number;
  iva_no_recuperable: number;
  monto_total: number;
  neto_activo_fijo: number;
  iva_activo_fijo: number;
  impto_sin_credito: number;
  otro_imp_valor: number;
  pagado_pct: number | string;
  cuenta_id: string | null;
  archivo_origen: string | null;
};

export type DocVenta = {
  id: string;
  tipo_doc: number;
  tipo_venta: string | null;
  rut_cliente: string | null;
  razon_social: string | null;
  folio: string;
  fecha_docto: string | null;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  pagado_pct: number | string;
  cuenta_id: string | null;
  archivo_origen: string | null;
};

export type DocHonorario = {
  id: string;
  numero: string;
  fecha: string | null;
  estado: string | null;
  rut_emisor: string | null;
  nombre_emisor: string | null;
  soc_profesional: boolean;
  brutos: number;
  retencion: number;
  liquido: number;
  pagado_pct: number | string;
  cuenta_id: string | null;
};

export type F29Montos = {
  id?: string;
  iva_debito: number | null;
  iva_credito: number | null;
  ppm: number | null;
  imp_unico: number | null;
  imp_2da_categoria: number | null;
  iva_postergado: number | null;
  monto_a_pagar: number | null;
  fecha_pago_f29: string | null;
};

const thCls =
  "px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap";
const tdNum = "px-2 py-1 text-right tabular-nums whitespace-nowrap";
const ES_NC = new Set([60, 61, 112]);

type FiltrosCol = {
  tipo: string;
  folio: string;
  fecha: string;
  rut: string;
  razon: string;
  cuenta: string;
};

const FILTROS_VACIOS: FiltrosCol = {
  tipo: "",
  folio: "",
  fecha: "",
  rut: "",
  razon: "",
  cuenta: "",
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Celda de filtro en el encabezado de la tabla. */
function FiltroTh({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <th className="px-2 pb-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filtrar…"
        className="h-6 w-full min-w-14 rounded-md border border-input bg-card px-1.5 text-xs font-normal text-foreground outline-none placeholder:text-muted-foreground/50 focus-visible:ring-2 focus-visible:ring-ring"
      />
    </th>
  );
}

function BadgeTipoDoc({ tipo }: { tipo: number }) {
  return (
    <Badge
      variant="outline"
      className={
        ES_NC.has(tipo)
          ? "border-red-200 bg-red-50 text-red-700"
          : tipo === 56
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-border bg-muted/40 text-foreground"
      }
      title={nombreTipoDoc(tipo)}
    >
      {tipo}
    </Badge>
  );
}

/** Resumen agrupado por tipo de documento: subtotales por cada tipo del período. */
function ResumenPorTipo({
  docs,
  libro,
  activo,
  onSelect,
}: {
  docs: (DocCompra | DocVenta)[];
  libro: "compra" | "venta";
  activo: number | null;
  onSelect: (tipo: number | null) => void;
}) {
  const filas = useMemo(() => {
    const map = new Map<
      number,
      { n: number; exento: number; neto: number; iva: number; total: number }
    >();
    for (const d of docs) {
      const cur =
        map.get(d.tipo_doc) ?? { n: 0, exento: 0, neto: 0, iva: 0, total: 0 };
      cur.n += 1;
      cur.exento += d.monto_exento;
      cur.neto += d.monto_neto;
      cur.iva +=
        libro === "compra"
          ? (d as DocCompra).iva_recuperable
          : (d as DocVenta).monto_iva;
      cur.total += d.monto_total;
      map.set(d.tipo_doc, cur);
    }
    return [...map.entries()]
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => a.tipo - b.tipo);
  }, [docs, libro]);

  if (filas.length === 0) return null;

  return (
    <div className="border-b border-border/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground">
          Resumen por tipo de documento
        </h3>
        {activo !== null ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs font-medium text-primary hover:underline"
          >
            Ver todos
          </button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filas.map((f) => (
          <button
            key={f.tipo}
            type="button"
            onClick={() => onSelect(activo === f.tipo ? null : f.tipo)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              activo === f.tipo
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border/60 bg-muted/20 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <BadgeTipoDoc tipo={f.tipo} />
              <span className="text-xs font-medium">{nombreTipoDoc(f.tipo)}</span>
              <span className="text-xs text-muted-foreground">· {f.n} docs</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
              <span className="text-muted-foreground">
                Neto <strong className="text-foreground">{formatMonto(f.neto)}</strong>
              </span>
              <span className="text-muted-foreground">
                {libro === "compra" ? "IVA Créd." : "IVA"}{" "}
                <strong className="text-foreground">{formatMonto(f.iva)}</strong>
              </span>
              <span className="text-muted-foreground">
                Total <strong className="text-foreground">{formatMonto(f.total)}</strong>
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Input inline de % pagado: guarda al salir del campo o con Enter. */
function PagadoCell({
  libro,
  doc,
  ocupado,
}: {
  libro: LibroRcv;
  doc: { id: string; pagado_pct: number | string };
  ocupado: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const original = Number(doc.pagado_pct);
  const [valor, setValor] = useState(String(original));

  function guardar() {
    const n = Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("El % pagado debe estar entre 0 y 100.");
      setValor(String(original));
      return;
    }
    if (n === original) return;
    start(async () => {
      const res = await actualizarDocRcv(libro, doc.id, { pagado_pct: n });
      if (res.ok) router.refresh();
      else {
        toast.error(res.error ?? "Error al guardar");
        setValor(String(original));
      }
    });
  }

  return (
    <input
      type="number"
      min={0}
      max={100}
      value={valor}
      disabled={ocupado}
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`h-7 w-16 rounded-md border bg-card px-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        original < 100 ? "border-amber-300 bg-amber-50" : "border-input"
      }`}
      aria-label="% pagado"
    />
  );
}

/**
 * Celda de monto: texto formateado en régimen; input editable solo con el
 * modo de edición de montos desbloqueado (clave verificada en el servidor).
 * Guarda al salir del campo o con Enter.
 */
function MontoCell({
  valor,
  editable,
  ocupado,
  destacar,
  onGuardar,
}: {
  valor: number;
  editable: boolean;
  ocupado: boolean;
  destacar?: boolean;
  onGuardar: (nuevo: number) => void;
}) {
  if (!editable) {
    return (
      <td className={`${tdNum}${destacar ? " font-medium" : ""}`}>
        {formatMonto(valor)}
      </td>
    );
  }
  return (
    <td className="px-2 py-1 text-right">
      <input
        key={valor}
        type="number"
        defaultValue={valor}
        disabled={ocupado}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && Math.round(n) !== valor) {
            onGuardar(Math.round(n));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-7 w-24 rounded-md border border-amber-300 bg-amber-50 px-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Monto"
      />
    </td>
  );
}

/** Selector inline de cuenta de gasto (solo compras). */
function CuentaCell({
  doc,
  cuentasGasto,
  ocupado,
  onNuevaCuenta,
}: {
  doc: { id: string; cuenta_id: string | null };
  cuentasGasto: CuentaOpcion[];
  ocupado: boolean;
  onNuevaCuenta: (docId: string) => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function guardar(valor: string) {
    if (valor === "__nueva__") {
      onNuevaCuenta(doc.id);
      return;
    }
    start(async () => {
      const res = await actualizarDocRcv("compra", doc.id, {
        cuenta_id: valor || null,
      });
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error al guardar");
    });
  }

  return (
    <select
      className={`h-7 max-w-52 rounded-md border bg-card px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        doc.cuenta_id ? "border-input" : "border-dashed border-muted-foreground/40 text-muted-foreground"
      }`}
      value={doc.cuenta_id ?? ""}
      disabled={ocupado}
      onChange={(e) => guardar(e.target.value)}
      aria-label="Cuenta de gasto"
    >
      <option value="">Gastos sin asignar</option>
      {cuentasGasto.map((c) => (
        <option key={c.id} value={c.id}>
          {c.codigo} {c.nombre}
        </option>
      ))}
      <option value="__nueva__">+ Nueva cuenta…</option>
    </select>
  );
}

function FilaValidacion({
  etiqueta,
  rcv,
  f29,
}: {
  etiqueta: string;
  rcv: number;
  f29: number | null;
}) {
  const sinF29 = f29 === null;
  const dif = sinF29 ? null : rcv - Number(f29);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">
          RCV <strong className="tabular-nums text-foreground">{formatMonto(rcv)}</strong>
        </span>
        <span className="text-muted-foreground">
          F29{" "}
          <strong className="tabular-nums text-foreground">
            {sinF29 ? "—" : formatMonto(f29)}
          </strong>
        </span>
        {sinF29 ? (
          <Badge variant="outline" className="border-border bg-muted/40">
            sin F29
          </Badge>
        ) : dif === 0 ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            Cuadra
          </Badge>
        ) : (
          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
            Dif {formatMonto(dif)}
          </Badge>
        )}
      </div>
    </div>
  );
}

const CAMPOS_F29: { campo: keyof F29Montos; label: string }[] = [
  { campo: "iva_debito", label: "IVA Débito Fiscal" },
  { campo: "iva_credito", label: "IVA Crédito Fiscal" },
  { campo: "ppm", label: "PPM" },
  { campo: "imp_unico", label: "Impuesto Único Trabajadores" },
  { campo: "imp_2da_categoria", label: "Impuesto 2da Categoría" },
  { campo: "iva_postergado", label: "IVA Postergado (art. 64 bis)" },
  { campo: "monto_a_pagar", label: "Total pagado al fisco" },
];

export function RcvClient({
  clienteId,
  razonSocial,
  rutEmpresa,
  periodo,
  compras,
  ventas,
  honorarios,
  cuentas,
  f29,
}: {
  clienteId: string;
  razonSocial: string;
  rutEmpresa: string | null;
  periodo: string;
  compras: DocCompra[];
  ventas: DocVenta[];
  honorarios: DocHonorario[];
  cuentas: CuentaOpcion[];
  f29: F29Montos | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"compra" | "venta" | "honorario">("compra");
  const [filtroTipo, setFiltroTipo] = useState<number | null>(null);
  const [filtrosCol, setFiltrosCol] = useState<FiltrosCol>(FILTROS_VACIOS);
  const [importando, startImportar] = useTransition();
  const [ocupado, startOcupado] = useTransition();
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [editandoF29, setEditandoF29] = useState(false);
  // Edición excepcional de montos: null = bloqueada; con clave verificada se
  // guarda para reenviarla en cada escritura (el servidor la revalida siempre).
  const [claveEdicion, setClaveEdicion] = useState<string | null>(null);
  const [dialogoClave, setDialogoClave] = useState(false);
  const [claveInput, setClaveInput] = useState("");
  const [claveError, setClaveError] = useState<string | null>(null);
  const [nuevaCuentaDoc, setNuevaCuentaDoc] = useState<string | null>(null);
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");

  const cuentasGasto = useMemo(
    () => cuentas.filter((c) => c.tipo === "gasto" && c.codigo !== "4.01.01.99"),
    [cuentas],
  );

  const tot = useMemo(() => {
    const sum = <T,>(arr: T[], f: (x: T) => number) =>
      arr.reduce((a, x) => a + f(x), 0);
    return {
      comprasNeto: sum(compras, (d) => d.monto_neto),
      comprasIva: sum(compras, (d) => d.iva_recuperable),
      comprasTotal: sum(compras, (d) => d.monto_total),
      comprasExento: sum(compras, (d) => d.monto_exento),
      ventasNeto: sum(ventas, (d) => d.monto_neto),
      ventasIva: sum(ventas, (d) => d.monto_iva),
      ventasTotal: sum(ventas, (d) => d.monto_total),
      ventasExento: sum(ventas, (d) => d.monto_exento),
      honBrutos: sum(honorarios, (h) => h.brutos),
      honRetencion: sum(honorarios, (h) => h.retencion),
      honLiquido: sum(honorarios, (h) => h.liquido),
    };
  }, [compras, ventas, honorarios]);

  function guardarHonorario(
    id: string,
    patch: { pagado_pct?: number; cuenta_id?: string | null },
  ) {
    startOcupado(async () => {
      const res = await actualizarHonorario(id, patch);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error al guardar");
    });
  }

  function desbloquearEdicion() {
    const clave = claveInput;
    startOcupado(async () => {
      const res = await verificarClaveEdicion(clave);
      if (res.ok) {
        setClaveEdicion(clave);
        setDialogoClave(false);
        setClaveInput("");
        setClaveError(null);
        toast.success("Edición de montos habilitada. Cada cambio queda auditado.");
      } else {
        setClaveError(res.error ?? "Clave incorrecta.");
      }
    });
  }

  function guardarMontoDoc(id: string, campo: string, valor: number) {
    if (!claveEdicion || tab === "honorario") return;
    const libro = tab;
    startOcupado(async () => {
      const res = await actualizarMontosRcv(libro, id, claveEdicion, {
        [campo]: valor,
      });
      if (res.ok) {
        toast.success("Monto corregido");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  function guardarMontoHonorario(id: string, campo: string, valor: number) {
    if (!claveEdicion) return;
    startOcupado(async () => {
      const res = await actualizarMontosHonorario(id, claveEdicion, {
        [campo]: valor,
      });
      if (res.ok) {
        toast.success("Monto corregido");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  function onArchivoElegido(archivo: File) {
    const detectado = periodoDesdeNombre(archivo.name);
    let objetivo = periodo;
    if (detectado && detectado !== periodo) {
      const usar = window.confirm(
        `El nombre del archivo indica período ${etiquetaPeriodo(detectado)} y estás viendo ${etiquetaPeriodo(periodo)}.\n\nAceptar = importar a ${etiquetaPeriodo(detectado)} (recomendado)\nCancelar = importar a ${etiquetaPeriodo(periodo)}`,
      );
      if (usar) objetivo = detectado;
    }
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("clienteId", clienteId);
    fd.append("periodo", objetivo);
    startImportar(async () => {
      const res = await importarRcv(fd);
      if (!res.ok || !res.resumen) {
        toast.error(res.error ?? "Error al importar");
        return;
      }
      const r = res.resumen;
      toast.success(
        `${r.libro === "compra" ? "Compras" : "Ventas"} ${etiquetaPeriodo(r.periodo)}: ${r.total} documentos (${r.insertadas} nuevos, ${r.actualizadas} actualizados).`,
      );
      if (r.advertencias.length > 0) {
        toast.warning(`${r.advertencias.length} líneas omitidas del CSV.`);
      }
      setTab(r.libro);
      if (r.periodo !== periodo) {
        router.push(`/contabilidad/${clienteId}/rcv?periodo=${r.periodo}`);
      } else {
        router.refresh();
      }
    });
  }

  function onEliminarPeriodo() {
    if (tab === "honorario") return;
    const cuantos = tab === "compra" ? compras.length : ventas.length;
    if (cuantos === 0) return;
    if (
      !window.confirm(
        `¿Eliminar los ${cuantos} documentos de ${tab === "compra" ? "compras" : "ventas"} de ${etiquetaPeriodo(periodo)}?\n\nSe pierden los % pagado y cuentas asignadas de este libro. El CSV original queda en el checklist documental.`,
      )
    )
      return;
    startOcupado(async () => {
      const res = await eliminarRcvPeriodo(tab, clienteId, periodo);
      if (res.ok) {
        toast.success("Importación eliminada");
        router.refresh();
      } else toast.error(res.error ?? "Error al eliminar");
    });
  }

  function onCrearCuenta() {
    const docId = nuevaCuentaDoc;
    startOcupado(async () => {
      const res = await crearCuentaGasto(clienteId, nuevoCodigo, nuevoNombre);
      if (!res.ok || !res.id) {
        toast.error(res.error ?? "Error al crear la cuenta");
        return;
      }
      if (docId) {
        await actualizarDocRcv("compra", docId, { cuenta_id: res.id });
      }
      toast.success(`Cuenta ${nuevoCodigo} creada`);
      setNuevaCuentaDoc(null);
      setNuevoCodigo("");
      setNuevoNombre("");
      router.refresh();
    });
  }

  function onGuardarF29(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const num = (k: string): number | null => {
      const v = String(fd.get(k) ?? "").replace(/\./g, "").trim();
      if (v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    startOcupado(async () => {
      const res = await guardarMontosF29(clienteId, periodo, {
        iva_debito: num("iva_debito"),
        iva_credito: num("iva_credito"),
        ppm: num("ppm"),
        imp_unico: num("imp_unico"),
        imp_2da_categoria: num("imp_2da_categoria"),
        iva_postergado: num("iva_postergado"),
        monto_a_pagar: num("monto_a_pagar"),
        fecha_pago_f29: String(fd.get("fecha_pago_f29") ?? "") || null,
      });
      if (res.ok) {
        toast.success("Montos F29 guardados");
        setEditandoF29(false);
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  const docs = tab === "compra" ? compras : tab === "venta" ? ventas : honorarios;

  const setF = (k: keyof FiltrosCol) => (v: string) =>
    setFiltrosCol((p) => ({ ...p, [k]: v }));
  const hayFiltrosCol = Object.values(filtrosCol).some((v) => v.trim() !== "");

  const nombreCuenta = (cuentaId: string | null) => {
    const c = cuentas.find((x) => x.id === cuentaId);
    return c ? `${c.codigo} ${c.nombre}` : "sin asignar";
  };

  function pasaFiltrosDoc(d: DocCompra | DocVenta, esCompra: boolean) {
    const f = filtrosCol;
    if (
      f.tipo &&
      !String(d.tipo_doc).includes(f.tipo.trim()) &&
      !norm(nombreTipoDoc(d.tipo_doc)).includes(norm(f.tipo))
    )
      return false;
    if (f.folio && !norm(d.folio).includes(norm(f.folio))) return false;
    if (f.fecha && !norm(formatFecha(d.fecha_docto)).includes(norm(f.fecha)))
      return false;
    const rut = esCompra
      ? (d as DocCompra).rut_proveedor
      : (d as DocVenta).rut_cliente;
    if (f.rut && !norm(rut).includes(norm(f.rut))) return false;
    if (f.razon && !norm(d.razon_social).includes(norm(f.razon))) return false;
    if (esCompra && f.cuenta) {
      if (!norm(nombreCuenta((d as DocCompra).cuenta_id)).includes(norm(f.cuenta)))
        return false;
    }
    return true;
  }

  function pasaFiltrosHon(h: DocHonorario) {
    const f = filtrosCol;
    if (f.folio && !norm(h.numero).includes(norm(f.folio))) return false;
    if (f.fecha && !norm(formatFecha(h.fecha)).includes(norm(f.fecha)))
      return false;
    if (f.rut && !norm(h.rut_emisor).includes(norm(f.rut))) return false;
    if (f.razon && !norm(h.nombre_emisor).includes(norm(f.razon))) return false;
    if (f.cuenta && !norm(nombreCuenta(h.cuenta_id)).includes(norm(f.cuenta)))
      return false;
    return true;
  }

  // Filtrado por tipo de documento (resumen por tipo) + filtros de columna.
  const comprasVis = compras.filter(
    (d) =>
      (!filtroTipo || d.tipo_doc === filtroTipo) && pasaFiltrosDoc(d, true),
  );
  const ventasVis = ventas.filter(
    (d) =>
      (!filtroTipo || d.tipo_doc === filtroTipo) && pasaFiltrosDoc(d, false),
  );
  const honorariosVis = honorarios.filter(pasaFiltrosHon);
  const honTotVis = {
    brutos: honorariosVis.reduce((a, h) => a + h.brutos, 0),
    retencion: honorariosVis.reduce((a, h) => a + h.retencion, 0),
    liquido: honorariosVis.reduce((a, h) => a + h.liquido, 0),
  };
  const visList = tab === "compra" ? comprasVis : ventasVis;
  const visTot = {
    exento: visList.reduce((a, d) => a + d.monto_exento, 0),
    neto: visList.reduce((a, d) => a + d.monto_neto, 0),
    iva: visList.reduce(
      (a, d) =>
        a +
        (tab === "compra"
          ? (d as DocCompra).iva_recuperable
          : (d as DocVenta).monto_iva),
      0,
    ),
    total: visList.reduce((a, d) => a + d.monto_total, 0),
  };

  return (
    <div className="space-y-5">
      <ContabilidadTabs clienteId={clienteId} periodo={periodo} active="rcv" />
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            render={<Link href={`/contabilidad/${clienteId}?periodo=${periodo}`} />}
          >
            <ArrowLeft className="size-4" />
            Volver al detalle del mes
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Libros de compras y ventas — {razonSocial}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rutEmpresa ? `RUT ${rutEmpresa} · ` : ""}
            Registro de Compras y Ventas del SII, base de la contabilidad
            mensual.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/contabilidad/${clienteId}/balance?periodo=${periodo}`} />}
          >
            Ver contabilidad y Balance
          </Button>
          <SelectorPeriodo
            periodo={periodo}
            onCambio={(p) =>
              router.push(`/contabilidad/${clienteId}/rcv?periodo=${p}`)
            }
          />
        </div>
      </div>

      {/* ── Resumen del período ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Ventas netas", valor: tot.ventasNeto },
          { label: "IVA Débito (ventas)", valor: tot.ventasIva },
          { label: "Compras netas", valor: tot.comprasNeto },
          { label: "IVA Crédito (compras)", valor: tot.comprasIva },
        ].map((c) => (
          <div key={c.label} className="card-soft rounded-xl bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatMonto(c.valor)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Validación RCV vs F29 ── */}
      <div className="card-soft rounded-xl bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold">
            Validación contra F29 de {etiquetaPeriodo(periodo)}
          </h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditandoF29((v) => !v)}
          >
            {editandoF29 ? "Cerrar" : f29?.iva_debito != null ? "Editar montos F29" : "Registrar montos F29"}
          </Button>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          La suma del IVA del RCV debe calzar EXACTO ($0 de tolerancia) con el
          comprobante F29 del SII. Si no cuadra: documentos sin acuse en el RCV
          o ajustes manuales en el F29.
        </p>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          <FilaValidacion
            etiqueta="IVA Débito"
            rcv={tot.ventasIva}
            f29={f29?.iva_debito ?? null}
          />
          <FilaValidacion
            etiqueta="IVA Crédito"
            rcv={tot.comprasIva}
            f29={f29?.iva_credito ?? null}
          />
        </div>
        {editandoF29 ? (
          <form
            onSubmit={onGuardarF29}
            className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-4"
          >
            {CAMPOS_F29.map((c) => (
              <div key={c.campo} className="flex flex-col gap-1">
                <Label htmlFor={String(c.campo)} className="text-xs">
                  {c.label}
                </Label>
                <Input
                  id={String(c.campo)}
                  name={String(c.campo)}
                  inputMode="numeric"
                  placeholder="$"
                  className="h-8 bg-card text-right tabular-nums"
                  defaultValue={f29?.[c.campo] != null ? String(f29[c.campo]) : ""}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <Label htmlFor="fecha_pago_f29" className="text-xs">
                Fecha pago F29
              </Label>
              <Input
                id="fecha_pago_f29"
                name="fecha_pago_f29"
                type="date"
                className="h-8 bg-card"
                defaultValue={f29?.fecha_pago_f29 ?? ""}
              />
            </div>
            <div className="col-span-2 flex items-end justify-end sm:col-span-4">
              <Button type="submit" size="sm" disabled={ocupado}>
                {ocupado ? "Guardando…" : "Guardar montos F29"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      {/* ── Libro ── */}
      <div className="card-soft rounded-xl bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 pt-3 pb-0">
          <div className="flex gap-1">
            {(
              [
                { v: "compra", label: `Compras (${compras.length})` },
                { v: "venta", label: `Ventas (${ventas.length})` },
                { v: "honorario", label: `Honorarios (${honorarios.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => {
                  setTab(t.v);
                  setFiltroTipo(null);
                  setFiltrosCol(FILTROS_VACIOS);
                }}
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
          <div className="flex items-center gap-2 pb-2">
            {docs.length > 0 ? (
              claveEdicion ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                  onClick={() => setClaveEdicion(null)}
                >
                  <LockOpen className="size-3.5" />
                  Cerrar edición de montos
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => {
                    setClaveError(null);
                    setClaveInput("");
                    setDialogoClave(true);
                  }}
                >
                  <Lock className="size-3.5" />
                  Editar montos
                </Button>
              )
            ) : null}
            {tab !== "honorario" && docs.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={onEliminarPeriodo}
                disabled={ocupado || importando}
              >
                <Trash2 className="size-3.5" />
                Eliminar importación
              </Button>
            ) : null}
            <input
              ref={inputArchivo}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) onArchivoElegido(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              onClick={() => inputArchivo.current?.click()}
              disabled={importando}
            >
              <Upload className="size-3.5" />
              {importando ? "Importando…" : "Importar CSV del SII"}
            </Button>
          </div>
        </div>

        {claveEdicion ? (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
            <LockOpen className="size-3.5 shrink-0" />
            Modo edición de montos activo: corrige solo casos puntuales. Cada
            cambio queda registrado en la auditoría (quién, documento, valor
            anterior y nuevo).
          </div>
        ) : null}

        {nuevaCuentaDoc !== null || (nuevoCodigo && !nuevaCuentaDoc) ? null : null}
        {nuevaCuentaDoc !== null ? (
          <div className="flex flex-wrap items-end gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Código nueva cuenta</Label>
              <Input
                value={nuevoCodigo}
                onChange={(e) => setNuevoCodigo(e.target.value)}
                placeholder="4.01.02.01"
                className="h-8 w-36 bg-card"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value)}
                placeholder="Arriendos"
                className="h-8 w-64 bg-card"
              />
            </div>
            <Button type="button" size="sm" onClick={onCrearCuenta} disabled={ocupado}>
              <Plus className="size-3.5" />
              Crear y asignar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setNuevaCuentaDoc(null)}
            >
              Cancelar
            </Button>
          </div>
        ) : null}

        {tab !== "honorario" && docs.length > 0 ? (
          <ResumenPorTipo
            docs={tab === "compra" ? compras : ventas}
            libro={tab}
            activo={filtroTipo}
            onSelect={setFiltroTipo}
          />
        ) : null}

        {tab === "honorario" ? (
          honorarios.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Sin boletas de honorarios en {etiquetaPeriodo(periodo)}.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                  <tr>
                    <th className={thCls}>N° Boleta</th>
                    <th className={thCls}>Fecha</th>
                    <th className={thCls}>RUT Emisor</th>
                    <th className={thCls}>Nombre</th>
                    <th className={thCls}>Soc. Prof.</th>
                    <th className={`${thCls} text-right`}>Brutos</th>
                    <th className={`${thCls} text-right`}>Retención</th>
                    <th className={`${thCls} text-right`}>Líquido</th>
                    <th className={`${thCls} text-right`}>% Pagado</th>
                    <th className={thCls}>Cuenta gasto</th>
                  </tr>
                  <tr>
                    <FiltroTh value={filtrosCol.folio} onChange={setF("folio")} />
                    <FiltroTh value={filtrosCol.fecha} onChange={setF("fecha")} />
                    <FiltroTh value={filtrosCol.rut} onChange={setF("rut")} />
                    <FiltroTh value={filtrosCol.razon} onChange={setF("razon")} />
                    <th colSpan={5} className="px-2 pb-1.5 text-right">
                      {hayFiltrosCol ? (
                        <button
                          type="button"
                          onClick={() => setFiltrosCol(FILTROS_VACIOS)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Limpiar filtros
                        </button>
                      ) : null}
                    </th>
                    <FiltroTh value={filtrosCol.cuenta} onChange={setF("cuenta")} />
                  </tr>
                </thead>
                <tbody>
                  {honorariosVis.map((h) => (
                    <tr
                      key={h.id}
                      className={`border-t border-border/40 hover:bg-muted/30 ${
                        h.estado && h.estado !== "VIGENTE" ? "text-red-700 line-through" : ""
                      }`}
                    >
                      <td className="px-2 py-1 tabular-nums">{h.numero}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{formatFecha(h.fecha)}</td>
                      <td className="px-2 py-1 whitespace-nowrap tabular-nums">{h.rut_emisor}</td>
                      <td className="max-w-72 truncate px-2 py-1" title={h.nombre_emisor ?? ""}>
                        {h.nombre_emisor}
                      </td>
                      <td className="px-2 py-1">{h.soc_profesional ? "Sí" : "No"}</td>
                      <MontoCell
                        valor={h.brutos}
                        editable={claveEdicion !== null}
                        ocupado={ocupado}
                        onGuardar={(n) => guardarMontoHonorario(h.id, "brutos", n)}
                      />
                      <MontoCell
                        valor={h.retencion}
                        editable={claveEdicion !== null}
                        ocupado={ocupado}
                        onGuardar={(n) => guardarMontoHonorario(h.id, "retencion", n)}
                      />
                      <MontoCell
                        valor={h.liquido}
                        editable={claveEdicion !== null}
                        ocupado={ocupado}
                        destacar
                        onGuardar={(n) => guardarMontoHonorario(h.id, "liquido", n)}
                      />
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={String(Number(h.pagado_pct))}
                          disabled={ocupado}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (n !== Number(h.pagado_pct)) guardarHonorario(h.id, { pagado_pct: n });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className={`h-7 w-16 rounded-md border bg-card px-1.5 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            Number(h.pagado_pct) < 100 ? "border-amber-300 bg-amber-50" : "border-input"
                          }`}
                          aria-label="% pagado"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <select
                          className={`h-7 max-w-52 rounded-md border bg-card px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            h.cuenta_id ? "border-input" : "border-dashed border-muted-foreground/40 text-muted-foreground"
                          }`}
                          value={h.cuenta_id ?? ""}
                          disabled={ocupado}
                          onChange={(e) => guardarHonorario(h.id, { cuenta_id: e.target.value || null })}
                          aria-label="Cuenta de gasto"
                        >
                          <option value="">Gastos sin asignar</option>
                          {cuentasGasto.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codigo} {c.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-card shadow-[0_-1px_0_0_var(--border)]">
                  <tr className="border-t border-border font-semibold">
                    <td className="px-2 py-1.5" colSpan={5}>
                      Totales ({honorariosVis.length} boletas
                      {hayFiltrosCol ? ` de ${honorarios.length} · filtradas` : ""})
                    </td>
                    <td className={tdNum}>{formatMonto(honTotVis.brutos)}</td>
                    <td className={tdNum}>{formatMonto(honTotVis.retencion)}</td>
                    <td className={tdNum}>{formatMonto(honTotVis.liquido)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : docs.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Sin documentos de {tab === "compra" ? "compras" : "ventas"} en{" "}
            {etiquetaPeriodo(periodo)}. Descarga el detalle del RCV en sii.cl y
            súbelo con &quot;Importar CSV del SII&quot;.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                <tr>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Folio</th>
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>RUT</th>
                  <th className={thCls}>Razón social</th>
                  <th className={`${thCls} text-right`}>Exento</th>
                  <th className={`${thCls} text-right`}>Neto</th>
                  <th className={`${thCls} text-right`}>
                    {tab === "compra" ? "IVA Crédito" : "IVA"}
                  </th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={`${thCls} text-right`}>% Pagado</th>
                  {tab === "compra" ? <th className={thCls}>Cuenta gasto</th> : null}
                </tr>
                <tr>
                  <FiltroTh value={filtrosCol.tipo} onChange={setF("tipo")} />
                  <FiltroTh value={filtrosCol.folio} onChange={setF("folio")} />
                  <FiltroTh value={filtrosCol.fecha} onChange={setF("fecha")} />
                  <FiltroTh value={filtrosCol.rut} onChange={setF("rut")} />
                  <FiltroTh value={filtrosCol.razon} onChange={setF("razon")} />
                  <th colSpan={5} className="px-2 pb-1.5 text-right">
                    {hayFiltrosCol ? (
                      <button
                        type="button"
                        onClick={() => setFiltrosCol(FILTROS_VACIOS)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    ) : null}
                  </th>
                  {tab === "compra" ? (
                    <FiltroTh value={filtrosCol.cuenta} onChange={setF("cuenta")} />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {tab === "compra"
                  ? comprasVis.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-t border-border/40 hover:bg-muted/30 ${
                          ES_NC.has(d.tipo_doc) ? "text-red-700" : ""
                        }`}
                      >
                        <td className="px-2 py-1">
                          <BadgeTipoDoc tipo={d.tipo_doc} />
                        </td>
                        <td className="px-2 py-1 tabular-nums">{d.folio}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {formatFecha(d.fecha_docto)}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap tabular-nums">
                          {d.rut_proveedor}
                        </td>
                        <td
                          className="max-w-72 truncate px-2 py-1"
                          title={d.razon_social ?? ""}
                        >
                          {d.razon_social}
                        </td>
                        <MontoCell
                          valor={d.monto_exento}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_exento", n)}
                        />
                        <MontoCell
                          valor={d.monto_neto}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_neto", n)}
                        />
                        <MontoCell
                          valor={d.iva_recuperable}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "iva_recuperable", n)}
                        />
                        <MontoCell
                          valor={d.monto_total}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          destacar
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_total", n)}
                        />
                        <td className="px-2 py-1 text-right">
                          <PagadoCell libro="compra" doc={d} ocupado={ocupado} />
                        </td>
                        <td className="px-2 py-1">
                          <CuentaCell
                            doc={d}
                            cuentasGasto={cuentasGasto}
                            ocupado={ocupado}
                            onNuevaCuenta={(id) => setNuevaCuentaDoc(id)}
                          />
                        </td>
                      </tr>
                    ))
                  : ventasVis.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-t border-border/40 hover:bg-muted/30 ${
                          ES_NC.has(d.tipo_doc) ? "text-red-700" : ""
                        }`}
                      >
                        <td className="px-2 py-1">
                          <BadgeTipoDoc tipo={d.tipo_doc} />
                        </td>
                        <td className="px-2 py-1 tabular-nums">{d.folio}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {formatFecha(d.fecha_docto)}
                        </td>
                        <td className="px-2 py-1 whitespace-nowrap tabular-nums">
                          {d.rut_cliente}
                        </td>
                        <td
                          className="max-w-72 truncate px-2 py-1"
                          title={d.razon_social ?? ""}
                        >
                          {d.razon_social}
                        </td>
                        <MontoCell
                          valor={d.monto_exento}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_exento", n)}
                        />
                        <MontoCell
                          valor={d.monto_neto}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_neto", n)}
                        />
                        <MontoCell
                          valor={d.monto_iva}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_iva", n)}
                        />
                        <MontoCell
                          valor={d.monto_total}
                          editable={claveEdicion !== null}
                          ocupado={ocupado}
                          destacar
                          onGuardar={(n) => guardarMontoDoc(d.id, "monto_total", n)}
                        />
                        <td className="px-2 py-1 text-right">
                          <PagadoCell libro="venta" doc={d} ocupado={ocupado} />
                        </td>
                      </tr>
                    ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-card shadow-[0_-1px_0_0_var(--border)]">
                <tr className="border-t border-border font-semibold">
                  <td className="px-2 py-1.5" colSpan={5}>
                    Totales ({visList.length} documentos
                    {filtroTipo || hayFiltrosCol
                      ? ` de ${tab === "compra" ? compras.length : ventas.length} · filtrados`
                      : ""}
                    {filtroTipo ? ` · tipo: ${nombreTipoDoc(filtroTipo)}` : ""})
                  </td>
                  <td className={tdNum}>{formatMonto(visTot.exento)}</td>
                  <td className={tdNum}>{formatMonto(visTot.neto)}</td>
                  <td className={tdNum}>{formatMonto(visTot.iva)}</td>
                  <td className={tdNum}>{formatMonto(visTot.total)}</td>
                  <td colSpan={tab === "compra" ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="px-4 py-2 text-xs text-muted-foreground">
          Las notas de crédito (61) se guardan con montos negativos — restan en
          los totales, igual que en el F29. El % pagado por defecto es 100
          (criterio del proceso: pago en el mismo período); ajústalo cuando un
          documento no se pagó o se pagó parcial. Reimportar el mismo CSV
          actualiza los datos del SII sin pisar % pagado ni cuentas asignadas.
        </p>
      </div>

      {/* ── Diálogo de clave: doble verificación para editar montos ── */}
      <Dialog
        open={dialogoClave}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setDialogoClave(false);
            setClaveInput("");
            setClaveError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4" />
              Editar montos del SII
            </DialogTitle>
            <DialogDescription>
              Los montos vienen del RCV / registro de BHE oficial y en régimen
              no se tocan. Ingresa la clave de edición para habilitar la
              corrección; cada cambio queda auditado con tu usuario, el
              documento y el valor anterior y nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2 py-1">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={claveInput}
              onChange={(e) => {
                setClaveInput(e.target.value);
                setClaveError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && claveInput) desbloquearEdicion();
              }}
              placeholder="••••"
              className="h-11 w-40 text-center !text-xl tracking-[0.5em]"
              aria-label="Clave de edición"
            />
            {claveError ? (
              <p className="text-sm text-red-600">{claveError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogoClave(false);
                setClaveInput("");
                setClaveError(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={desbloquearEdicion}
              disabled={!claveInput || ocupado}
            >
              {ocupado ? "Verificando…" : "Habilitar edición"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
