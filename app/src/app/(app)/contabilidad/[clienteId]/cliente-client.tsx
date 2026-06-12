"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { etiquetaPeriodo, opcionesPeriodo } from "@/lib/periodos";
import {
  claseEstado,
  type ConciliacionRow,
  type IvaEjecucionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import { CATEGORIAS_DOCUMENTO, type CategoriaInfo } from "../categorias";
import type { DocumentoContable } from "../contabilidad-client";
import {
  anularDocumentoContable,
  eliminarCambioIva,
  guardarContabilidad,
  registrarCambioIva,
  subirDocumentoContable,
  urlDocumentoContable,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export type GastoMenor = {
  id: string;
  tipo: "compra" | "venta";
  fecha: string;
  descripcion: string;
  monto: number;
  origen: string;
  created_at: string;
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function formatTamano(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Casilla de carga de una categoría: lista de archivos + botón subir. */
function CasillaCategoria({
  cat,
  docs,
  ocupado,
  onSubir,
  onDescargar,
  onAnular,
}: {
  cat: CategoriaInfo;
  docs: DocumentoContable[];
  ocupado: boolean;
  onSubir: (cat: CategoriaInfo, archivo: File) => void;
  onDescargar: (d: DocumentoContable) => void;
  onAnular: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cargada = docs.length > 0;
  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        cargada ? "border-emerald-200 bg-emerald-50/40" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {cat.label}{" "}
            {cargada ? (
              <span className="text-emerald-600">✓</span>
            ) : (
              <span className="text-xs font-normal text-muted-foreground">
                · pendiente
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">{cat.descripcion}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onSubir(cat, f);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant={cargada ? "ghost" : "outline"}
          className="h-8 shrink-0"
          onClick={() => inputRef.current?.click()}
          disabled={ocupado}
        >
          <Upload className="size-3.5" />
          Subir
        </Button>
      </div>
      {docs.length > 0 ? (
        <div className="mt-2 space-y-1">
          {docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-md bg-card px-2 py-1 text-sm"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate" title={d.nombre_original}>
                  {d.nombre_original}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatFecha(d.created_at.slice(0, 10))}
                  {d.subido_por_nombre ? ` · ${d.subido_por_nombre.split(" ")[0]}` : ""}
                  {d.tamano_bytes ? ` · ${formatTamano(d.tamano_bytes)}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => onDescargar(d)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                  title="Descargar"
                  disabled={ocupado}
                >
                  <Download className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onAnular(d.id)}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                  title="Quitar del checklist (el archivo queda guardado)"
                  disabled={ocupado}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ClienteContabilidadClient({
  periodo,
  fila,
  usuarios,
  documentos,
  ivaEjecuciones,
  gastosMenores,
  contabilidadCompleta = false,
  errorCarga,
}: {
  periodo: string;
  fila: ConciliacionRow | null;
  usuarios: UsuarioOpcion[];
  documentos: DocumentoContable[];
  ivaEjecuciones: IvaEjecucionRow[];
  gastosMenores: GastoMenor[];
  contabilidadCompleta?: boolean;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [obsIva, setObsIva] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [docPendiente, startDoc] = useTransition();
  const [ivaPendiente, startIva] = useTransition();

  if (!fila) {
    return (
      <div className="space-y-4 pt-2">
        <Button variant="ghost" size="sm" render={<Link href={`/contabilidad?periodo=${periodo}`} />}>
          <ArrowLeft className="size-4" />
          Volver a Contabilidad mensual
        </Button>
        <div className="card-soft rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
          {errorCarga
            ? `Error al cargar: ${errorCarga}`
            : `Esta empresa no tiene ciclo de contabilidad para ${etiquetaPeriodo(periodo)}.`}
        </div>
      </div>
    );
  }

  const docsDe = (categoria: string) =>
    documentos.filter((d) => d.categoria === categoria);

  function subir(cat: CategoriaInfo, archivo: File) {
    if (!fila) return;
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("clienteId", fila.cliente_id);
    fd.append("cicloId", fila.ciclo_id);
    fd.append("periodo", periodo);
    fd.append("categoria", cat.value);
    fd.append("etiqueta", "");
    startDoc(async () => {
      const res = await subirDocumentoContable(fd);
      if (res.ok) {
        toast.success(`${cat.label}: archivo cargado`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al subir el archivo");
      }
    });
  }

  function descargar(d: DocumentoContable) {
    startDoc(async () => {
      const res = await urlDocumentoContable(d.archivo_path, d.nombre_original);
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "No se pudo descargar.");
    });
  }

  function anular(id: string) {
    if (!window.confirm("¿Quitar este documento del checklist? El archivo queda guardado.")) return;
    startDoc(async () => {
      const res = await anularDocumentoContable(id);
      if (res.ok) {
        toast.success("Documento anulado");
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fila) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return v === null || v === "" ? null : String(v);
    };
    startGuardar(async () => {
      const res = await guardarContabilidad({
        cicloId: fila.ciclo_id,
        clienteId: fila.cliente_id,
        responsableId: get("responsable"),
        kameCierre: get("kame_cierre"),
        fechaCompras: get("fecha_compras"),
        fechaVentas: get("fecha_ventas"),
        fechaConciliacion: get("fecha_conciliacion"),
        observaciones: get("observaciones"),
      });
      if (res.ok) {
        toast.success("Cambios guardados");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function onRegistrarIva() {
    if (!fila) return;
    const obs = obsIva.trim();
    startIva(async () => {
      const res = await registrarCambioIva(fila.cliente_id, obs || null);
      if (res.ok) {
        toast.success("Cambio IVA registrado");
        setObsIva("");
        router.refresh();
      } else toast.error(res.error ?? "Error al registrar");
    });
  }

  function onEliminarIva(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    startIva(async () => {
      const res = await eliminarCambioIva(id);
      if (res.ok) {
        toast.success("Registro eliminado");
        router.refresh();
      } else toast.error(res.error ?? "Error al eliminar");
    });
  }

  const respDefault = usuarios.find((u) => u.nombre === fila.responsable)?.id ?? "";
  const anio = Number(periodo.slice(0, 4));
  const totalGastosAnio = gastosMenores
    .filter((g) => g.tipo === "compra")
    .reduce((a, g) => a + g.monto, 0);
  const totalVentasAnio = gastosMenores
    .filter((g) => g.tipo === "venta")
    .reduce((a, g) => a + g.monto, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1"
            render={<Link href={`/contabilidad?periodo=${periodo}`} />}
          >
            <ArrowLeft className="size-4" />
            Volver a Contabilidad mensual
          </Button>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {fila.razon_social}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {fila.rut_empresa ? <span>RUT {fila.rut_empresa}</span> : null}
            <Badge variant="outline" className={claseEstado(fila.estado)}>
              {fila.estado}
            </Badge>
            {fila.kame_cert_estado ? (
              <Badge
                variant="outline"
                className={
                  fila.kame_cert_estado === "ON"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }
              >
                KAME {fila.kame_cert_estado}
              </Badge>
            ) : null}
            {fila.es_profesional_salud ? (
              <Badge
                variant="outline"
                className="border-pink-200 bg-pink-50 text-pink-700"
              >
                Profesional de salud
              </Badge>
            ) : null}
            <span>
              Responsable: {fila.responsable ?? "sin asignar"}
            </span>
          </p>
        </div>
        <select
          aria-label="Período"
          className={selectCls}
          value={periodo}
          onChange={(e) =>
            router.push(`/contabilidad/${fila.cliente_id}?periodo=${e.target.value}`)
          }
        >
          {opcionesPeriodo().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Contabilidad completa: acceso a los libros RCV ── */}
      {contabilidadCompleta ? (
        <Link
          href={`/contabilidad/${fila.cliente_id}/rcv?periodo=${periodo}`}
          className="card-soft flex items-center justify-between rounded-xl border-l-4 border-l-primary bg-card px-4 py-3 transition-colors hover:bg-muted/40"
        >
          <div>
            <p className="text-sm font-semibold">
              Libros de compras y ventas (contabilidad completa)
            </p>
            <p className="text-xs text-muted-foreground">
              Importar los CSV del RCV del SII, asignar cuentas de gasto y %
              pagado, y validar contra el F29 del período.
            </p>
          </div>
          <span className="text-sm font-medium text-primary">Abrir →</span>
        </Link>
      ) : null}

      {/* ── Casillas de documentos ── */}
      <div>
        <h2 className="mb-2 font-heading text-sm font-semibold">
          Documentos de {etiquetaPeriodo(periodo)}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIAS_DOCUMENTO.map((cat) => (
            <CasillaCategoria
              key={cat.value}
              cat={cat}
              docs={docsDe(cat.value)}
              ocupado={docPendiente}
              onSubir={subir}
              onDescargar={descargar}
              onAnular={anular}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Al subir facturas de compras o ventas se marca solo el hito de
          descarga del mes. Los archivos anulados no se borran de Storage.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Ciclo del mes ── */}
        <div className="card-soft rounded-xl bg-card p-4">
          <h2 className="mb-3 font-heading text-sm font-semibold">
            Ciclo del mes
          </h2>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsable">Responsable del mes</Label>
              <select
                id="responsable"
                name="responsable"
                className={selectCls}
                defaultValue={respDefault}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kame_cierre">KAME al cierre del mes</Label>
              <select
                id="kame_cierre"
                name="kame_cierre"
                className={selectCls}
                defaultValue={fila.kame_cert_estado_al_cierre ?? ""}
              >
                <option value="">— No revisado aún —</option>
                <option value="ON">ON (funciona OK)</option>
                <option value="OFF">OFF (hay problemas)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha_compras">Compras descargadas SII</Label>
              <Input
                id="fecha_compras"
                name="fecha_compras"
                type="date"
                defaultValue={fila.fecha_compras_descargadas ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha_ventas">Ventas descargadas SII</Label>
              <Input
                id="fecha_ventas"
                name="fecha_ventas"
                type="date"
                defaultValue={fila.fecha_ventas_descargadas ?? ""}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="fecha_conciliacion">Conciliación KAME OK</Label>
              <Input
                id="fecha_conciliacion"
                name="fecha_conciliacion"
                type="date"
                defaultValue={fila.fecha_conciliacion_kame_ok ?? ""}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                name="observaciones"
                rows={2}
                defaultValue={fila.observaciones ?? ""}
              />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          {/* ── IVA salud ── */}
          {fila.es_profesional_salud ? (
            <div className="rounded-xl border border-pink-200 bg-pink-50/60 p-4">
              <div className="text-xs font-semibold tracking-wide text-pink-700 uppercase">
                Cambios IVA recuperable → no recuperable (este período)
              </div>
              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                {ivaEjecuciones.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Sin cambios registrados este período.
                  </p>
                ) : (
                  ivaEjecuciones.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start justify-between rounded-md bg-card px-2.5 py-1.5 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {formatFecha(e.fecha_ejecutada)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {e.responsable_nombre ?? "Sin responsable"}
                        </span>
                        {e.observaciones ? (
                          <p className="text-xs text-muted-foreground">
                            {e.observaciones}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onEliminarIva(e.id)}
                        className="ml-2 shrink-0 rounded p-0.5 text-red-600 hover:bg-red-50"
                        title="Eliminar registro"
                        disabled={ivaPendiente}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Observación (opcional)"
                  className="h-8 bg-card text-sm"
                  value={obsIva}
                  onChange={(e) => setObsIva(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 bg-pink-700 hover:bg-pink-800"
                  onClick={onRegistrarIva}
                  disabled={ivaPendiente}
                >
                  <Plus className="size-4" />
                  Registrar cambio
                </Button>
              </div>
            </div>
          ) : null}

          {/* ── Gastos menores del portal (Operación Renta) ── */}
          <div className="card-soft rounded-xl bg-card p-4">
            <h2 className="font-heading text-sm font-semibold">
              Gastos e ingresos menores {anio} (portal del cliente)
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Compras y ventas con boleta que el cliente registra desde su
              portal. No alimentan el SII mensual — se usan en la Operación
              Renta.
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <span>
                Gastos {anio}:{" "}
                <strong className="tabular-nums">{formatMonto(totalGastosAnio)}</strong>
              </span>
              <span>
                Ingresos {anio}:{" "}
                <strong className="tabular-nums">{formatMonto(totalVentasAnio)}</strong>
              </span>
            </div>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {gastosMenores.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  El cliente aún no registra movimientos este año.
                </p>
              ) : (
                gastosMenores.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          g.tipo === "compra"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }
                      >
                        {g.tipo === "compra" ? "Gasto" : "Ingreso"}
                      </Badge>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatFecha(g.fecha)}
                      </span>
                      <span className="truncate" title={g.descripcion}>
                        {g.descripcion}
                      </span>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMonto(g.monto)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
