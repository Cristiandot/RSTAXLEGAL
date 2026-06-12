"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Download, FilePlus2, Pencil, Search, Send } from "lucide-react";
import { formatFecha } from "@/lib/format";
import {
  actualizarClausulas,
  cambiarEstadoContrato,
  enviarContratoAlCliente,
  generarContrato,
  linkDescargaContrato,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ContratoRow = {
  id: string;
  estado: string;
  tipoDocumento: string;
  anexoTipo: string | null;
  anexoDetalle: string | null;
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
}: {
  filas: ContratoRow[];
  errorCarga: string | null;
  titulo?: string;
  descripcion?: string;
  /** Botón "Contrato nuevo" (solo en el módulo Contratos). */
  mostrarHerramientasContrato?: boolean;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [ocupado, startAccion] = useTransition();

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.trabajador} ${f.rutTrabajador} ${f.empresa}`.toLowerCase().includes(q)) return false;
      if (estadoF && f.estado !== estadoF) return false;
      return true;
    });
  }, [filas, buscar, estadoF]);

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

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Trabajador</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead className="w-[200px]">Empresa</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado por</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
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
                <TableRow key={f.id}>
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
                      {f.estado === "solicitado" && f.tipoDocumento !== "anexo" ? (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => generar(f.id)}>
                          Generar
                        </Button>
                      ) : null}
                      {f.estado === "generado" && f.tipoDocumento !== "anexo" ? (
                        <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => generar(f.id)} title="Volver a generar el documento (aplica cláusulas editadas)">
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
    </div>
  );
}
