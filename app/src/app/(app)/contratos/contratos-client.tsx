"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Download, FilePlus2, Pencil, Receipt, Search, Send, Trash2 } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { CLASE_FILA_DESTACADA, useGestionUrl } from "@/hooks/use-gestion-url";
import {
  calcularLiquidacionEjemplo,
  type LiquidacionEjemplo,
  type TasaAfpPeriodo,
} from "@/lib/liquidacion-ejemplo";
import {
  actualizarClausulas,
  actualizarAnexoFecha,
  cambiarEstadoContrato,
  eliminarContrato,
  enviarContratoAlCliente,
  generarContrato,
  linkDescargaContrato,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ContratoRow = {
  id: string;
  estado: string;
  tipoDocumento: string;
  anexoTipo: string | null;
  anexoDetalle: string | null;
  anexoFecha: string | null;
  jornadaHoras: number | null;
  clausulasAdicionales: string | null;
  tipoContrato: string;
  cargo: string | null;
  fechaInicio: string | null;
  fechaVencimiento: string | null;
  tieneDocumento: boolean;
  empresa: string;
  trabajador: string;
  rutTrabajador: string;
  creadoPor: string;
  /** Remuneración pactada (jsonb del contrato) — para la liquidación ejemplo. */
  remuneracion?: Record<string, unknown> | null;
  afp?: string | null;
  salud?: string | null;
};

export type IndicadoresLiquidacion = {
  periodo: string;
  imm: number;
  utm: number | null;
  tasasAfp: TasaAfpPeriodo[];
};

const ESTADOS = ["solicitado", "generado", "aprobado", "enviado", "anulado"];

function claseEstadoContrato(estado: string): string {
  switch (estado) {
    case "enviado":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "aprobado":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "generado":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "anulado":
      return "border-red-200 bg-red-50 text-red-600";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ContratosClient({
  filas,
  errorCarga,
  titulo = "Contratos",
  descripcion = "Solicitudes, generación y revisión. Flujo: generado → aprobado → enviado.",
  mostrarHerramientasContrato = true,
  esAdmin = false,
  indicadores = null,
}: {
  filas: ContratoRow[];
  errorCarga: string | null;
  titulo?: string;
  descripcion?: string;
  /** Botón "Contrato nuevo" (solo en el módulo Contratos). */
  mostrarHerramientasContrato?: boolean;
  /** Habilita la eliminación definitiva (doble confirmación, solo admins). */
  esAdmin?: boolean;
  /** Indicadores Previred del período — habilitan "Ver liquidación ejemplo". */
  indicadores?: IndicadoresLiquidacion | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);
  const [ocupado, startAccion] = useTransition();
  // Deep-link desde Inicio y requerimientos: destaca la fila y hace scroll.
  const gestionDestacada = useGestionUrl(filas);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((f) => {
      if (q && !`${f.trabajador} ${f.rutTrabajador} ${f.empresa}`.toLowerCase().includes(q)) return false;
      if (estadoF && f.estado !== estadoF) return false;
      return true;
    });
    // Sin orden manual se conserva el del servidor: más recientes primero.
    if (!orden) return out;
    const valor = (f: ContratoRow): unknown => {
      switch (orden.col) {
        case "trabajador": return f.trabajador;
        case "rut": return f.rutTrabajador;
        case "empresa": return f.empresa;
        case "cargo": return f.cargo;
        // anexos agrupados entre sí; contratos por tipo (plazo fijo/indefinido)
        case "tipo": return f.tipoDocumento === "anexo" ? `anexo ${f.anexoTipo ?? ""}` : f.tipoContrato;
        case "inicio": return f.fechaInicio;
        case "vence": return f.fechaVencimiento;
        case "estado": return f.estado;
        case "creado_por": return f.creadoPor;
        // las acciones disponibles dependen del estado
        case "acciones": return f.estado;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, orden]);

  function avanzar(id: string, nuevo: string) {
    startAccion(async () => {
      const res = await cambiarEstadoContrato(id, nuevo);
      if (res.ok) {
        toast.success(nuevo === "anulado" ? "Contrato anulado" : `Contrato ${nuevo}`);
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function descargar(id: string) {
    startAccion(async () => {
      const res = await linkDescargaContrato(id);
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "Error al descargar");
    });
  }

  function generar(id: string) {
    startAccion(async () => {
      const res = await generarContrato(id);
      if (res.ok) {
        toast.success("Documento generado");
        router.refresh();
      } else toast.error(res.error ?? "Error al generar");
    });
  }

  function guardarAnexoFecha(id: string, fecha: string) {
    startAccion(async () => {
      const res = await actualizarAnexoFecha(id, fecha || null);
      if (res.ok) {
        toast.success("Fecha del anexo guardada");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar la fecha");
    });
  }

  const [editando, setEditando] = useState<ContratoRow | null>(null);
  const [textoClausulas, setTextoClausulas] = useState("");

  function abrirEdicion(f: ContratoRow) {
    setTextoClausulas(f.clausulasAdicionales ?? "");
    setEditando(f);
  }

  function guardarClausulas() {
    if (!editando) return;
    const id = editando.id;
    startAccion(async () => {
      const res = await actualizarClausulas(id, textoClausulas);
      if (res.ok) {
        toast.success("Cláusulas guardadas — regenera el documento para aplicarlas");
        setEditando(null);
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  function enviarAlCliente(f: ContratoRow) {
    if (!window.confirm(`¿Enviar el contrato de ${f.trabajador} al correo asignado de ${f.empresa}?`)) return;
    startAccion(async () => {
      const res = await enviarContratoAlCliente(f.id);
      if (res.ok) {
        toast.success(`Contrato enviado a ${res.enviadoA}`);
        router.refresh();
      } else toast.error(res.error ?? "Error al enviar");
    });
  }

  // Liquidación de ejemplo (mes normal, sin novedades). Para contratos con
  // pago por día, los días del mes simulado son editables (ej. 10 días).
  const [liqDe, setLiqDe] = useState<ContratoRow | null>(null);
  // texto libre para poder borrar y reescribir; el cálculo usa liqDiasNum
  const [liqDias, setLiqDias] = useState("30");
  const liqDiasNum = Math.min(Math.max(Number(liqDias) || 1, 1), 30);
  const esPorDia = (f: ContratoRow | null) =>
    f?.remuneracion?.modalidad === "por_dia" && Number(f.remuneracion?.valor_dia ?? 0) > 0;

  function abrirLiquidacion(f: ContratoRow) {
    setLiqDias("30");
    setLiqDe(f);
  }

  const liq: LiquidacionEjemplo | null = useMemo(() => {
    if (!liqDe || !indicadores) return null;
    const r = liqDe.remuneracion ?? {};
    const porDia = esPorDia(liqDe);
    const sueldo = porDia
      ? Number(r.valor_dia) * liqDiasNum
      : Number(r.sueldo_base ?? 0);
    if (!sueldo) return null;
    return calcularLiquidacionEjemplo({
      sueldoBase: Math.round(sueldo),
      dias: porDia ? liqDiasNum : 30,
      gratificacionTipo: String(r.gratificacion_tipo ?? "25"),
      gratificacionMonto: Number(r.gratificacion_monto ?? 0),
      colacion: Number(r.colacion ?? 0),
      movilizacion: Number(r.movilizacion ?? 0),
      afp: liqDe.afp ?? null,
      salud: liqDe.salud ?? null,
      tipoContrato: liqDe.tipoContrato,
      imm: indicadores.imm,
      utm: indicadores.utm,
      tasasAfp: indicadores.tasasAfp,
    });
  }, [liqDe, liqDiasNum, indicadores]);

  // Eliminación definitiva con doble seguridad: solo admins + escribir "borrar"
  const [borrando, setBorrando] = useState<ContratoRow | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const confirmacionOk = confirmacion.trim().toLowerCase() === "borrar";

  function borrar() {
    if (!borrando || !confirmacionOk) return;
    const id = borrando.id;
    startAccion(async () => {
      const res = await eliminarContrato(id);
      if (res.ok) {
        toast.success("Eliminado definitivamente");
        setBorrando(null);
        setConfirmacion("");
        router.refresh();
      } else toast.error(res.error ?? "No se pudo eliminar.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
        {mostrarHerramientasContrato ? (
          <Button render={<Link href="/contratos/nuevo" />}>
            <FilePlus2 className="size-4" />
            Contrato nuevo
          </Button>
        ) : null}
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
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
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
              <ThSort col="trabajador" orden={orden} setOrden={setOrden} className="w-[200px]">Trabajador</ThSort>
              <ThSort col="rut" orden={orden} setOrden={setOrden}>RUT</ThSort>
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[200px]">Empresa</ThSort>
              <ThSort col="cargo" orden={orden} setOrden={setOrden}>Cargo</ThSort>
              <ThSort col="tipo" orden={orden} setOrden={setOrden}>Tipo</ThSort>
              <ThSort col="inicio" orden={orden} setOrden={setOrden}>Inicio</ThSort>
              <ThSort col="vence" orden={orden} setOrden={setOrden}>Vence</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="creado_por" orden={orden} setOrden={setOrden}>Creado por</ThSort>
              <ThSort col="acciones" orden={orden} setOrden={setOrden} className="text-right">Acciones</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  Sin contratos todavía. Crea el primero con “Contrato nuevo”.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow
                  key={f.id}
                  id={`gestion-${f.id}`}
                  className={f.id === gestionDestacada ? CLASE_FILA_DESTACADA : undefined}
                >
                  <TableCell className="font-medium">
                    <span className="block max-w-[200px] truncate" title={f.trabajador}>{f.trabajador}</span>
                  </TableCell>
                  <TableCell>{f.rutTrabajador}</TableCell>
                  <TableCell>
                    <span className="block max-w-[200px] truncate" title={f.empresa}>{f.empresa}</span>
                  </TableCell>
                  <TableCell>{f.cargo ?? "—"}</TableCell>
                  <TableCell>
                    {f.tipoDocumento === "anexo" ? (
                      <span title={f.anexoDetalle ?? undefined}>
                        Anexo:{" "}
                        {f.anexoTipo === "renovacion_fijo_a_fijo"
                          ? "renovación fijo a fijo"
                          : f.anexoTipo === "renovacion_indefinido"
                            ? "renovación a indefinido"
                            : f.anexoTipo === "cambio_jornada"
                              ? `cambio de jornada${f.jornadaHoras ? ` (${f.jornadaHoras} h/sem)` : ""}`
                              : "otro"}
                      </span>
                    ) : f.tipoContrato === "plazo_fijo" ? (
                      "Plazo fijo"
                    ) : f.tipoContrato === "indefinido" ? (
                      "Indefinido"
                    ) : (
                      f.tipoContrato
                    )}
                  </TableCell>
                  <TableCell>{formatFecha(f.fechaInicio)}</TableCell>
                  <TableCell>{formatFecha(f.fechaVencimiento)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstadoContrato(f.estado)}>{f.estado}</Badge>
                  </TableCell>
                  <TableCell>{f.creadoPor}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {f.tieneDocumento ? (
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => descargar(f.id)} title="Descargar .docx">
                          <Download className="size-4" />
                        </Button>
                      ) : null}
                      {indicadores &&
                      f.tipoDocumento === "contrato" &&
                      (Number(f.remuneracion?.sueldo_base ?? 0) > 0 ||
                        esPorDia(f)) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={ocupado}
                          onClick={() => abrirLiquidacion(f)}
                          title="Ver liquidación ejemplo de un mes normal (líquido estimado)"
                        >
                          <Receipt className="size-4" />
                        </Button>
                      ) : null}
                      {f.tipoDocumento !== "anexo" &&
                      ["solicitado", "generado"].includes(f.estado) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={ocupado}
                          onClick={() => abrirEdicion(f)}
                          title={f.clausulasAdicionales ? `Cláusulas adicionales: ${f.clausulasAdicionales}` : "Agregar cláusulas adicionales (modificación particular)"}
                          className={f.clausulasAdicionales ? "text-[var(--brand-teal)]" : ""}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                      {f.tipoDocumento === "anexo" &&
                      ["solicitado", "generado"].includes(f.estado) ? (
                        <Input
                          type="date"
                          aria-label="Fecha del anexo"
                          title="Fecha del anexo (preámbulo del documento). Si la cambias, regenera para aplicarla."
                          className="h-8 w-36"
                          defaultValue={f.anexoFecha ?? ""}
                          disabled={ocupado}
                          onChange={(e) => guardarAnexoFecha(f.id, e.target.value)}
                        />
                      ) : null}
                      {f.estado === "solicitado" ? (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => generar(f.id)}>
                          Generar
                        </Button>
                      ) : null}
                      {f.estado === "generado" ? (
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => generar(f.id)} title="Volver a generar el documento">
                          Regenerar
                        </Button>
                      ) : null}
                      {f.estado === "generado" ? (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => avanzar(f.id, "aprobado")}>
                          Aprobar
                        </Button>
                      ) : null}
                      {f.estado === "aprobado" ? (
                        <>
                          <Button size="sm" disabled={ocupado} onClick={() => enviarAlCliente(f)}>
                            <Send className="size-3.5" />
                            Enviar al cliente
                          </Button>
                          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => avanzar(f.id, "enviado")} title="Marcar como enviado sin mandar correo (si lo enviaste a mano)">
                            Marcar enviado
                          </Button>
                        </>
                      ) : null}
                      {f.estado !== "enviado" && f.estado !== "anulado" ? (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado} onClick={() => avanzar(f.id, "anulado")}>
                          Anular
                        </Button>
                      ) : null}
                      {esAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={ocupado}
                          title="Eliminar definitivamente (solo administradores)"
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

      <Dialog open={editando !== null} onOpenChange={(o) => { if (!o) setEditando(null); }}>
        {editando ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Cláusulas adicionales · {editando.trabajador}
              </DialogTitle>
              <DialogDescription>
                Modificación particular de este contrato (se inserta antes de las
                firmas como “CLÁUSULA ADICIONAL PACTADA”). Tras guardar, usa
                Regenerar para aplicarla al documento.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              rows={4}
              value={textoClausulas}
              onChange={(e) => setTextoClausulas(e.target.value)}
              placeholder="Ej.: El trabajador realizará además el inventario diario de la tienda al cierre de su turno, registrándolo en el sistema dispuesto por el empleador…"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button onClick={guardarClausulas} disabled={ocupado}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Liquidación de ejemplo: líquido estimado de un mes normal */}
      <Dialog open={liqDe !== null} onOpenChange={(o) => { if (!o) setLiqDe(null); }}>
        {liqDe && liq ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Liquidación ejemplo · {liqDe.trabajador}
              </DialogTitle>
              <DialogDescription>
                {esPorDia(liqDe)
                  ? `Pago por día — simula el mes con los días que quieras, con los indicadores Previred de ${indicadores?.periodo}. Referencial.`
                  : `Mes normal de 30 días, sin novedades — con los indicadores Previred de ${indicadores?.periodo}. Referencial.`}
              </DialogDescription>
            </DialogHeader>

            {esPorDia(liqDe) ? (
              <div className="flex items-center gap-2">
                <Label htmlFor="liq-dias" className="whitespace-nowrap">Días trabajados</Label>
                <Input
                  id="liq-dias"
                  className="w-20"
                  inputMode="numeric"
                  value={liqDias}
                  onChange={(e) => {
                    // permitir vaciar el campo mientras se escribe; tope 30
                    let limpio = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
                    if (limpio !== "" && Number(limpio) > 30) limpio = "30";
                    setLiqDias(limpio);
                  }}
                />
                <span className="text-xs text-muted-foreground">
                  × {formatMonto(Number(liqDe.remuneracion?.valor_dia ?? 0))} por día
                </span>
              </div>
            ) : null}

            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span>
                  Sueldo base
                  {esPorDia(liqDe) ? ` (${liqDiasNum} día${liqDiasNum === 1 ? "" : "s"})` : ""}
                </span>
                <span className="tabular-nums">{formatMonto(liq.sueldoBase)}</span>
              </div>
              <div className="flex justify-between"><span>Gratificación legal</span><span className="tabular-nums">{formatMonto(liq.gratificacion)}</span></div>
              <div className="flex justify-between border-t pt-1.5 font-medium"><span>Total imponible</span><span className="tabular-nums">{formatMonto(liq.totalImponible)}</span></div>
              <div className="flex justify-between text-muted-foreground">
                <span>AFP {liq.afpNombre ?? "—"}{liq.afpTasa !== null ? ` (${liq.afpTasa.toLocaleString("es-CL")}%)` : ""}</span>
                <span className="tabular-nums">−{formatMonto(liq.afpMonto)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground"><span>Salud 7%</span><span className="tabular-nums">−{formatMonto(liq.saludMonto)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Seguro cesantía AFC{liq.afcMonto > 0 ? " 0,6%" : ""}</span><span className="tabular-nums">−{formatMonto(liq.afcMonto)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Impuesto único</span><span className="tabular-nums">−{formatMonto(liq.impuestoUnico)}</span></div>
              <div className="flex justify-between border-t pt-1.5"><span>Total descuentos</span><span className="tabular-nums">−{formatMonto(liq.totalDescuentos)}</span></div>
              {liq.colacion > 0 ? (
                <div className="flex justify-between"><span>Colación (no imponible)</span><span className="tabular-nums">+{formatMonto(liq.colacion)}</span></div>
              ) : null}
              {liq.movilizacion > 0 ? (
                <div className="flex justify-between"><span>Movilización (no imponible)</span><span className="tabular-nums">+{formatMonto(liq.movilizacion)}</span></div>
              ) : null}
              <div className="flex justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-base font-semibold text-emerald-800">
                <span>LÍQUIDO A PAGO</span><span className="tabular-nums">{formatMonto(liq.liquido)}</span>
              </div>
            </div>

            {liq.notas.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                {liq.notas.map((n) => <li key={n}>{n}</li>)}
              </ul>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>

      {/* Doble confirmación de borrado definitivo: hay que escribir "borrar" */}
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
                Eliminar {borrando.tipoDocumento === "anexo" ? "anexo" : "contrato"} definitivamente
              </DialogTitle>
              <DialogDescription>
                {borrando.trabajador} · {borrando.empresa} · estado {borrando.estado}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Esta acción es definitiva: se borra la solicitud
                {borrando.tieneDocumento ? " y su documento generado" : ""}. No
                se puede deshacer. Si solo quieres dejarlo sin efecto, usa
                "Anular" — el registro se conserva.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmar-borrado-contrato">
                Escribe <span className="font-mono font-semibold">borrar</span> para confirmar
              </Label>
              <Input
                id="confirmar-borrado-contrato"
                autoFocus
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                placeholder="borrar"
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setBorrando(null);
                  setConfirmacion("");
                }}
              >
                Cancelar
              </Button>
              <Button
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
    </div>
  );
}
