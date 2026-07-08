"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Ban, CalendarPlus, ClipboardList, Clock4, FileDown, History, Pencil, Plus, RefreshCw, Search, Award } from "lucide-react";
import { formatFecha } from "@/lib/format";
import {
  aniversarioDe,
  calcularDiasHabilesRB,
  desgloseATexto,
  diasCorridosEnVentana,
  fechaEnRango,
  formatDias,
  redondear2,
  sugerirDesglose,
  ventanaCierreNubox,
  ventanaMes,
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
  trabajadorId: string;
  trabajador: string;
  periodo: string;
  diasAnticipados: number;
  proximoAniversario: string | null;
  diasASumar: number | null;
  estado: string;
  notas: string | null;
};

type AjusteRow = {
  trabajadorId: string;
  periodo: string;
  motivo: string;
  fecha: string;
};

type Props = {
  cliente: { id: string; razon_social: string; rut_empresa: string };
  trabajadores: SaldoTrabajador[];
  documentos: DocumentoRow[];
  correlativos: Record<string, number>;
  asistencia: AsistenciaRow[];
  anticipos: AnticipoRow[];
  movilizacion: Record<string, { movilizacion: number | null; colacion: number | null }>;
  ajustes: AjusteRow[];
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

export function ControlClient({ cliente, trabajadores, documentos, correlativos, asistencia, anticipos, movilizacion, ajustes }: Props) {
  const [tab, setTab] = useState<"saldos" | "documentos" | "permisos" | "cierre" | "devengos" | "asistencia" | "anticipos">("saldos");
  const [pending, startTransition] = useTransition();

  // ---- diálogos ----
  const [dialogo, setDialogo] = useState<
    | { tipo: "PAP" | "REC" | "ajuste"; trab: SaldoTrabajador }
    | { tipo: "PER"; trab: SaldoTrabajador | null }
    | { tipo: "historial"; trab: SaldoTrabajador }
    | { tipo: "anular"; doc: DocumentoRow }
    | { tipo: "asistencia" }
    | { tipo: "devengo"; trab: SaldoTrabajador; periodo: string; sugerido: number; aniversario: string; notaAnticipo: string | null }
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

      <div className="flex w-fit flex-wrap gap-1 rounded-lg border bg-card p-1">
        {tabBtn("saldos", "Saldos", <ClipboardList className="h-4 w-4" />)}
        {tabBtn("documentos", "Historial", <History className="h-4 w-4" />)}
        {tabBtn("permisos", "Permisos", <Clock4 className="h-4 w-4" />)}
        {tabBtn("cierre", "Cierre", <CalendarPlus className="h-4 w-4" />)}
        {tabBtn("devengos", "Devengos", <Award className="h-4 w-4" />)}
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
                          <Button size="sm" variant="ghost" className="h-7 px-2" title="Historial de documentos" onClick={() => setDialogo({ tipo: "historial", trab: t })}>
                            <History className="h-3.5 w-3.5" />
                          </Button>
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

      {tab === "permisos" && (
        <TabPermisos
          documentos={documentos}
          pending={pending}
          abrirPdf={abrirPdf}
          onEmitir={() => setDialogo({ tipo: "PER", trab: null })}
          onAnular={(doc) => setDialogo({ tipo: "anular", doc })}
        />
      )}

      {tab === "cierre" && (
        <TabCierre documentos={documentos} asistencia={asistencia} trabajadores={trabajadores} movilizacion={movilizacion} />
      )}

      {tab === "devengos" && (
        <TabDevengos
          trabajadores={activos}
          anticipos={anticipos}
          ajustes={ajustes}
          onDevengar={(trab, periodo, sugerido, aniversario, notaAnticipo) =>
            setDialogo({ tipo: "devengo", trab, periodo, sugerido, aniversario, notaAnticipo })
          }
        />
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
      {dialogo?.tipo === "PER" && <DialogoPermiso trab={dialogo.trab} trabajadores={activos} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "historial" && (
        <DialogoHistorial trab={dialogo.trab} documentos={documentos} pending={pending} abrirPdf={abrirPdf} onClose={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === "REC" && <DialogoReconocimiento trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "ajuste" && <DialogoAjuste clienteId={cliente.id} trab={dialogo.trab} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "anular" && <DialogoAnular doc={dialogo.doc} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "asistencia" && <DialogoAsistencia clienteId={cliente.id} trabajadores={activos} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === "devengo" && (
        <DialogoDevengo
          clienteId={cliente.id}
          trab={dialogo.trab}
          periodo={dialogo.periodo}
          sugerido={dialogo.sugerido}
          aniversario={dialogo.aniversario}
          notaAnticipo={dialogo.notaAnticipo}
          onClose={() => setDialogo(null)}
        />
      )}
    </div>
  );
}

/* -------------------------- Pestaña Permisos --------------------------- */

/** Bitácora de permisos PER (equivalente a la hoja "Permisos" del Excel). */
function TabPermisos({
  documentos,
  pending,
  abrirPdf,
  onEmitir,
  onAnular,
}: {
  documentos: DocumentoRow[];
  pending: boolean;
  abrirPdf: (doc: DocumentoRow) => void;
  onEmitir: () => void;
  onAnular: (doc: DocumentoRow) => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [fGoce, setFGoce] = useState("");
  const [fEstado, setFEstado] = useState("vigente");

  const permisos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return documentos.filter(
      (d) =>
        d.tipo === "PER" &&
        (!fEstado || d.estado === fEstado) &&
        (!fGoce || (fGoce === "con" ? d.conGoce === true : d.conGoce === false)) &&
        (!q || d.trabajadorNombre.toLowerCase().includes(q) || d.trabajadorRut.toLowerCase().includes(q) || d.correlativo.toLowerCase().includes(q)),
    );
  }, [documentos, buscar, fGoce, fEstado]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Correlativo, trabajador o RUT…" value={buscar} onChange={(e) => setBuscar(e.target.value)} className="pl-8" />
        </div>
        <select className={`${selectCls} w-32`} value={fGoce} onChange={(e) => setFGoce(e.target.value)} aria-label="Goce">
          <option value="">Con y sin goce</option>
          <option value="sin">Sin goce</option>
          <option value="con">Con goce</option>
        </select>
        <select className={`${selectCls} w-32`} value={fEstado} onChange={(e) => setFEstado(e.target.value)} aria-label="Estado">
          <option value="vigente">Vigentes</option>
          <option value="anulado">Anulados</option>
          <option value="">Todos</option>
        </select>
        <span className="text-sm text-muted-foreground">{permisos.length} permisos</span>
        <div className="grow" />
        <Button size="sm" onClick={onEmitir}>
          <Plus className="mr-1 h-4 w-4" /> Emitir permiso
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Emisión</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Tipo de permiso</TableHead>
              <TableHead>Goce</TableHead>
              <TableHead>Fecha(s)</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permisos.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">Sin permisos con los filtros actuales.</TableCell></TableRow>
            )}
            {permisos.map((d) => (
              <TableRow key={d.id} className={d.estado === "anulado" ? "opacity-55" : ""}>
                <TableCell><Badge variant="outline" className={claseTipoDoc("PER")}>{d.correlativo}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatFecha(d.fechaEmision)}</TableCell>
                <TableCell>
                  <p className="font-medium">{d.trabajadorNombre}</p>
                  <p className="text-xs text-muted-foreground">{d.trabajadorRut}{d.sucursal ? ` · ${d.sucursal}` : ""}</p>
                </TableCell>
                <TableCell className="max-w-[240px] text-sm">{d.permisoTipo ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={d.conGoce ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                    {d.conGoce ? "Con goce" : "Sin goce"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatFecha(d.fechaDesde)}{d.fechaHasta && d.fechaHasta !== d.fechaDesde ? ` → ${formatFecha(d.fechaHasta)}` : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {d.cantidad !== null ? `${formatDias(d.cantidad)} ${d.unidad === "Horas" ? "hrs" : d.cantidad === 1 ? "día" : "días"}` : "—"}
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
                    {d.estado === "vigente" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700" title="Anular" onClick={() => onAnular(d)}>
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
  );
}

/* --------------------- Pestaña Cierre (regla dual) --------------------- */

/**
 * Detalle de eventos del mes para preparar el cierre de remuneraciones:
 * - Vacaciones (PAP) y licencias médicas → mes calendario natural, con días
 *   corridos para el promedio Art. 71 CT (comisiones / bonos variables).
 * - Permisos sin goce e inasistencias/atrasos → ventana Nubox 21-20.
 * El cálculo del bono proporcional / comisión promedio se hace fuera del
 * panel; esta vista entrega el insumo consolidado.
 */
function TabCierre({
  documentos,
  asistencia,
  trabajadores,
  movilizacion,
}: {
  documentos: DocumentoRow[];
  asistencia: AsistenciaRow[];
  trabajadores: SaldoTrabajador[];
  movilizacion: Record<string, { movilizacion: number | null; colacion: number | null }>;
}) {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const vMes = useMemo(() => ventanaMes(mes), [mes]);
  const vCierre = useMemo(() => ventanaCierreNubox(mes), [mes]);

  // Vacaciones del mes calendario (PAP vigentes que tocan el mes)
  const vacaciones = useMemo(
    () =>
      documentos
        .filter((d) => d.tipo === "PAP" && d.estado === "vigente" && d.fechaDesde && d.fechaHasta)
        .map((d) => ({ ...d, corridos: diasCorridosEnVentana(d.fechaDesde, d.fechaHasta, vMes.desde, vMes.hasta) }))
        .filter((d) => d.corridos > 0)
        .sort((a, b) => a.trabajadorNombre.localeCompare(b.trabajadorNombre)),
    [documentos, vMes],
  );

  // Licencias médicas del mes calendario (desde Asistencia)
  const licencias = useMemo(
    () =>
      asistencia.filter(
        (a) => a.tipo === "Licencia médica" && (a.fecha === null || fechaEnRango(a.fecha, vMes.desde, vMes.hasta)),
      ),
    [asistencia, vMes],
  );

  // Descuentos del cierre Nubox 21-20: permisos sin goce + inasistencias/atrasos
  const permisosSinGoce = useMemo(
    () =>
      documentos
        .filter(
          (d) =>
            d.tipo === "PER" &&
            d.estado === "vigente" &&
            d.conGoce === false &&
            fechaEnRango(d.fechaDesde, vCierre.desde, vCierre.hasta),
        )
        .sort((a, b) => a.trabajadorNombre.localeCompare(b.trabajadorNombre)),
    [documentos, vCierre],
  );
  const inasistencias = useMemo(
    () =>
      asistencia.filter(
        (a) =>
          a.tipo !== "Licencia médica" &&
          !a.convertidaA &&
          fechaEnRango(a.fecha, vCierre.desde, vCierre.hasta),
      ),
    [asistencia, vCierre],
  );

  // Resumen por trabajador (para prorrateo de movilización/colación y bonos)
  const resumen = useMemo(() => {
    const m = new Map<string, { nombre: string; rut: string; vacCorridos: number; sinGoceDias: number; sinGoceHoras: number; ausenciasDias: number; atrasosHoras: number; licencia: boolean }>();
    const fila = (rut: string, nombre: string) => {
      const k = rut || nombre;
      if (!m.has(k)) m.set(k, { nombre, rut, vacCorridos: 0, sinGoceDias: 0, sinGoceHoras: 0, ausenciasDias: 0, atrasosHoras: 0, licencia: false });
      return m.get(k)!;
    };
    for (const v of vacaciones) fila(v.trabajadorRut, v.trabajadorNombre).vacCorridos += v.corridos;
    for (const p of permisosSinGoce) {
      const f = fila(p.trabajadorRut, p.trabajadorNombre);
      if (p.unidad === "Horas") f.sinGoceHoras += p.cantidad ?? 0;
      else f.sinGoceDias += p.cantidad ?? 0;
    }
    for (const a of inasistencias) {
      const f = fila(a.trabajadorRut ?? "", a.trabajadorNombre);
      if (a.unidad === "horas") f.atrasosHoras += a.cantidad;
      else f.ausenciasDias += a.cantidad;
    }
    for (const l of licencias) fila(l.trabajadorRut ?? "", l.trabajadorNombre).licencia = true;
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [vacaciones, permisosSinGoce, inasistencias, licencias]);

  const movDe = (rut: string) => {
    const t = trabajadores.find((x) => x.rut === rut);
    return t ? movilizacion[t.trabajadorId] : undefined;
  };
  const clp = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : "$" + Math.round(n).toLocaleString("es-CL");

  const seccion = (titulo: string, sub: string) => (
    <div className="pt-1">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mes de cierre</label>
          <Input type="month" className="w-44" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        </div>
        <p className="pt-4 text-sm text-muted-foreground">
          Vacaciones y licencias: mes calendario {formatFecha(vMes.desde)} → {formatFecha(vMes.hasta)}.
          Descuentos: cierre Nubox {formatFecha(vCierre.desde)} → {formatFecha(vCierre.hasta)}.
        </p>
      </div>

      {seccion("Vacaciones del mes (Art. 71 CT)", "Días corridos dentro del mes calendario — base para COMISIONES PROM.VAC. / PROM. VACACIONES OBJETIVOS (promedio 3 meses ÷ 30 × días corridos).")}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Rango</TableHead>
              <TableHead className="text-right">Días hábiles</TableHead>
              <TableHead className="text-right">Corridos en el mes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vacaciones.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sin vacaciones en el mes.</TableCell></TableRow>
            )}
            {vacaciones.map((v) => (
              <TableRow key={v.id}>
                <TableCell><Badge variant="outline" className={claseTipoDoc("PAP")}>{v.correlativo}</Badge></TableCell>
                <TableCell className="font-medium">{v.trabajadorNombre}<span className="ml-2 text-xs text-muted-foreground">{v.trabajadorRut}</span></TableCell>
                <TableCell className="whitespace-nowrap">{formatFecha(v.fechaDesde)} → {formatFecha(v.fechaHasta)}</TableCell>
                <TableCell className="text-right tabular-nums">{v.dias !== null ? formatDias(v.dias) : "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{v.corridos}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {seccion("Licencias médicas del mes", "Mes calendario. Recordar: mes con licencia > 15 días se sustituye en el promedio Art. 71 (Dictamen Ord. N° 4081/189, DT, 30-08-2005). SIL por Caja/Isapre.")}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabajador</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Observación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {licencias.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground">Sin licencias registradas en el mes.</TableCell></TableRow>
            )}
            {licencias.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.trabajadorNombre}<span className="ml-2 text-xs text-muted-foreground">{l.trabajadorRut}</span></TableCell>
                <TableCell>{l.fecha ? formatFecha(l.fecha) : "por confirmar"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDias(l.cantidad)} {l.unidad}</TableCell>
                <TableCell className="max-w-[380px] text-xs text-muted-foreground">{l.observacion ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {seccion("Descuentos del cierre Nubox (21 → 20)", "Permisos sin goce e inasistencias/atrasos del ciclo comercial. Los eventos convertidos a PER/PAP se muestran solo por el documento formal (sin doble descuento).")}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origen</TableHead>
              <TableHead>Trabajador</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Fecha(s)</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permisosSinGoce.length === 0 && inasistencias.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Sin descuentos en el cierre.</TableCell></TableRow>
            )}
            {permisosSinGoce.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Badge variant="outline" className={claseTipoDoc("PER")}>{p.correlativo}</Badge></TableCell>
                <TableCell className="font-medium">{p.trabajadorNombre}<span className="ml-2 text-xs text-muted-foreground">{p.trabajadorRut}</span></TableCell>
                <TableCell className="text-sm">{p.permisoTipo}</TableCell>
                <TableCell className="whitespace-nowrap">{formatFecha(p.fechaDesde)}{p.fechaHasta && p.fechaHasta !== p.fechaDesde ? ` → ${formatFecha(p.fechaHasta)}` : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{p.cantidad !== null ? formatDias(p.cantidad) : "—"} {p.unidad === "Horas" ? "hrs" : "días"}</TableCell>
              </TableRow>
            ))}
            {inasistencias.map((a) => (
              <TableRow key={a.id}>
                <TableCell><Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Asistencia</Badge></TableCell>
                <TableCell className="font-medium">{a.trabajadorNombre}<span className="ml-2 text-xs text-muted-foreground">{a.trabajadorRut}</span></TableCell>
                <TableCell className="text-sm">{a.tipo}</TableCell>
                <TableCell className="whitespace-nowrap">{a.fecha ? formatFecha(a.fecha) : "por confirmar"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDias(a.cantidad)} {a.unidad}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {seccion("Resumen por trabajador", "Insumo para prorratear movilización/colación (Art. 41 CT — descontar ausencias, atrasos, licencias y vacaciones) y calcular bonos proporcionales.")}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabajador</TableHead>
              <TableHead className="text-right">Vac. corridos (mes)</TableHead>
              <TableHead className="text-right">Sin goce</TableHead>
              <TableHead className="text-right">Ausencias</TableHead>
              <TableHead className="text-right">Atrasos (hrs)</TableHead>
              <TableHead>Licencia</TableHead>
              <TableHead className="text-right">Movilización 100%</TableHead>
              <TableHead className="text-right">Colación 100%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resumen.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Sin eventos en el período.</TableCell></TableRow>
            )}
            {resumen.map((r) => {
              const mov = movDe(r.rut);
              return (
                <TableRow key={r.rut || r.nombre}>
                  <TableCell className="font-medium">{r.nombre}<span className="ml-2 text-xs text-muted-foreground">{r.rut}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{r.vacCorridos || "·"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sinGoceDias ? `${formatDias(r.sinGoceDias)} d` : ""}{r.sinGoceHoras ? ` ${formatDias(r.sinGoceHoras)} h` : r.sinGoceDias ? "" : "·"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.ausenciasDias ? formatDias(r.ausenciasDias) : "·"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.atrasosHoras ? formatDias(r.atrasosHoras) : "·"}</TableCell>
                  <TableCell>{r.licencia ? <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">SÍ</Badge> : "·"}</TableCell>
                  <TableCell className="text-right tabular-nums">{clp(mov?.movilizacion)}</TableCell>
                  <TableCell className="text-right tabular-nums">{clp(mov?.colacion)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/* ------------------- Pestaña Devengos (aniversarios) ------------------- */

/**
 * Devengamiento del feriado en la fecha de aniversario del contrato: 15 días
 * hábiles del período que se cumple (Art. 67 CT), menos lo ya anticipado
 * (hoja Anticipos). Los progresivos habilitados por trienio también se
 * incorporan al feriado en el aniversario (criterio INICIO RAPIDO sección 3)
 * — esos se ajustan a mano o vía REC según respaldo.
 */
function TabDevengos({
  trabajadores,
  anticipos,
  ajustes,
  onDevengar,
}: {
  trabajadores: SaldoTrabajador[];
  anticipos: AnticipoRow[];
  ajustes: AjusteRow[];
  onDevengar: (trab: SaldoTrabajador, periodo: string, sugerido: number, aniversario: string, notaAnticipo: string | null) => void;
}) {
  const hoy = hoyIso();
  const anioActual = Number(hoy.slice(0, 4));

  const filas = useMemo(() => {
    return trabajadores
      .filter((t) => t.fechaIngreso)
      .map((t) => {
        const a = aniversarioDe(t.fechaIngreso!, anioActual);
        // si el aniversario de este año aún no llega, el pendiente es el de este año;
        // si ya pasó, mostramos el de este año (por devengar) y el próximo es el del año siguiente
        const pasado = a.fecha <= hoy;
        const anticipo = anticipos.find(
          (x) => x.trabajadorId === t.trabajadorId && x.estado === "pendiente" && x.periodo.startsWith(a.periodo),
        );
        // los anticipos de PROGRESIVOS no reducen los 15 días del período normal:
        // se descuentan del devengo de progresivos (la nota del anticipo lo explica)
        const esProgresivo = anticipo?.periodo.toLowerCase().includes("progresiv") ?? false;
        const sugerido = anticipo && !esProgresivo ? (anticipo.diasASumar ?? 15) : 15;
        const devengado = ajustes.some(
          (j) =>
            j.trabajadorId === t.trabajadorId &&
            j.periodo === a.periodo &&
            j.motivo.toLowerCase().startsWith("devengamiento") &&
            j.fecha.slice(0, 10) >= a.fecha,
        );
        return { t, aniversario: a.fecha, periodo: a.periodo, pasado, anticipo, sugerido, devengado };
      })
      .sort((x, y) => {
        // primero los pasados sin devengar (urgentes), luego por cercanía
        const ux = x.pasado && !x.devengado ? 0 : 1;
        const uy = y.pasado && !y.devengado ? 0 : 1;
        if (ux !== uy) return ux - uy;
        return x.aniversario.slice(5).localeCompare(y.aniversario.slice(5));
      });
  }, [trabajadores, anticipos, ajustes, anioActual, hoy]);

  const pendientes = filas.filter((f) => f.pasado && !f.devengado).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        El período se devenga AL CUMPLIRSE el aniversario del contrato (15 días hábiles, menos lo anticipado).
        {pendientes > 0 && <span className="font-medium text-amber-700"> {pendientes} aniversario(s) del año ya cumplidos sin devengo registrado desde el panel — verificar si el saldo ya lo incluye antes de devengar.</span>}
      </p>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trabajador</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Aniversario {anioActual}</TableHead>
              <TableHead>Período que devenga</TableHead>
              <TableHead className="text-right">Saldo actual período</TableHead>
              <TableHead className="text-right">Sugerido a sumar</TableHead>
              <TableHead>Anticipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(({ t, aniversario, periodo, pasado, anticipo, sugerido, devengado }) => (
              <TableRow key={t.trabajadorId} className={pasado && !devengado ? "bg-amber-50/50" : ""}>
                <TableCell className="font-medium">{t.nombre}<span className="ml-2 text-xs text-muted-foreground">{t.sucursal}</span></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatFecha(t.fechaIngreso)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatFecha(aniversario)}</TableCell>
                <TableCell>{periodo}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDias(t.saldos[periodo] ?? 0)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDias(sugerido)}</TableCell>
                <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                  {anticipo ? `${formatDias(anticipo.diasAnticipados)} días anticipados — sumar solo ${formatDias(anticipo.diasASumar ?? 15)}` : "·"}
                </TableCell>
                <TableCell>
                  {devengado ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">devengado</Badge>
                  ) : pasado ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">por devengar</Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">próximo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {!devengado && (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onDevengar(t, periodo, sugerido, aniversario, anticipo?.notas ?? null)}>
                      Devengar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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

function DialogoPermiso({
  trab: trabInicial,
  trabajadores,
  onClose,
}: {
  trab: SaldoTrabajador | null;
  trabajadores: SaldoTrabajador[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [trabajadorId, setTrabajadorId] = useState(trabInicial?.trabajadorId ?? "");
  const trab = trabajadores.find((t) => t.trabajadorId === trabajadorId) ?? trabInicial;
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
    if (!trab) return;
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
          <DialogDescription>
            {trab ? `${trab.nombre} · ${trab.rut} · ${trab.sucursal}` : "Los permisos no descuentan saldo de feriado."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!trabInicial && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Trabajador</label>
              <select className={selectCls} value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
                <option value="">Elegir trabajador…</option>
                {trabajadores.map((t) => (
                  <option key={t.trabajadorId} value={t.trabajadorId}>{t.nombre} — {t.sucursal}</option>
                ))}
              </select>
            </div>
          )}
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
          <Button onClick={emitir} disabled={pending || !trab || !desde || !(Number(cantidad.replace(",", ".")) > 0)}>
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

function DialogoDevengo({
  clienteId,
  trab,
  periodo,
  sugerido,
  aniversario,
  notaAnticipo,
  onClose,
}: {
  clienteId: string;
  trab: SaldoTrabajador;
  periodo: string;
  sugerido: number;
  aniversario: string;
  notaAnticipo: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const actual = trab.saldos[periodo] ?? 0;
  const [sumar, setSumar] = useState(String(sugerido));
  const nuevo = redondear2(actual + Number(sumar.replace(",", ".") || 0));

  function devengar() {
    startTransition(async () => {
      const res = await ajustarSaldo({
        clienteId,
        trabajadorId: trab.trabajadorId,
        periodo,
        dias: nuevo,
        motivo: `Devengamiento aniversario ${fechaClCorta(aniversario)} — período ${periodo}: +${sumar} días (Art. 67 CT)${notaAnticipo ? " [anticipo previo descontado]" : ""}`,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Devengado: ${trab.nombre} período ${periodo} ${formatDias(actual)} → ${formatDias(nuevo)}.`);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Devengar período {periodo}</DialogTitle>
          <DialogDescription>
            {trab.nombre} · aniversario {formatFecha(aniversario)}. Saldo actual del período: {formatDias(actual)} días.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {notaAnticipo && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{notaAnticipo}</p>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Días a sumar (15 estándar, menos lo anticipado)</label>
            <Input inputMode="decimal" value={sumar} onChange={(e) => setSumar(e.target.value)} />
          </div>
          <p className="text-sm">
            Saldo resultante del período: <b>{formatDias(nuevo)}</b> días. Queda registrado en la bitácora de ajustes.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={devengar} disabled={pending || !(Number(sumar.replace(",", ".")) > 0)}>
            {pending ? "Devengando…" : "Devengar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** DD-MM-AAAA corto para motivos de bitácora. */
function fechaClCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** Ficha cronológica de todos los documentos de un trabajador. */
function DialogoHistorial({
  trab,
  documentos,
  pending,
  abrirPdf,
  onClose,
}: {
  trab: SaldoTrabajador;
  documentos: DocumentoRow[];
  pending: boolean;
  abrirPdf: (doc: DocumentoRow) => void;
  onClose: () => void;
}) {
  const rutNorm = trab.rut.replace(/[.\s]/g, "").toUpperCase();
  const docs = useMemo(
    () =>
      documentos
        .filter((d) => d.trabajadorRut.replace(/[.\s]/g, "").toUpperCase() === rutNorm)
        .sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision) || b.correlativo.localeCompare(a.correlativo)),
    [documentos, rutNorm],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial — {trab.nombre}</DialogTitle>
          <DialogDescription>
            {trab.rut} · {trab.sucursal} · ingreso {formatFecha(trab.fechaIngreso)} · saldo total {formatDias(redondear2(trab.total))} días · {docs.length} documento(s)
          </DialogDescription>
        </DialogHeader>
        {docs.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin documentos emitidos.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className={`flex items-start justify-between gap-3 rounded-md border p-2.5 ${d.estado === "anulado" ? "opacity-55" : ""}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={claseTipoDoc(d.tipo)}>{d.correlativo}</Badge>
                    <span className="text-xs text-muted-foreground">{formatFecha(d.fechaEmision)}</span>
                    {d.estado === "anulado" && (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">anulado</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm">
                    {d.tipo === "PER"
                      ? `${d.permisoTipo ?? "Permiso"} (${d.conGoce ? "con goce" : "sin goce"}) — ${d.cantidad !== null ? `${formatDias(d.cantidad)} ${d.unidad === "Horas" ? "hrs" : "día(s)"}` : ""}`
                      : d.tipo === "REC"
                        ? `Reconocimiento de ${d.dias !== null ? formatDias(d.dias) : "?"} días progresivos — ${d.respaldo ?? ""}`
                        : `Vacaciones ${d.dias !== null ? formatDias(d.dias) : "?"} días hábiles — ${d.desgloseTexto ?? ""}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(d.fechaDesde || d.fechaHasta) && <>{formatFecha(d.fechaDesde)} → {formatFecha(d.fechaHasta)} · </>}
                    {d.saldoAnterior !== null && <>saldo {formatDias(d.saldoAnterior)} → {formatDias(d.saldoFinal ?? 0)} · </>}
                    {d.estado === "anulado" ? (d.anulacionMotivo ?? "") : (d.observacion ?? "")}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" title="Descargar PDF" disabled={pending} onClick={() => abrirPdf(d)}>
                  <FileDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
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
