"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  Lock,
  LockOpen,
  Plus,
  Trash2,
} from "lucide-react";
import {
  agregarNovedadInterna,
  eliminarNovedadInterna,
  cambiarEstadoPeriodo,
} from "./actions";
import { TIPOS_NOVEDAD, TIPO_NOVEDAD_LABEL, resumenGestionMes } from "@/lib/novedades";
import { formatFecha, formatMonto } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function moverPeriodo(p: string, delta: number): string {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nombrePeriodo(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

export type EmpresaExcel = {
  clienteId: string;
  razonSocial: string;
  estado: "abierto" | "cerrado";
  trabajadores: { id: string; nombre: string }[];
  novedades: {
    id: string;
    trabajador: string;
    tipo: string;
    fecha: string | null;
    fecha_hasta: string | null;
    cantidad: number | null;
    monto: number | null;
    comentario: string | null;
    origen: string;
  }[];
  gestiones: {
    id: string;
    tipo: string;
    trabajador: string;
    estado: string;
    datos: Record<string, string>;
  }[];
};

function FormNovedad({
  empresa,
  periodo,
  ocupado,
  onAgregar,
}: {
  empresa: EmpresaExcel;
  periodo: string;
  ocupado: boolean;
  onAgregar: (n: Parameters<typeof agregarNovedadInterna>[0]) => void;
}) {
  const [trabajadorId, setTrabajadorId] = useState("");
  const [tipo, setTipo] = useState("hora_extra");
  const [fecha, setFecha] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [monto, setMonto] = useState("");
  const [comentario, setComentario] = useState("");
  const def = TIPOS_NOVEDAD.find((t) => t.value === tipo) ?? TIPOS_NOVEDAD[0];

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Trabajador</Label>
        <select className={selectCls} value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
          <option value="">— Selecciona —</option>
          {empresa.trabajadores.map((t) => (
            <option key={t.id} value={t.id}>{t.nombre}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Tipo</Label>
        <select className={selectCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_NOVEDAD.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      {def.campos === "rango" ? (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Fecha{def.campos === "monto" ? " (opcional)" : ""}</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{def.campos === "horas" ? "Horas" : "Monto ($)"}</Label>
            {def.campos === "horas" ? (
              <Input type="number" min={0.5} max={24} step={0.5} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
            ) : (
              <Input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} />
            )}
          </div>
        </>
      )}
      <div className="flex flex-col gap-1 sm:col-span-3">
        <Label className="text-xs">Comentario</Label>
        <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="detalle si aplica" />
      </div>
      <div className="flex items-end">
        <Button
          size="sm"
          disabled={ocupado}
          onClick={() => {
            onAgregar({
              cliente_id: empresa.clienteId,
              trabajador_id: trabajadorId,
              periodo,
              tipo,
              fecha,
              fecha_hasta: fechaHasta,
              cantidad,
              monto,
              comentario,
            });
            setFecha(""); setFechaHasta(""); setCantidad(""); setMonto(""); setComentario("");
          }}
        >
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>
    </div>
  );
}

export function ExcelClient({
  empresas,
  periodo,
  errorCarga,
}: {
  empresas: EmpresaExcel[];
  periodo: string;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [ocupado, startAccion] = useTransition();

  function irA(p: string) {
    router.push(`/excel?periodo=${p}`);
  }

  function agregar(n: Parameters<typeof agregarNovedadInterna>[0]) {
    startAccion(async () => {
      const res = await agregarNovedadInterna(n);
      if (res.ok) toast.success("Novedad agregada");
      else toast.error(res.error ?? "Error al guardar");
    });
  }

  function borrar(id: string) {
    startAccion(async () => {
      const res = await eliminarNovedadInterna(id);
      if (res.ok) toast.success("Novedad eliminada");
      else toast.error(res.error ?? "Error al eliminar");
    });
  }

  function cambiarEstado(e: EmpresaExcel) {
    const nuevo = e.estado === "cerrado" ? "abierto" : "cerrado";
    if (!window.confirm(
      nuevo === "cerrado"
        ? `¿Cerrar ${nombrePeriodo(periodo)} de ${e.razonSocial}? El cliente ya no podrá cargar novedades.`
        : `¿Reabrir ${nombrePeriodo(periodo)} de ${e.razonSocial}? El cliente podrá volver a cargar novedades.`,
    )) return;
    startAccion(async () => {
      const res = await cambiarEstadoPeriodo(e.clienteId, periodo, nuevo);
      if (res.ok) toast.success(nuevo === "cerrado" ? "Mes cerrado" : "Mes reabierto");
      else toast.error(res.error ?? "Error");
    });
  }

  function generarProximamente(que: string) {
    toast.info(`${que}: disponible próximamente — las reglas de generación están por definirse.`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Excel compartidos</h1>
        <p className="text-sm text-muted-foreground">
          Novedades de remuneraciones del mes, en vivo: lo que carga el cliente
          por su portal y lo que carga el equipo. Al cierre se generan los
          archivos de liquidaciones y Previred.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => irA(moverPeriodo(periodo, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium capitalize">
          {nombrePeriodo(periodo)}
        </span>
        <Button variant="outline" size="icon-sm" onClick={() => irA(moverPeriodo(periodo, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {empresas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sin empresas con trabajadores registrados todavía.
        </p>
      ) : (
        empresas.map((e) => (
          <Card key={e.clienteId} className="card-soft border-transparent">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{e.razonSocial}</CardTitle>
                  <Badge
                    variant="outline"
                    className={
                      e.estado === "cerrado"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-sky-200 bg-sky-50 text-sky-700"
                    }
                  >
                    {e.estado === "cerrado" ? "Mes cerrado" : "Mes abierto"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generarProximamente("Excel de liquidaciones")}
                  >
                    <FileSpreadsheet className="size-3.5" />
                    Generar Excel liquidaciones
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generarProximamente("Archivo Previred")}
                  >
                    <FileUp className="size-3.5" />
                    Generar archivo Previred
                  </Button>
                  <Button
                    variant={e.estado === "cerrado" ? "outline" : "default"}
                    size="sm"
                    disabled={ocupado}
                    onClick={() => cambiarEstado(e)}
                  >
                    {e.estado === "cerrado" ? (
                      <><LockOpen className="size-3.5" /> Reabrir mes</>
                    ) : (
                      <><Lock className="size-3.5" /> Cerrar mes</>
                    )}
                  </Button>
                </div>
              </div>
              <CardDescription>
                {e.trabajadores.length} trabajador{e.trabajadores.length === 1 ? "" : "es"} activo
                {e.trabajadores.length === 1 ? "" : "s"} · {e.novedades.length} novedad
                {e.novedades.length === 1 ? "" : "es"} · {e.gestiones.length} gestión
                {e.gestiones.length === 1 ? "" : "es"} del panel este mes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {e.gestiones.length > 0 ? (
                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Gestiones del panel en el mes
                  </p>
                  <ul className="space-y-1 text-sm">
                    {e.gestiones.map((g) => (
                      <li key={g.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{g.trabajador}</span>
                        <span className="text-muted-foreground">
                          {resumenGestionMes(g.tipo, g.datos)}
                        </span>
                        <span className="text-xs text-muted-foreground">({g.estado})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Novedades de {nombrePeriodo(periodo)}
                </p>
                {e.novedades.length > 0 ? (
                  <ul className="divide-y">
                    {e.novedades.map((n) => (
                      <li key={n.id} className="flex items-center gap-2 py-1.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{n.trabajador}</span>{" "}
                          <span className="text-muted-foreground">
                            {TIPO_NOVEDAD_LABEL[n.tipo] ?? n.tipo}
                            {n.fecha ? ` · ${formatFecha(n.fecha)}` : ""}
                            {n.fecha_hasta ? ` al ${formatFecha(n.fecha_hasta)}` : ""}
                            {n.cantidad != null ? ` · ${n.cantidad} hrs` : ""}
                            {n.monto != null ? ` · ${formatMonto(n.monto)}` : ""}
                            {n.comentario ? ` · ${n.comentario}` : ""}
                          </span>{" "}
                          <Badge variant="outline" className="ml-1 align-middle text-[10px]">
                            {n.origen === "equipo" ? "equipo" : "cliente"}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={ocupado}
                          onClick={() => borrar(n.id)}
                          aria-label="Eliminar novedad"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin novedades cargadas.</p>
                )}
              </div>

              {e.trabajadores.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-[var(--brand-teal)]">
                    Agregar novedad (equipo)
                  </summary>
                  <div className="pt-3">
                    <FormNovedad
                      empresa={e}
                      periodo={periodo}
                      ocupado={ocupado}
                      onAgregar={agregar}
                    />
                  </div>
                </details>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
