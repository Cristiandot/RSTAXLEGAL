"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, FileText, Search } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { MOTIVO_AMONESTACION_LABEL } from "@/lib/amonestaciones";
import { cambiarEstadoGestion, generarCartaAmonestacion } from "./actions";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type GestionRow = {
  id: string;
  tipo: string;
  trabajador: string;
  rut: string;
  empresa: string;
  correo: string;
  datos: Record<string, string>;
  estado: string;
  observaciones: string | null;
  creada: string;
};

const TIPO_LABEL: Record<string, string> = {
  amonestacion: "Amonestación",
  finiquito: "Finiquito / despido",
  vacaciones: "Vacaciones",
};

const CAUSAL_LABEL: Record<string, string> = {
  renuncia: "Renuncia del trabajador (Art. 159 N°2)",
  mutuo_acuerdo: "Mutuo acuerdo (Art. 159 N°1)",
  vencimiento_plazo: "Vencimiento del plazo (Art. 159 N°4)",
  conclusion_obra: "Conclusión de la obra o servicio (Art. 159 N°5)",
  necesidades_empresa: "Necesidades de la empresa (Art. 161)",
  conducta: "Conducta del trabajador (Art. 160)",
  no_seguro: "Cliente no está seguro — definir causal",
};

const SI_NO: Record<string, string> = { si: "Sí", no: "No", no_se: "No está seguro", "": "—" };

function claseTipo(tipo: string): string {
  switch (tipo) {
    case "finiquito":
      return "border-red-200 bg-red-50 text-red-700";
    case "amonestacion":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-700";
  }
}

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

/** Pares etiqueta/valor legibles según el tipo de gestión. */
function detalle(g: GestionRow): [string, string][] {
  const d = g.datos;
  if (g.tipo === "amonestacion") {
    const filas: [string, string][] = [
      ["Fecha de los hechos", formatFecha(d.fecha_hechos)],
      ["Motivo", MOTIVO_AMONESTACION_LABEL[d.motivo ?? ""] ?? d.motivo ?? "—"],
      ["Descripción de los hechos", d.descripcion ?? "—"],
    ];
    // solicitudes antiguas (antes del catálogo de motivos) traían este campo
    if (d.amonestaciones_previas) {
      filas.splice(2, 0, [
        "Amonestaciones previas",
        SI_NO[d.amonestaciones_previas] ?? "—",
      ]);
    }
    return filas;
  }
  if (g.tipo === "finiquito") {
    const filas: [string, string][] = [
      ["Causal", CAUSAL_LABEL[d.causal ?? ""] ?? d.causal ?? "—"],
      ["Fecha de aviso del despido", formatFecha(d.fecha_aviso)],
      ["Término de la relación laboral", formatFecha(d.fecha_termino)],
    ];
    if (d.aviso_modalidad) {
      filas.push([
        "Mes de aviso (Art. 162)",
        d.aviso_modalidad === "avisar_30"
          ? "Avisará con 30 días de anticipación"
          : d.aviso_modalidad === "pagar_mes"
            ? "Pagará el mes de aviso (indemnización sustitutiva)"
            : d.aviso_modalidad,
      ]);
    }
    // solicitudes antiguas (formulario con datos de cálculo y screening)
    if (d.fecha_ingreso) filas.unshift(["Fecha de ingreso", formatFecha(d.fecha_ingreso)]);
    if (d.sueldo_base) filas.push(["Sueldo base", formatMonto(d.sueldo_base)]);
    if (d.otras_remuneraciones && d.otras_remuneraciones !== "0") {
      filas.push(["Otros pagos mensuales promedio", formatMonto(d.otras_remuneraciones)]);
    }
    if (d.vacaciones_dias_tomados !== undefined) {
      filas.push(["Días de vacaciones tomados", d.vacaciones_dias_tomados ?? "—"]);
    }
    if (d.aviso_30_dias) filas.push(["Aviso 30 días (Art. 161)", SI_NO[d.aviso_30_dias] ?? "—"]);
    if (d.licencia_vigente) filas.push(["Licencia médica vigente", SI_NO[d.licencia_vigente] ?? "—"]);
    if (d.fuero) {
      filas.push([
        "Fuero",
        d.fuero === "embarazo"
          ? "⚠ Fuero maternal"
          : d.fuero === "sindical"
            ? "⚠ Fuero sindical"
            : (SI_NO[d.fuero] ?? "—"),
      ]);
    }
    return filas;
  }
  return [
    ["Primer día de vacaciones", formatFecha(d.fecha_inicio)],
    ["Fecha de regreso", formatFecha(d.fecha_regreso)],
    ["Días hábiles", d.dias_habiles ?? "—"],
  ];
}

