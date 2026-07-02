"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Calculator, CheckCircle2, Download, FileSpreadsheet, FileText, Landmark, Mail, Search, Send, Trash2 } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import {
  diasParaLimite,
  plazoArt177,
  textoCorreoFiniquito,
  type ResumenCorreo,
} from "@/lib/finiquito-correo";
import { descargarFiniquito, eliminarSolicitudFiniquito, exportarCsvDt, guardarDatosPago } from "./actions";
import { BANCOS_DT, TIPOS_CUENTA_DT } from "@/lib/dt-finiquitos";
import { cambiarEstadoGestion } from "../gestiones/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type FiniquitoRow = {
  id: string;
  trabajador: string;
  rut: string;
  empresa: string;
  causal: string; // valor del portal (renuncia, necesidades_empresa…)
  fechaTermino: string | null;
  estado: string;
  totalCalculado: number | null;
  calculadoEn: string | null;
  resumen: ResumenCorreo | null;
  pago: { correo: string; banco: string; tipoCuenta: string; numeroCuenta: string };
  documentoPath: string | null;
  creada: string;
};

/** Badge del plazo Art. 177 (10 días hábiles desde la separación). */
function PlazoBadge({ f }: { f: FiniquitoRow }) {
  if (!f.fechaTermino) return <span className="text-muted-foreground">—</span>;
  if (f.estado === "enviada") {
    return (
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
        <CheckCircle2 className="size-3" /> Gestionado
      </Badge>
    );
  }
  const plazo = plazoArt177(f.fechaTermino);
  if (!plazo) return <span className="text-muted-foreground">—</span>;
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = diasParaLimite(plazo.fechaLimite, hoy);
  const clase =
    dias < 0
      ? "border-red-300 bg-red-100 text-red-800"
      : dias <= 2
        ? "border-red-200 bg-red-50 text-red-700"
        : dias <= 5
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  const texto =
    dias < 0
      ? `VENCIDO hace ${-dias} día${dias === -1 ? "" : "s"}`
      : dias === 0
        ? "VENCE HOY"
        : `quedan ${dias} día${dias === 1 ? "" : "s"}`;
  return (
    <Badge
      variant="outline"
      className={clase}
      title={`Suscribir y pagar a más tardar el ${formatFecha(plazo.fechaLimite)} (Art. 177 CT — 10 días hábiles desde la separación)`}
    >
      {formatFecha(plazo.fechaLimite)} · {texto}
    </Badge>
  );
}

const CAUSAL_PORTAL_LABEL: Record<string, string> = {
  renuncia: "Renuncia (159 N°2)",
  mutuo_acuerdo: "Mutuo acuerdo (159 N°1)",
  vencimiento_plazo: "Vencimiento plazo (159 N°4)",
  conclusion_obra: "Conclusión obra (159 N°5)",
  necesidades_empresa: "Necesidades empresa (161)",
  conducta: "Conducta (160)",
  no_seguro: "Por definir",
};

/** Causales del portal cuyo despido lleva carta de aviso del Art. 162. */
const CAUSAL_PORTAL_CON_CARTA = new Set([
  "necesidades_empresa",
  "conducta",
  "vencimiento_plazo",
  "conclusion_obra",
]);

