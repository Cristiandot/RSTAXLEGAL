"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, CalendarPlus, ClipboardList, FileDown, Pencil, Plus, RefreshCw, Search, Award } from "lucide-react";
import { formatFecha } from "@/lib/format";
import {
  calcularDiasHabilesRB,
  desgloseATexto,
  formatDias,
  redondear2,
  sugerirDesglose,
  PERIODO_PROGRESIVOS,
  PERIODOS_BASE,
  TIPOS_ASISTENCIA,
  TIPOS_PERMISO,
  type DocumentoRow,
  type SaldoTrabajador,
} from "@/lib/vacaciones-control";
import {
  agregarAsistencia,
  ajustarSaldo,
  anularDocumento,
  descargarPdf,
  emitirPapeleta,
  emitirPermiso,
  emitirReconocimiento,
  regenerarPdf,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type AsistenciaRow = {
  id: string;
  trabajadorNombre: string;
  trabajadorRut: string | null;
  sucursal: string | null;
  fecha: string | null;
  tipo: string;
  cantidad: number;
  unidad: string;
  cierreNubox: string | null;
  convertidaA: string | null;
  observacion: string | null;
};

type AnticipoRow = {
  id: string;
  trabajador: string;
  periodo: string;
  diasAnticipados: number;
  proximoAniversario: string | null;
  diasASumar: number | null;
  estado: string;
  notas: string | null;
};

type Props = {
  cliente: { id: string; razon_social: string; rut_empresa: string };
  trabajadores: SaldoTrabajador[];
  documentos: DocumentoRow[];
  correlativos: Record<string, number>;
  asistencia: AsistenciaRow[];
  anticipos: AnticipoRow[];
};

const hoyIso = () => new Date().toISOString().slice(0, 10);

function correlativoFmt(tipo: string, n: number | undefined): string {
  return n ? `${tipo}-${String(n).padStart(4, "0")}` : "—";
}

function claseTipoDoc(tipo: string): string {
  switch (tipo) {
    case "PAP":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "PER":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

export function ControlClient({ cliente, trabajadores, documentos, correlativos, asistencia, anticipos }: Props) {
  const [tab, setTab] = useState<"saldos" | "documentos" | "asistencia" | "anticipos">("saldos");
  const [pending, startTransition] = useTransition();

  // ---- diálogos ----
  const [dialogo, setDialogo] = useState<
    | { tipo: "PAP" | "PER" | "REC" | "ajuste"; trab: SaldoTrabajador }
    | { tipo: "anular"; doc: DocumentoRow }
    | { tipo: "asistencia" }
    | null
  >(null);

  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);

  // Períodos visibles en la grilla: los que tienen algún saldo distinto de cero
  const periodosVisibles = useMemo(() => {
    const conSaldo = new Set<string>(["2024-2025", "2025-2026"]);
    for (const t of trabajadores) {
      for (const [per, dias] of Object.entries(t.saldos)) {
        if (per !== PERIODO_PROGRESIVOS && dias !== 0) conSaldo.add(per);
      }
    }
    return PERIODOS_BASE.filter((p) => conSaldo.has(p));
  }, [trabajadores]);

  const totalDias = useMemo(() => redondear2(trabajadores.reduce((a, t) => a + t.total, 0)), [trabajadores]);
  const vigentes = useMemo(() => documentos.filter((d) => d.estado === "vigente").length, [documentos]);

  // ---- filtros saldos ----
  const [buscar, setBuscar] = useState("");
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return activos.filter(
      (t) => !q || t.nombre.toLowerCase().includes(q) || t.rut.toLowerCase().includes(q) || t.sucursal.toLowerCase().includes(q),
    );
  }, [activos, buscar]);

  const porSucursal = useMemo(() => {
    const m = new Map<string, SaldoTrabajador[]>();
    for (const t of filtrados) {
      const arr = m.get(t.sucursal) ?? [];
      arr.push(t);
      m.set(t.sucursal, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtrados]);

  // ---- filtros documentos ----
  const [fTipo, setFTipo] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [buscarDoc, setBuscarDoc] = useState("");
  const docsFiltrados = useMemo(() => {
    const q = buscarDoc.trim().toLowerCase();
    return documentos.filter(
      (d) =>
        (!fTipo || d.tipo === fTipo) &&
        (!fEstado || d.estado === fEstado) &&
        (!q || d.trabajadorNombre.toLowerCase().includes(q) || d.trabajadorRut.toLowerCase().includes(q) || d.correlativo.toLowerCase().includes(q)),
    );
  }, [documentos, fTipo, fEstado, buscarDoc]);

  function abrirPdf(doc: DocumentoRow) {
    startTransition(async () => {
      const res = await descargarPdf(doc.id);
      if (res.ok && res.downloadUrl) window.open(res.downloadUrl, "_blank");
      else toast.error(res.error ?? "No se pudo descargar el PDF.");
    });
  }

  function regenerar(doc: DocumentoRow) {
    startTransition(async () => {
      const res = await regenerarPdf(doc.id);
      if (res.ok && res.downloadUrl) {
        toast.success(`PDF de ${doc.correlativo} regenerado.`);
        window.open(res.downloadUrl, "_blank");
      } else toast.error(res.error === "excel" ? "Los PDF históricos del Excel viven en OneDrive." : (res.error ?? "Falló la regeneración."));
    });
  }

  const tabBtn = (id: typeof tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Control de vacaciones — {cliente.razon_social}</h1>
        <p className="text-sm text-muted-foreground">
          Saldos de feriado legal, papeletas (PAP), permisos (PER) y reconocimientos de progresivos (REC).
          Migrado del Excel maestro el 08-07-2026; esta grilla es la fuente única de verdad.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Trabajadores activos</p>
          <p className="text-2xl font-semibold">{activos.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Días de feriado acumulados</p>
          <p className="text-2xl font-semibold">{formatDias(totalDias)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Próximos correlativos</p>
          <p className="text-sm font-semibold leading-6">
            {correlativoFmt("PAP", correlativos.PAP)} · {correlativoFmt("PER", correlativos.PER)} · {correlativoFmt("REC", correlativos.REC)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Documentos vigentes / total</p>
          <p className="text-2xl font-semibold">{vigentes} <span className="text-sm font-normal text-muted-foreground">/ {documentos.length}</span></p>
        </CardContent></Card>
      </div>

      <div className="flex w-fit gap-1 rounded-lg border bg-card p-1">
        {tabBtn("saldos", "Saldos", <ClipboardList className="h-4 w-4" />)}
        {tabBtn("documentos", "Documentos", <FileDown className="h-4 w-4" />)}
        {tabBtn("asistencia", "Asistencia", <CalendarPlus className="h-4 w-4" />)}
        {tabBtn("anticipos", "Anticipos", <Award className="h-4 w-4" />)}
      </div>

      {tab === "saldos" && (
        <div className="space-y-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, RUT o sucursal…" value={buscar} onChange={(e) => setBuscar(e.target.value)} className="pl-8" />
          </div>
          {porSucursal.map(([sucursal, lista]) => (
            <div key={sucursal} className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="min-w-[220px] font-semibold text-foreground">
                      {sucursal} <span className="font-normal text-muted-foreground">({lista.length})</span>
                    </TableHead>
                    <TableHead>RUT</TableHead>
                    <TableHead>Ingreso</TableHead>
                    {periodosVisibles.map((p) => (
                      <TableHead key={p} className="text-right whitespace-nowrap">{p}</TableHead>
                    ))}
                    <TableHead className="text-right">Progr.</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((t) => (
                    <TableRow key={t.trabajadorId}>
                      <TableCell className="font-medium">{t.nombre}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{t.rut}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatFecha(t.fechaIngreso)}</TableCell>
                      {periodosVisibles.map((p) => {
                        const v = t.saldos[p] ?? 0;
                        return (
                          <TableCell key={p} className={`text-right tabular-nums ${v < 0 ? "font-semibold text-red-600" : v === 0 ? "text-muted-foreground/50" : ""}`}>
                            {v === 0 ? "·" : formatDias(v)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right tabular-nums">
                        {(t.saldos[PERIODO_PROGRESIVOS] ?? 0) === 0 ? <span className="text-muted-foreground/50">·</span> : formatDias(t.saldos[PERIODO_PROGRESIVOS])}
                      </TableCell>
                      <TableCell className={`text-right font-semibold tabular-nums ${t.total < 0 ? "text-red-600" : ""}`}>{formatDias(redondear2(t.total))}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDialogo({ tipo: "PAP", trab: t })}>PAP</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDialogo({ tipo: "PER", trab: t })}>PER</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setDialogo({ tipo: "REC", trab: t })}>REC</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Ajustar saldo" onClick={() => setDialogo({ tipo: "ajuste", trab: t })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}

      {tab === "documentos" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Correlativo, trabajador o RUT…" value={buscarDoc} onChange={(e) => setBuscarDoc(e.target.value)} className="pl-8" />
            </div>
            <select className={`${selectCls} w-36`} value={fTipo} onChange={(e) => setFTipo(e.target.value)} aria-label="Tipo">
              <option value="">Todos los tipos</option>
              <option value="PAP">PAP — Vacaciones</option>
              <option value="PER">PER — Permisos</option>
              <option value="REC">REC — Reconocim.</option>
            </select>
            <select className={`${selectCls} w-32`} value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Estado">
              <option value="">Todos</option>
              <option value="vigente">Vigentes</option>
              <option value="anulado">Anulados</option>
            </select>
            <span className="text-sm text-muted-foreground">{docsFiltrados.length} documentos</span>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Emisión</TableHead>
                  <TableHead>Trabajador</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Días / Cant.</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docsFiltrados.map((d) => (
                  <TableRow key={d.id} className={d.estado === "anulado" ? "opacity-55" : ""}>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={claseTipoDoc(d.tipo)}>{d.correlativo}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatFecha(d.fechaEmision)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{d.trabajadorNombre}</p>
                      <p className="text-xs text-muted-foreground">{d.trabajadorRut}{d.sucursal ? ` · ${d.sucursal}` : ""}</p>
                    </TableCell>
                    <TableCell className="max-w-[340px]">
                      {d.tipo === "PER" ? (
                        <p className="text-sm">{d.permisoTipo ?? "Permiso"} <span className="text-muted-foreground">({d.conGoce ? "con goce" : "sin goce"})</span></p>
                      ) : (
                        <p className="text-sm">{d.desgloseTexto ?? d.respaldo ?? "—"}</p>
                      )}
                      {(d.fechaDesde || d.fechaHasta) && (
                        <p className="text-xs text-muted-foreground">{formatFecha(d.fechaDesde)} → {formatFecha(d.fechaHasta)}</p>
                      )}
                      {d.estado === "anulado" && (
                        <p className="text-xs text-red-600">{d.anulacionMotivo ?? "Anulado"}{d.reemplazadoPor ? ` · Reemplazado por ${d.reemplazadoPor}` : ""}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.tipo === "PER" ? (d.cantidad !== null ? `${formatDias(d.cantidad)} ${d.unidad === "Horas" ? "hrs" : "días"}` : "—") : d.dias !== null ? formatDias(d.dias) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {d.saldoAnterior !== null ? `${formatDias(d.saldoAnterior)} → ${formatDias(d.saldoFinal ?? 0)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={d.estado === "vigente" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}>
                        {d.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" title={d.origen === "excel" && !d.pdfPath ? "PDF histórico en OneDrive" : "Descargar PDF"} disabled={pending} onClick={() => abrirPdf(d)}>
                          <FileDown className="h-3.5 w-3.5" />
                        </Button>
                        {d.origen === "panel" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Regenerar PDF" disabled={pending} onClick={() => regenerar(d)}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {d.estado === "vigente" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700" title="Anular" onClick={() => setDialogo({ tipo: "anular", doc: d })}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {tab === "asistencia" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Inasistencias, atrasos y licencias. Los eventos convertidos a PER/PAP descuentan una sola vez, por el documento formal.
            </p>
            <Button size="sm" onClick={() => setDialogo({ tipo: "asistencia" })}>
              <Plus className="mr-1 h-4 w-4" /> Agregar evento
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Trabajador</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Cierre Nubox</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {asistencia.map((a) => (
                  <TableRow key={a.id} className={a.convertidaA ? "opacity-55" : ""}>
                    <TableCell className="whitespace-nowrap">{a.fecha ? formatFecha(a.fecha) : "por confirmar"}</TableCell>
                    <TableCell>
                      <p className="font-medium">{a.trabajadorNombre}</p>
                      <p className="text-xs text-muted-foreground">{a.trabajadorRut}{a.sucursal ? ` · ${a.sucursal}` : ""}</p>
                    </TableCell>
                    <TableCell>{a.tipo}{a.convertidaA && <Badge variant="outline" className="ml-2 border-slate-200 bg-slate-50 text-slate-600">→ {a.convertidaA}</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDias(a.cantidad)} {a.unidad}</TableCell>
                    <TableCell className="text-muted-foreground">{a.cierreNubox ?? "—"}</TableCell>
                    <TableCell className="max-w-[340px] text-xs text-muted-foreground">{a.observacion ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {tab === "anticipos" && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trabajador</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">Días anticipados</TableHead>
                <TableHead>Próx. aniversario</TableHead>
                <TableHead className="text-right">Días a sumar</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {anticipos.map((a) => (
                <TableRow key={a.id} className={a.estado === "regularizado" ? "opacity-55" : ""}>
                  <TableCell className="font-medium">{a.trabajador}</TableCell>
                  <TableCell>{a.periodo}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatDias(a.diasAnticipados)}</TableCell>
                  <TableCell>{formatFecha(a.proximoAniversario)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.diasASumar !== null ? formatDias(a.diasASumar) : "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={a.estado === "pendiente" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {a.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[420px] text-xs text-muted-foreground">{a.notas ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialogo?.tipo === "PAP" && <DialogoPapeleta trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "PER" && <DialogoPermiso trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "REC" && <DialogoReconocimiento trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "ajuste" && <DialogoAjuste clienteId={cliente.id} trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "anular" && <DialogoAnular doc={dialogo.doc} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "asistencia" && <DialogoAsistencia clienteId={cliente.id} trabajadores={activos} onClose={() => setDialogo(null)} />}
    </div>
  );
}

/* ------------------------------ Diálogos ------------------------------ */

function CampoFecha({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function DialogoPapeleta({ trab, onClose }: { trab: SaldoTrabajador; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [fechaEmision, setFechaEmision] = useState(hoyIso());
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [sabado, setSabado] = useState(false);
  const [items, setItems] = useState<Record<string, string>>({});
  const [progPeriodo, setProgPeriodo] = useState("");
  const [obs, setObs] = useState("");
  const [permitirNeg, setPermitirNeg] = useState(false);

  const calc = useMemo(
    () => (desde && hasta ? calcularDiasHabilesRB(desde, hasta, sabado) : null),
    [desde, hasta, sabado],
  );

  const itemsNum = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(items)) {
      const n = Number(v.replace(",", "."));
      if (n > 0) out[k] = redondear2(n);
    }
    return out;
  }, [items]);
  const suma = redondear2(Object.values(itemsNum).reduce((a, b) => a + b, 0));

  const periodosConSaldo = [PERIODO_PROGRESIVOS, ...PERIODOS_BASE].filter(
    (p) => (trab.saldos[p] ?? 0) !== 0 || itemsNum[p],
  );

  function sugerir() {
    if (!calc || calc.dias <= 0) {
      toast.error("Primero ingresa el rango de fechas.");
      return;
    }
    const sug = sugerirDesglose(trab.saldos, calc.dias);
    if (!sug) {
      toast.error(`El saldo total (${formatDias(redondear2(trab.total))}) no alcanza para ${calc.dias} días. Puedes emitir como anticipo autorizando saldo negativo.`);
      return;
    }
    setItems(Object.fromEntries(Object.entries(sug).map(([k, v]) => [k, String(v)])));
  }

  function emitir() {
    startTransition(async () => {
      const res = await emitirPapeleta({
        trabajadorId: trab.trabajadorId,
        fechaEmision,
        fechaDesde: desde,
        fechaHasta: hasta,
        sabadoHabilInicio: sabado,
        items: itemsNum,
        progresivosPeriodo: itemsNum[PERIODO_PROGRESIVOS] ? progPeriodo || undefined : undefined,
        observacion: obs.trim() || undefined,
        permitirNegativo: permitirNeg,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.correlativo} emitida. Saldo ${formatDias(res.saldoAnterior ?? 0)} → ${formatDias(res.saldoFinal ?? 0)}.`);
      if (res.aviso) toast.warning(res.aviso, { duration: 9000 });
      if (res.downloadUrl) window.open(res.downloadUrl, "_blank");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir papeleta de vacaciones</DialogTitle>
          <DialogDescription>
            {trab.nombre} · {trab.rut} · {trab.sucursal} — saldo total {formatDias(redondear2(trab.total))} días
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <CampoFecha label="Fecha emisión" value={fechaEmision} onChange={setFechaEmision} />
            <CampoFecha label="Desde" value={desde} onChange={setDesde} />
            <CampoFecha label="Hasta" value={hasta} onChange={setHasta} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sabado} onChange={(e) => setSabado(e.target.checked)} />
            Sábado inicial/único cuenta como hábil (jornada Lu-Sá)
          </label>
          {calc && (
            <div className="rounded-md border bg-muted/40 p-2 text-sm">
              <b>{calc.dias}</b> días hábiles en el rango
              {calc.feriados.length > 0 && (
                <span className="text-muted-foreground"> · feriados excluidos: {calc.feriados.map((f) => f.nombre).join(", ")}</span>
              )}
              {!calc.cobertura && <p className="text-red-600">⚠ Rango fuera de la tabla de feriados del sistema.</p>}
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Desglose por período (progresivos primero, luego del más antiguo al más nuevo)</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={sugerir}>Sugerir</Button>
            </div>
            {periodosConSaldo.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <span className="w-32 text-sm">{p === PERIODO_PROGRESIVOS ? "Progresivos" : p}</span>
                <span className="w-24 text-xs text-muted-foreground">disp. {formatDias(trab.saldos[p] ?? 0)}</span>
                <Input className="h-8 w-24" inputMode="decimal" value={items[p] ?? ""} onChange={(e) => setItems({ ...items, [p]: e.target.value })} placeholder="0" />
              </div>
            ))}
            {itemsNum[PERIODO_PROGRESIVOS] ? (
              <div className="flex items-center gap-2">
                <span className="w-32 text-sm text-muted-foreground">Imputar prog. a</span>
                <select className={`${selectCls} w-40`} value={progPeriodo} onChange={(e) => setProgPeriodo(e.target.value)}>
                  <option value="">(sin imputación)</option>
                  {PERIODOS_BASE.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            ) : null}
            <p className={`text-sm ${calc && suma !== calc.dias ? "text-red-600" : "text-muted-foreground"}`}>
              Desglose: {formatDias(suma)} días {calc ? `· rango: ${calc.dias} días` : ""}
              {suma > 0 && <span className="block text-xs">{desgloseATexto(itemsNum, progPeriodo || undefined)}</span>}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observación (aparece en el PDF)</label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Vacaciones" />
          </div>
          <label className="flex items-center gap-2 text-sm text-amber-700">
            <input type="checkbox" checked={permitirNeg} onChange={(e) => setPermitirNeg(e.target.checked)} />
            Autorizar saldo negativo (anticipo de feriado — registrar en Anticipos)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={emitir} disabled={pending || !desde || !hasta || suma <= 0}>
            {pending ? "Emitiendo…" : "Emitir papeleta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoPermiso({ trab, onClose }: { trab: SaldoTrabajador; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [fechaEmision, setFechaEmision] = useState(hoyIso());
  const [tipo, setTipo] = useState(TIPOS_PERMISO[0]);
  const [conGoce, setConGoce] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [unidad, setUnidad] = useState<"Días" | "Horas">("Días");
  const [cantidad, setCantidad] = useState("1");
  const [obs, setObs] = useState("");

  function cambiarTipo(t: string) {
    setTipo(t);
    if (t.includes("con goce")) setConGoce(true);
    else if (t.includes("sin goce")) setConGoce(false);
  }

  function emitir() {
    startTransition(async () => {
      const res = await emitirPermiso({
        trabajadorId: trab.trabajadorId,
        fechaEmision,
        permisoTipo: tipo,
        conGoce,
        fechaDesde: desde,
        fechaHasta: hasta || desde,
        unidad,
        cantidad: Number(cantidad.replace(",", ".")),
        observacion: obs.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.correlativo} emitido. Los permisos no descuentan saldo de feriado.`);
      if (res.aviso) toast.warning(res.aviso, { duration: 9000 });
      if (res.downloadUrl) window.open(res.downloadUrl, "_blank");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Emitir permiso</DialogTitle>
          <DialogDescription>{trab.nombre} · {trab.rut} · {trab.sucursal}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de permiso</label>
            <select className={selectCls} value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
              {TIPOS_PERMISO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conGoce} onChange={(e) => setConGoce(e.target.checked)} />
            Con goce de remuneraciones (no se descuenta en la liquidación)
          </label>
          <div className="grid grid-cols-3 gap-3">
            <CampoFecha label="Fecha emisión" value={fechaEmision} onChange={setFechaEmision} />
            <CampoFecha label="Desde" value={desde} onChange={setDesde} />
            <CampoFecha label="Hasta (vacío = mismo día)" value={hasta} onChange={setHasta} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unidad</label>
              <select className={selectCls} value={unidad} onChange={(e) => setUnidad(e.target.value as "Días" | "Horas")}>
                <option value="Días">Días</option>
                <option value="Horas">Horas</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
              <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observación (aparece en el PDF)</label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={emitir} disabled={pending || !desde || !(Number(cantidad.replace(",", ".")) > 0)}>
            {pending ? "Emitiendo…" : "Emitir permiso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoReconocimiento({ trab, onClose }: { trab: SaldoTrabajador; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [fechaEmision, setFechaEmision] = useState(hoyIso());
  const [dias, setDias] = useState("1");
  const [respaldo, setRespaldo] = useState("");
  const [obs, setObs] = useState("");

  function emitir() {
    startTransition(async () => {
      const res = await emitirReconocimiento({
        trabajadorId: trab.trabajadorId,
        fechaEmision,
        dias: Number(dias.replace(",", ".")),
        respaldo: respaldo.trim(),
        observacion: obs.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.correlativo} emitido. Saldo ${formatDias(res.saldoAnterior ?? 0)} → ${formatDias(res.saldoFinal ?? 0)}.`);
      if (res.downloadUrl) window.open(res.downloadUrl, "_blank");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reconocer días progresivos (Art. 68 CT)</DialogTitle>
          <DialogDescription>
            {trab.nombre} · {trab.rut} — progresivos actuales: {formatDias(trab.saldos[PERIODO_PROGRESIVOS] ?? 0)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <CampoFecha label="Fecha emisión" value={fechaEmision} onChange={setFechaEmision} />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Días reconocidos</label>
              <Input inputMode="decimal" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Respaldo documental (certificado AFP)</label>
            <Input value={respaldo} onChange={(e) => setRespaldo(e.target.value)} placeholder="Certificado AFP Cuprum folio … - DD/MM/AAAA" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observación</label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Si el certificado está pendiente, indicar reconocimiento condicional." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={emitir} disabled={pending || !respaldo.trim() || !(Number(dias.replace(",", ".")) > 0)}>
            {pending ? "Emitiendo…" : "Emitir reconocimiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAjuste({ clienteId, trab, onClose }: { clienteId: string; trab: SaldoTrabajador; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [periodo, setPeriodo] = useState("2025-2026");
  const [dias, setDias] = useState("");
  const [motivo, setMotivo] = useState("");

  function guardar() {
    startTransition(async () => {
      const res = await ajustarSaldo({
        clienteId,
        trabajadorId: trab.trabajadorId,
        periodo,
        dias: Number(dias.replace(",", ".")),
        motivo: motivo.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Saldo ${periodo} de ${trab.nombre}: ${res.antes ?? 0} → ${dias}.`);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar saldo</DialogTitle>
          <DialogDescription>
            {trab.nombre} · {trab.rut}. Para devengamientos de aniversario o correcciones — queda en bitácora de ajustes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <select className={selectCls} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                {[...PERIODOS_BASE, PERIODO_PROGRESIVOS].map((p) => (
                  <option key={p} value={p}>{p === PERIODO_PROGRESIVOS ? "Progresivos" : p} (actual: {formatDias(trab.saldos[p] ?? 0)})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nuevo valor (días)</label>
              <Input inputMode="decimal" value={dias} onChange={(e) => setDias(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Motivo (obligatorio)</label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Devengamiento aniversario 02-06-2026 — 15 días período 2025-2026" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={pending || dias === "" || !motivo.trim()}>
            {pending ? "Guardando…" : "Guardar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAnular({ doc, onClose }: { doc: DocumentoRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");

  function anular() {
    startTransition(async () => {
      const res = await anularDocumento(doc.id, motivo.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${doc.correlativo} anulado. El correlativo no se reutiliza.`);
      if (res.aviso) toast.warning(res.aviso, { duration: 10000 });
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anular {doc.correlativo}</DialogTitle>
          <DialogDescription>
            {doc.trabajadorNombre}. El documento queda en la bitácora como ANULADO (nunca se elimina) y,
            si fue emitido desde el panel, se revierte su efecto en los saldos y se re-estampa el PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Motivo de anulación (obligatorio)</label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Fechas erróneas. Reemplazado por PAP-00XX." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={anular} disabled={pending || !motivo.trim()}>
            {pending ? "Anulando…" : "Anular documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoAsistencia({ clienteId, trabajadores, onClose }: { clienteId: string; trabajadores: SaldoTrabajador[]; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [trabajadorId, setTrabajadorId] = useState("");
  const [fecha, setFecha] = useState(hoyIso());
  const [tipo, setTipo] = useState(TIPOS_ASISTENCIA[0]);
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState("día");
  const [cierre, setCierre] = useState("");
  const [obs, setObs] = useState("");

  function guardar() {
    startTransition(async () => {
      const res = await agregarAsistencia({
        clienteId,
        trabajadorId,
        fecha,
        tipo,
        cantidad: Number(cantidad.replace(",", ".")),
        unidad,
        cierreNubox: cierre.trim() || undefined,
        observacion: obs.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Evento de asistencia registrado.");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar evento de asistencia</DialogTitle>
          <DialogDescription>Inasistencia, atraso, descuento horario o licencia médica.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Trabajador</label>
            <select className={selectCls} value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
              <option value="">Elegir trabajador…</option>
              {trabajadores.map((t) => (
                <option key={t.trabajadorId} value={t.trabajadorId}>{t.nombre} — {t.sucursal}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CampoFecha label="Fecha del evento" value={fecha} onChange={setFecha} />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Tipo</label>
              <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_ASISTENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cantidad</label>
              <Input inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Unidad</label>
              <select className={selectCls} value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                <option value="día">día(s)</option>
                <option value="horas">horas</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Cierre Nubox</label>
              <Input value={cierre} onChange={(e) => setCierre(e.target.value)} placeholder="Julio 2026" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Observación</label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={pending || !trabajadorId || !fecha}>
            {pending ? "Guardando…" : "Registrar evento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