export function GestionesClient({
  filas,
  errorCarga,
}: {
  filas: GestionRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [viendo, setViendo] = useState<GestionRow | null>(null);
  const [ocupado, startAccion] = useTransition();

  const selectCls =
    "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.trabajador} ${f.rut} ${f.empresa}`.toLowerCase().includes(q)) return false;
      if (tipoF && f.tipo !== tipoF) return false;
      if (estadoF && f.estado !== estadoF) return false;
      return true;
    });
  }, [filas, buscar, tipoF, estadoF]);

  const pendientes = filas.filter((f) => f.estado === "solicitada").length;

  function avanzar(id: string, nuevo: string) {
    startAccion(async () => {
      const res = await cambiarEstadoGestion(id, nuevo);
      if (res.ok) {
        toast.success(`Gestión ${nuevo}`);
        setViendo(null);
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function generarCarta(id: string) {
    startAccion(async () => {
      const res = await generarCartaAmonestacion(id);
      if (res.ok && res.downloadUrl) {
        toast.success("Carta generada — descargando");
        window.open(res.downloadUrl, "_blank");
        router.refresh();
      } else toast.error(res.error ?? "Error al generar la carta");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Gestiones RRHH</h1>
        <p className="text-sm text-muted-foreground">
          Amonestaciones, finiquitos y vacaciones solicitadas por los clientes.
          Flujo: revisar → aprobar → enviar al correo de contacto.
          {pendientes > 0 ? ` · ${pendientes} pendiente${pendientes > 1 ? "s" : ""} de revisión.` : ""}
        </p>
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
        <select aria-label="Tipo" className={selectCls} value={tipoF} onChange={(e) => setTipoF(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="amonestacion">Amonestación</option>
          <option value="finiquito">Finiquito / despido</option>
          <option value="vacaciones">Vacaciones</option>
        </select>
        <select aria-label="Estado" className={selectCls} value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="solicitada">Solicitada</option>
          <option value="aprobada">Aprobada</option>
          <option value="enviada">Enviada</option>
          <option value="rechazada">Rechazada</option>
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
              <TableHead>Tipo</TableHead>
              <TableHead className="w-[200px]">Trabajador</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead className="w-[200px]">Empresa</TableHead>
              <TableHead>Recibida</TableHead>
              <TableHead>Correo contacto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Sin gestiones todavía. Llegan solas cuando los clientes usan su link de solicitud.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.id} onClick={() => setViendo(f)} className="cursor-pointer">
                  <TableCell>
                    <Badge variant="outline" className={claseTipo(f.tipo)}>
                      {TIPO_LABEL[f.tipo] ?? f.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="block max-w-[200px] truncate" title={f.trabajador}>{f.trabajador}</span>
                  </TableCell>
                  <TableCell>{f.rut}</TableCell>
                  <TableCell>
                    <span className="block max-w-[200px] truncate" title={f.empresa}>{f.empresa}</span>
                  </TableCell>
                  <TableCell>{formatFecha(f.creada?.slice(0, 10))}</TableCell>
                  <TableCell>{f.correo}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(f.estado)}>{f.estado}</Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViendo(f)} title="Ver detalle">
                        <Eye className="size-4" />
                      </Button>
                      {f.tipo === "amonestacion" && f.estado !== "rechazada" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={ocupado}
                          onClick={() => generarCarta(f.id)}
                          title="Generar el Word de la carta"
                        >
                          <FileText className="size-3.5" />
                          Carta
                        </Button>
                      ) : null}
                      {f.estado === "solicitada" ? (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => avanzar(f.id, "aprobada")}>
                          Aprobar
                        </Button>
                      ) : null}
                      {f.estado === "aprobada" ? (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => avanzar(f.id, "enviada")}>
                          Marcar enviada
                        </Button>
                      ) : null}
                      {f.estado === "solicitada" || f.estado === "aprobada" ? (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={ocupado} onClick={() => avanzar(f.id, "rechazada")}>
                          Rechazar
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

      <Dialog open={viendo !== null} onOpenChange={(o) => { if (!o) setViendo(null); }}>
        {viendo ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {TIPO_LABEL[viendo.tipo] ?? viendo.tipo} · {viendo.trabajador}
              </DialogTitle>
              <DialogDescription>
                {viendo.empresa} · RUT {viendo.rut} · recibida el {formatFecha(viendo.creada?.slice(0, 10))}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              {detalle(viendo).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 border-b pb-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium sm:text-right">{v}</span>
                </div>
              ))}
              {viendo.observaciones ? (
                <div className="flex flex-col gap-0.5 pt-1">
                  <span className="text-muted-foreground">Observaciones del cliente</span>
                  <span className="font-medium">{viendo.observaciones}</span>
                </div>
              ) : null}
              {viendo.correo !== "—" ? (
                <div className="flex flex-col gap-0.5 pt-1">
                  <span className="text-muted-foreground">Enviar resultado a</span>
                  <span className="font-medium">{viendo.correo}</span>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              {viendo.tipo === "amonestacion" && viendo.estado !== "rechazada" ? (
                <Button variant="outline" disabled={ocupado} onClick={() => generarCarta(viendo.id)}>
                  <FileText className="size-4" />
                  Generar carta
                </Button>
              ) : null}
              {viendo.estado === "solicitada" ? (
                <Button disabled={ocupado} onClick={() => avanzar(viendo.id, "aprobada")}>
                  Aprobar
                </Button>
              ) : null}
              {viendo.estado === "aprobada" ? (
                <Button disabled={ocupado} onClick={() => avanzar(viendo.id, "enviada")}>
                  Marcar enviada
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setViendo(null)}>
                Cerrar
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