function claseEstado(estado: string): string {
  switch (estado) {
    case "enviada":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "aprobada":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "rechazada":
      return "border-red-200 bg-red-50 text-red-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

export function FiniquitosClient({
  filas,
  esAdmin,
  errorCarga,
}: {
  filas: FiniquitoRow[];
  esAdmin: boolean;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [borrando, setBorrando] = useState<FiniquitoRow | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [ocupado, startBorrar] = useTransition();
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [faltantesDt, setFaltantesDt] = useState<
    { trabajador: string; campos: string[] }[] | null
  >(null);
  const [advertenciasDt, setAdvertenciasDt] = useState<string[]>([]);

  // ── Edición rápida de datos de pago (banco/cuenta/correo) ──
  const [editandoPago, setEditandoPago] = useState<FiniquitoRow | null>(null);
  const [pago, setPago] = useState({ correo: "", banco: "", tipoCuenta: "", numeroCuenta: "" });
  const [guardandoPago, startPago] = useTransition();

  function abrirPago(f: FiniquitoRow) {
    const canon = (v: string, ops: string[]) =>
      ops.find((o) => o.toUpperCase() === v.trim().toUpperCase()) ?? v;
    setPago({
      correo: f.pago.correo,
      banco: canon(f.pago.banco, Object.values(BANCOS_DT)),
      tipoCuenta: canon(f.pago.tipoCuenta, Object.values(TIPOS_CUENTA_DT)),
      numeroCuenta: f.pago.numeroCuenta,
    });
    setEditandoPago(f);
  }

  function guardarPago() {
    if (!editandoPago) return;
    const id = editandoPago.id;
    startPago(async () => {
      const res = await guardarDatosPago(id, pago);
      if (res.ok) {
        toast.success("Datos de pago guardados");
        setEditandoPago(null);
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }
  const [exportando, startExportar] = useTransition();
  const [descargando, startDescargar] = useTransition();

  function descargarDoc(f: FiniquitoRow) {
    startDescargar(async () => {
      const res = await descargarFiniquito(f.id);
      if (!res.ok || !res.downloadUrl) {
        toast.error(res.error ?? "No se pudo descargar el documento.");
        return;
      }
      const a = document.createElement("a");
      a.href = res.downloadUrl;
      a.download = res.nombreArchivo ?? "finiquito.docx";
      a.click();
    });
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function exportarDt(ids: string[]) {
    startExportar(async () => {
      const res = await exportarCsvDt(ids);
      if (!res.ok || !res.csv) {
        toast.error(res.error ?? "No se pudo exportar.");
        return;
      }
      // sin BOM: el validador de la DT lo lee pegado a "RutEmpresa" y rechaza la columna
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.nombreArchivo ?? "PlantillaCargaFiniquitos.csv";
      a.click();
      URL.revokeObjectURL(url);
      const advertencias = res.advertencias ?? [];
      if ((res.faltantes && res.faltantes.length > 0) || advertencias.length > 0) {
        setAdvertenciasDt(advertencias);
        setFaltantesDt(res.faltantes ?? []);
      } else {
        toast.success("CSV DT generado — completo, listo para subir a Mi DT");
      }
    });
  }
  const [avanzando, startAvanzar] = useTransition();

  function copiarCorreo(f: FiniquitoRow) {
    if (!f.resumen) {
      toast.error("Primero calcula el finiquito — el correo incluye el desglose del cálculo.");
      return;
    }
    navigator.clipboard.writeText(
      textoCorreoFiniquito({
        trabajador: f.trabajador,
        rut: f.rut,
        causal: f.causal,
        fechaTermino: f.fechaTermino,
        resumen: f.resumen,
      }),
    );
    toast.success("Correo copiado — pégalo en el mail al cliente");
  }

  function avanzar(f: FiniquitoRow, nuevo: string, etiqueta: string) {
    startAvanzar(async () => {
      const res = await cambiarEstadoGestion(f.id, nuevo);
      if (res.ok) {
        toast.success(etiqueta);
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  const confirmacionOk = confirmacion.trim().toLowerCase() === "borrar";

  function borrar() {
    if (!borrando || !confirmacionOk) return;
    const id = borrando.id;
    startBorrar(async () => {
      const res = await eliminarSolicitudFiniquito(id);
      if (res.ok) {
        toast.success("Solicitud de finiquito eliminada");
        setBorrando(null);
        setConfirmacion("");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo eliminar.");
      }
    });
  }

  const selectCls =
    "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.trabajador} ${f.rut} ${f.empresa}`.toLowerCase().includes(q)) return false;
      if (estadoF && f.estado !== estadoF) return false;
      return true;
    });
  }, [filas, buscar, estadoF]);

  const pendientes = filas.filter((f) => f.estado === "solicitada").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Finiquitos</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes de término que llegan del portal del cliente, con calculadora de
            indemnizaciones y vacaciones según los Indicadores Previred del período.
            {pendientes > 0 ? ` · ${pendientes} pendiente${pendientes > 1 ? "s" : ""} de revisión.` : ""}
          </p>
        </div>
        <Button render={<Link href="/finiquitos/calculadora" />}>
          <Calculator className="size-4" />
          Cálculo libre
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar trabajador, RUT o empresa…"
            className="h-9 w-64 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <select aria-label="Estado" className={selectCls} value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="solicitada">Solicitada</option>
          <option value="aprobada">Aprobada</option>
          <option value="enviada">Enviada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <Button
          variant="outline"
          disabled={seleccionados.size === 0 || exportando}
          onClick={() => exportarDt([...seleccionados])}
          title="Genera el CSV de carga masiva del Finiquito Electrónico (Mi DT) con los seleccionados"
        >
          <FileSpreadsheet className="size-4" />
          {exportando ? "Generando…" : `CSV DT (${seleccionados.size})`}
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length}
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" title="Seleccionar para el CSV DT (requiere cálculo guardado)" />
              <TableHead className="w-[200px]">Trabajador</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead className="w-[200px]">Empresa</TableHead>
              <TableHead>Causal</TableHead>
              <TableHead>Término</TableHead>
              <TableHead>Plazo Art. 177</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total calculado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  Sin solicitudes de finiquito todavía. Llegan solas desde el portal del
                  cliente; también puedes usar el cálculo libre.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={seleccionados.has(f.id)}
                      disabled={f.resumen === null}
                      title={
                        f.resumen === null
                          ? "Primero calcula y guarda el finiquito"
                          : "Incluir en el CSV DT"
                      }
                      onCheckedChange={() => alternarSeleccion(f.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="block max-w-[200px] truncate" title={f.trabajador}>
                      {f.trabajador}
                    </span>
                  </TableCell>
                  <TableCell>{f.rut}</TableCell>
                  <TableCell>
                    <span className="block max-w-[200px] truncate" title={f.empresa}>
                      {f.empresa}
                    </span>
                  </TableCell>
                  <TableCell>{CAUSAL_PORTAL_LABEL[f.causal] ?? f.causal ?? "—"}</TableCell>
                  <TableCell>{formatFecha(f.fechaTermino)}</TableCell>
                  <TableCell><PlazoBadge f={f} /></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(f.estado)}>{f.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.totalCalculado !== null ? (
                      <span title={f.calculadoEn ? `Calculado el ${formatFecha(f.calculadoEn.slice(0, 10))}` : undefined}>
                        {formatMonto(f.totalCalculado)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/finiquitos/calculadora?gestion=${f.id}`} />}
                      >
                        <Calculator className="size-3.5" />
                        {f.totalCalculado !== null ? "Recalcular" : "Calcular"}
                      </Button>
                      {CAUSAL_PORTAL_CON_CARTA.has(f.causal) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          title="Generar la carta de aviso de término (Art. 162) con el cálculo"
                          render={<Link href={`/finiquitos/calculadora?gestion=${f.id}&carta=1`} />}
                        >
                          <FileText className="size-3.5" />
                          Carta aviso
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!f.documentoPath || descargando}
                        title={
                          f.documentoPath
                            ? "Descargar el documento escrito del finiquito (.docx)"
                            : "Aún no hay documento escrito cargado para este finiquito"
                        }
                        onClick={() => descargarDoc(f)}
                      >
                        <Download className="size-3.5" />
                        Documento
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={f.resumen === null || exportando}
                        title={
                          f.resumen === null
                            ? "Primero calcula y guarda el finiquito"
                            : "Descargar el CSV de carga del Finiquito Electrónico (Mi DT) de este finiquito"
                        }
                        onClick={() => exportarDt([f.id])}
                      >
                        <FileSpreadsheet className="size-3.5" />
                        CSV DT
                      </Button>
                      <Button
                        size="sm"
                        variant={f.pago.numeroCuenta && f.pago.banco ? "ghost" : "outline"}
                        className={f.pago.numeroCuenta && f.pago.banco ? "" : "text-amber-700"}
                        title={
                          f.pago.numeroCuenta && f.pago.banco
                            ? `Cuenta: ${f.pago.banco} · ${f.pago.numeroCuenta} — editar datos de pago`
                            : "Faltan datos de pago (banco/cuenta/correo) — la DT los exige para pagar"
                        }
                        onClick={() => abrirPago(f)}
                      >
                        <Landmark className="size-3.5" />
                        Banco
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={f.resumen === null}
                        title={
                          f.resumen === null
                            ? "Primero calcula el finiquito"
                            : "Copiar correo para el cliente con el cálculo"
                        }
                        onClick={() => copiarCorreo(f)}
                      >
                        <Mail className="size-3.5" />
                        Copiar correo
                      </Button>
                      {f.estado === "solicitada" && f.totalCalculado !== null ? (
                        <Button
                          size="sm"
                          disabled={avanzando}
                          onClick={() => avanzar(f, "aprobada", "Finiquito aprobado")}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Aprobar
                        </Button>
                      ) : null}
                      {f.estado === "aprobada" ? (
                        <Button
                          size="sm"
                          disabled={avanzando}
                          onClick={() => avanzar(f, "enviada", "Finiquito marcado como enviado/gestionado")}
                        >
                          <Send className="size-3.5" />
                          Marcar enviado
                        </Button>
                      ) : null}
                      {esAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          title="Eliminar solicitud (solo administradores)"
                          onClick={() => {
                            setConfirmacion("");
                            setBorrando(f);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Flujo: calcular → copiar correo al cliente (con el cálculo y el plazo) →
        aprobar → marcar enviado cuando el finiquito esté suscrito y pagado. El
        plazo del Art. 177 son 10 días hábiles desde la separación (el sábado
        cuenta como hábil para este plazo; solo se excluyen domingos y feriados).
      </p>

      {/* Doble confirmación de borrado: hay que escribir "borrar" */}
      <Dialog
        open={borrando !== null}
        onOpenChange={(o) => {
          if (!o) {
            setBorrando(null);
            setConfirmacion("");
          }
        }}
      >
        {borrando ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Eliminar solicitud de finiquito
              </DialogTitle>
              <DialogDescription>
                {borrando.trabajador} · {borrando.empresa}
                {borrando.fechaTermino ? ` · término ${formatFecha(borrando.fechaTermino)}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Esta acción es definitiva: se borra la solicitud del cliente
                {borrando.totalCalculado !== null
                  ? ` y su cálculo guardado (${formatMonto(borrando.totalCalculado)})`
                  : ""}
                . No se puede deshacer.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmar-borrado">
                Escribe <span className="font-mono font-semibold">borrar</span> para confirmar
              </Label>
              <Input
                id="confirmar-borrado"
                autoFocus
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder="borrar"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBorrando(null);
                  setConfirmacion("");
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!confirmacionOk || ocupado}
                onClick={borrar}
              >
                <Trash2 className="size-4" />
                {ocupado ? "Eliminando…" : "Eliminar definitivamente"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Edición rápida de datos de pago del trabajador */}
      <Dialog open={editandoPago !== null} onOpenChange={(o) => { if (!o) setEditandoPago(null); }}>
        {editandoPago ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Datos de pago — {editandoPago.trabajador}
              </DialogTitle>
              <DialogDescription>
                Cuenta UNIPERSONAL y correo personal del trabajador: los exige la
                DT para pagar el finiquito electrónico vía TGR. Se guardan en la
                ficha del trabajador y los usa el CSV DT.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="pago-correo">Correo personal</Label>
                <Input
                  id="pago-correo"
                  type="email"
                  value={pago.correo}
                  onChange={(e) => setPago({ ...pago, correo: e.target.value })}
                  placeholder="correo@ejemplo.cl"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pago-banco">Banco</Label>
                <select
                  id="pago-banco"
                  className={selectCls}
                  value={pago.banco}
                  onChange={(e) => setPago({ ...pago, banco: e.target.value })}
                >
                  <option value="">— Sin dato —</option>
                  {Object.values(BANCOS_DT).map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pago-tipo">Tipo de cuenta</Label>
                <select
                  id="pago-tipo"
                  className={selectCls}
                  value={pago.tipoCuenta}
                  onChange={(e) => setPago({ ...pago, tipoCuenta: e.target.value })}
                >
                  <option value="">— Sin dato —</option>
                  {Object.values(TIPOS_CUENTA_DT).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="pago-cuenta">N° de cuenta (sin guiones ni espacios)</Label>
                <Input
                  id="pago-cuenta"
                  inputMode="numeric"
                  value={pago.numeroCuenta}
                  onChange={(e) => setPago({ ...pago, numeroCuenta: e.target.value })}
                  placeholder="ej. 20319708"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditandoPago(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={guardarPago} disabled={guardandoPago}>
                <Landmark className="size-4" />
                {guardandoPago ? "Guardando…" : "Guardar datos de pago"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Aviso de campos faltantes en el CSV DT */}
      <Dialog open={faltantesDt !== null} onOpenChange={(o) => { if (!o) setFaltantesDt(null); }}>
        {faltantesDt ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">
                CSV descargado — revisa antes de subir
              </DialogTitle>
              <DialogDescription>
                El archivo se descargó con todo lo que el panel tiene. Antes de
                subirlo a Mi DT considera lo siguiente.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-64 space-y-2 overflow-y-auto text-sm">
              {advertenciasDt.map((a) => (
                <div key={a} className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{a}</span>
                </div>
              ))}
              {faltantesDt.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Campos obligatorios de la DT sin dato — complétalos en el CSV o
                  en la ficha del trabajador y vuelve a exportar:
                </p>
              ) : null}
              {faltantesDt.map((f) => (
                <div key={f.trabajador} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="font-medium text-amber-900">{f.trabajador}</p>
                  <p className="text-xs text-amber-700">{f.campos.join(" · ")}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Datos bancarios: la cuenta debe ser unipersonal, número sin guiones
              ni ceros a la izquierda. La carga masiva acepta máximo 100
              extrabajadores por archivo y demora ~15 minutos en procesar.
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => setFaltantesDt(null)}>
                Entendido
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
