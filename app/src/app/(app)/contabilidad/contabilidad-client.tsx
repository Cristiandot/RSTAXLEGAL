"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, X, Upload, Download, FileSpreadsheet } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { opcionesPeriodo } from "@/lib/periodos";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  claseEstado,
  type ConciliacionRow,
  type IvaEjecucionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  anularDocumentoContable,
  eliminarCambioIva,
  guardarContabilidad,
  registrarCambioIva,
  subirDocumentoContable,
  urlDocumentoContable,
  type CategoriaDocumento,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DocumentoContable = {
  id: string;
  cliente_id: string;
  categoria: "rcv_compras" | "rcv_ventas" | "otro";
  etiqueta: string | null;
  archivo_path: string;
  nombre_original: string;
  tamano_bytes: number | null;
  created_at: string;
  subido_por_nombre: string | null;
};

const ESTADOS = [
  "Sin iniciar",
  "Descargando",
  "Listo para conciliar",
  "Conciliado",
];

const CATEGORIA_LABEL: Record<DocumentoContable["categoria"], string> = {
  rcv_compras: "RCV Compras",
  rcv_ventas: "RCV Ventas",
  otro: "Otro",
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResumenCard({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: number;
  tono?: "ok" | "alerta";
}) {
  const color =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "alerta"
        ? "text-red-600"
        : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${color}`}>{valor}</div>
    </div>
  );
}

function BadgeKame({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-muted-foreground">—</span>;
  return estado === "ON" ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      ON
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
      OFF
    </Badge>
  );
}

/** Celda RCV: archivo cargado (✓) > fecha manual legacy > vacío. */
function CeldaRcv({
  docs,
  fechaManual,
}: {
  docs: DocumentoContable[];
  fechaManual: string | null;
}) {
  if (docs.length > 0) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 text-emerald-700"
        title={docs.map((d) => d.nombre_original).join(", ")}
      >
        ✓ {formatFecha(docs[0].created_at.slice(0, 10))}
        {docs.length > 1 ? ` ×${docs.length}` : ""}
      </Badge>
    );
  }
  if (fechaManual) {
    return (
      <span
        className="text-muted-foreground"
        title="Fecha registrada a mano (sin archivo en el sistema)"
      >
        {formatFecha(fechaManual)} ✎
      </span>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function formatTamano(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContabilidadClient({
  periodo,
  filas,
  usuarios,
  ivaEjecuciones,
  documentos,
  errorCarga,
}: {
  periodo: string;
  filas: ConciliacionRow[];
  usuarios: UsuarioOpcion[];
  ivaEjecuciones: IvaEjecucionRow[];
  documentos: DocumentoContable[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [rcvF, setRcvF] = useState("");
  const [kameF, setKameF] = useState("");
  const [saludF, setSaludF] = useState("");
  const [respF, setRespF] = useState("");
  const [editando, setEditando] = useState<ConciliacionRow | null>(null);
  const [obsIva, setObsIva] = useState("");
  const [categoria, setCategoria] = useState<CategoriaDocumento>("rcv_compras");
  const [etiqueta, setEtiqueta] = useState("");
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [guardando, startGuardar] = useTransition();
  const [ivaPendiente, startIva] = useTransition();
  const [docPendiente, startDoc] = useTransition();

  const [orden, setOrden] = useState<Orden>(null);

  // Documentos agrupados por cliente y categoría
  const docsPorCliente = useMemo(() => {
    const m = new Map<string, DocumentoContable[]>();
    for (const d of documentos) {
      const arr = m.get(d.cliente_id);
      if (arr) arr.push(d);
      else m.set(d.cliente_id, [d]);
    }
    return m;
  }, [documentos]);

  const docsDe = (clienteId: string, cat?: DocumentoContable["categoria"]) => {
    const arr = docsPorCliente.get(clienteId) ?? [];
    return cat ? arr.filter((d) => d.categoria === cat) : arr;
  };

  const rcvCompleto = (clienteId: string) =>
    docsDe(clienteId, "rcv_compras").length > 0 &&
    docsDe(clienteId, "rcv_ventas").length > 0;

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && c.estado !== estadoF) return false;
      if (rcvF === "completo" && !rcvCompleto(c.cliente_id)) return false;
      if (rcvF === "incompleto" && rcvCompleto(c.cliente_id)) return false;
      if (kameF && c.kame_cert_estado !== kameF) return false;
      if (saludF === "si" && !c.es_profesional_salud) return false;
      if (saludF === "no" && c.es_profesional_salud) return false;
      if (respF === "__SIN_ASIGNAR__") {
        if (c.responsable) return false;
      } else if (respF && c.responsable !== respF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: ConciliacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "kame": return c.kame_cert_estado;
        case "salud": return c.es_profesional_salud ? 0 : 1;
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "compras": return docsDe(c.cliente_id, "rcv_compras").length > 0 ? 0 : 1;
        case "ventas": return docsDe(c.cliente_id, "rcv_ventas").length > 0 ? 0 : 1;
        case "docs": return -docsDe(c.cliente_id).length;
        case "iva": return c.es_profesional_salud ? c.iva_salud_ejecuciones : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, buscar, estadoF, rcvF, kameF, saludF, respF, orden, docsPorCliente]);

  const resumen: {
    label: string;
    valor: number;
    tono?: "ok" | "alerta";
  }[] = [
    { label: "Total", valor: filas.length },
    {
      label: "Sin iniciar",
      valor: filas.filter((c) => c.estado === "Sin iniciar").length,
    },
    {
      label: "En curso",
      valor: filas.filter((c) =>
        ["Descargando", "Listo para conciliar"].includes(c.estado),
      ).length,
    },
    {
      label: "RCV completos",
      valor: filas.filter((c) => rcvCompleto(c.cliente_id)).length,
      tono: "ok",
    },
    {
      label: "Conciliados",
      valor: filas.filter((c) => c.estado === "Conciliado").length,
      tono: "ok",
    },
    {
      label: "KAME OFF",
      valor: filas.filter((c) => c.kame_cert_estado === "OFF").length,
      tono: "alerta",
    },
  ];

  const ivaDelEditando = editando
    ? ivaEjecuciones.filter((e) => e.cliente_id === editando.cliente_id)
    : [];
  const docsDelEditando = editando ? docsDe(editando.cliente_id) : [];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return v === null || v === "" ? null : String(v);
    };
    const ciclo = editando;
    startGuardar(async () => {
      const res = await guardarContabilidad({
        cicloId: ciclo.ciclo_id,
        clienteId: ciclo.cliente_id,
        responsableId: get("responsable"),
        kameCierre: get("kame_cierre"),
        fechaCompras: get("fecha_compras"),
        fechaVentas: get("fecha_ventas"),
        fechaConciliacion: get("fecha_conciliacion"),
        observaciones: get("observaciones"),
      });
      if (res.ok) {
        toast.success("Cambios guardados");
        setEditando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function onSubirDocumento(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo || !editando) return;
    if (categoria === "otro" && !etiqueta.trim()) {
      toast.error("Describe qué documento es antes de subirlo.");
      return;
    }
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("clienteId", editando.cliente_id);
    fd.append("cicloId", editando.ciclo_id);
    fd.append("periodo", periodo);
    fd.append("categoria", categoria);
    fd.append("etiqueta", etiqueta.trim());
    startDoc(async () => {
      const res = await subirDocumentoContable(fd);
      if (res.ok) {
        toast.success(`${CATEGORIA_LABEL[categoria]} cargado`);
        setEtiqueta("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al subir el archivo");
      }
    });
  }

  function onDescargar(doc: DocumentoContable) {
    startDoc(async () => {
      const res = await urlDocumentoContable(doc.archivo_path, doc.nombre_original);
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "No se pudo descargar.");
    });
  }

  function onAnular(id: string) {
    if (!window.confirm("¿Quitar este documento del checklist? El archivo queda guardado.")) return;
    startDoc(async () => {
      const res = await anularDocumentoContable(id);
      if (res.ok) {
        toast.success("Documento anulado");
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function onRegistrarIva() {
    if (!editando) return;
    const clienteId = editando.cliente_id;
    const obs = obsIva.trim();
    startIva(async () => {
      const res = await registrarCambioIva(clienteId, obs || null);
      if (res.ok) {
        toast.success("Cambio IVA registrado");
        setObsIva("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al registrar");
      }
    });
  }

  function onEliminarIva(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    startIva(async () => {
      const res = await eliminarCambioIva(id);
      if (res.ok) {
        toast.success("Registro eliminado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  }

  const respDefault = editando
    ? (usuarios.find((u) => u.nombre === editando.responsable)?.id ?? "")
    : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Contabilidad mensual
        </h1>
        <p className="text-sm text-muted-foreground">
          Documentos del SII por empresa (RCV compras/ventas y otros), revisión
          KAME durante la transición y cambios IVA salud.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {resumen.map((r) => (
          <ResumenCard
            key={r.label}
            label={r.label}
            valor={r.valor}
            tono={r.tono}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Período"
          className={selectCls}
          value={periodo}
          onChange={(e) => router.push(`/contabilidad?periodo=${e.target.value}`)}
        >
          {opcionesPeriodo().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o RUT…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>

        <select
          aria-label="RCV"
          className={selectCls}
          value={rcvF}
          onChange={(e) => setRcvF(e.target.value)}
        >
          <option value="">RCV: todos</option>
          <option value="completo">RCV completo (C y V)</option>
          <option value="incompleto">RCV incompleto</option>
        </select>

        <select
          aria-label="Estado"
          className={selectCls}
          value={estadoF}
          onChange={(e) => setEstadoF(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          aria-label="KAME"
          className={selectCls}
          value={kameF}
          onChange={(e) => setKameF(e.target.value)}
        >
          <option value="">KAME: todos</option>
          <option value="ON">KAME ON</option>
          <option value="OFF">KAME OFF</option>
        </select>

        <select
          aria-label="Salud"
          className={selectCls}
          value={saludF}
          onChange={(e) => setSaludF(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="si">Solo Salud (IVA semanal)</option>
          <option value="no">No salud</option>
        </select>

        <select
          aria-label="Responsable"
          className={selectCls}
          value={respF}
          onChange={(e) => setRespF(e.target.value)}
        >
          <option value="">Todos los responsables</option>
          <option value="__SIN_ASIGNAR__">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.nombre}>
              {u.nombre}
            </option>
          ))}
        </select>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} clientes
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[220px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="kame" orden={orden} setOrden={setOrden}>KAME</ThSort>
              <ThSort col="salud" orden={orden} setOrden={setOrden}>Salud</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="compras" orden={orden} setOrden={setOrden}>RCV Compras</ThSort>
              <ThSort col="ventas" orden={orden} setOrden={setOrden}>RCV Ventas</ThSort>
              <ThSort col="docs" orden={orden} setOrden={setOrden} className="text-center">Docs</ThSort>
              <ThSort col="iva" orden={orden} setOrden={setOrden}>IVA cambios</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.ciclo_id}
                  onClick={() => setEditando(c)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[220px] truncate"
                      title={c.razon_social}
                    >
                      {c.razon_social}
                    </span>
                  </TableCell>
                  <TableCell>{c.rut_empresa ?? "—"}</TableCell>
                  <TableCell>
                    <BadgeKame estado={c.kame_cert_estado} />
                  </TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      <Badge
                        variant="outline"
                        className="border-pink-200 bg-pink-50 text-pink-700"
                      >
                        Salud
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.responsable ?? "—"}</TableCell>
                  <TableCell>
                    <CeldaRcv
                      docs={docsDe(c.cliente_id, "rcv_compras")}
                      fechaManual={c.fecha_compras_descargadas}
                    />
                  </TableCell>
                  <TableCell>
                    <CeldaRcv
                      docs={docsDe(c.cliente_id, "rcv_ventas")}
                      fechaManual={c.fecha_ventas_descargadas}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    {docsDe(c.cliente_id).length || "—"}
                  </TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      c.iva_salud_ejecuciones > 0 ? (
                        <span>
                          <strong>{c.iva_salud_ejecuciones}</strong> cambios
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Sin cambios
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        ✓ = archivo cargado en el sistema · ✎ = fecha registrada a mano sin
        archivo (modalidad anterior). Cuando Danilo defina el formato definitivo
        de los RCV, el sistema además leerá los totales de cada archivo.
      </p>

      <Dialog
        open={editando !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditando(null);
            setObsIva("");
            setEtiqueta("");
            setCategoria("rcv_compras");
          }
        }}
      >
        {editando ? (
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editando.razon_social}
              </DialogTitle>
              <DialogDescription>
                {[
                  editando.rut_empresa ? `RUT: ${editando.rut_empresa}` : null,
                  `Período ${editando.periodo}`,
                  `KAME actual: ${editando.kame_cert_estado ?? "—"}`,
                  editando.es_profesional_salud ? "PROFESIONAL DE SALUD" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            {/* ── Documentos del mes ── */}
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Documentos del mes (SII)
              </div>
              <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
                {docsDelEditando.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Sin documentos cargados este período.
                  </p>
                ) : (
                  docsDelEditando.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-card px-2.5 py-1.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                d.categoria === "otro"
                                  ? "border-slate-200 bg-slate-50 text-slate-700"
                                  : "border-sky-200 bg-sky-50 text-sky-700"
                              }
                            >
                              {d.categoria === "otro"
                                ? (d.etiqueta ?? "Otro")
                                : CATEGORIA_LABEL[d.categoria]}
                            </Badge>
                            <span className="truncate font-medium" title={d.nombre_original}>
                              {d.nombre_original}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatFecha(d.created_at.slice(0, 10))}
                            {d.subido_por_nombre ? ` · ${d.subido_por_nombre}` : ""}
                            {d.tamano_bytes ? ` · ${formatTamano(d.tamano_bytes)}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDescargar(d)}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          title="Descargar"
                          disabled={docPendiente}
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onAnular(d.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title="Quitar del checklist (el archivo queda guardado)"
                          disabled={docPendiente}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  aria-label="Categoría del documento"
                  className={`${selectCls} h-8`}
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as CategoriaDocumento)}
                >
                  <option value="rcv_compras">RCV Compras</option>
                  <option value="rcv_ventas">RCV Ventas</option>
                  <option value="otro">Otro documento</option>
                </select>
                {categoria === "otro" ? (
                  <Input
                    placeholder="¿Qué documento es? (ej. boletas honorarios)"
                    className="h-8 w-56 bg-card text-sm"
                    value={etiqueta}
                    onChange={(e) => setEtiqueta(e.target.value)}
                  />
                ) : null}
                <input
                  ref={inputArchivo}
                  type="file"
                  className="hidden"
                  onChange={onSubirDocumento}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => inputArchivo.current?.click()}
                  disabled={docPendiente}
                >
                  <Upload className="size-3.5" />
                  {docPendiente ? "Subiendo…" : "Subir archivo"}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Al subir un RCV se marca solo el hito de descarga del mes (si
                estaba pendiente).
              </p>
            </div>

            <form
              id="form-contabilidad"
              onSubmit={onSubmit}
              className="grid grid-cols-2 gap-3"
            >
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
                  defaultValue={editando.kame_cert_estado_al_cierre ?? ""}
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
                  defaultValue={editando.fecha_compras_descargadas ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_ventas">Ventas descargadas SII</Label>
                <Input
                  id="fecha_ventas"
                  name="fecha_ventas"
                  type="date"
                  defaultValue={editando.fecha_ventas_descargadas ?? ""}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="fecha_conciliacion">Conciliación KAME OK</Label>
                <Input
                  id="fecha_conciliacion"
                  name="fecha_conciliacion"
                  type="date"
                  defaultValue={editando.fecha_conciliacion_kame_ok ?? ""}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  name="observaciones"
                  rows={2}
                  defaultValue={editando.observaciones ?? ""}
                />
              </div>
            </form>

            {editando.es_profesional_salud ? (
              <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-3">
                <div className="text-xs font-semibold tracking-wide text-pink-700 uppercase">
                  Cambios IVA recuperable → no recuperable (este período)
                </div>
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                  {ivaDelEditando.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      Sin cambios registrados este período.
                    </p>
                  ) : (
                    ivaDelEditando.map((e) => (
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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="form-contabilidad"
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
