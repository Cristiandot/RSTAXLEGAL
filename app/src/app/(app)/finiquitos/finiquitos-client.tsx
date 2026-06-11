"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Calculator, Search } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
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
  creada: string;
};

const CAUSAL_PORTAL_LABEL: Record<string, string> = {
  renuncia: "Renuncia (159 N°2)",
  mutuo_acuerdo: "Mutuo acuerdo (159 N°1)",
  vencimiento_plazo: "Vencimiento plazo (159 N°4)",
  conclusion_obra: "Conclusión obra (159 N°5)",
  necesidades_empresa: "Necesidades empresa (161)",
  conducta: "Conducta (160)",
  no_seguro: "Por definir",
};

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
  errorCarga,
}: {
  filas: FiniquitoRow[];
  errorCarga: string | null;
}) {
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");

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
              <TableHead>Causal</TableHead>
              <TableHead>Término</TableHead>
              <TableHead>Recibida</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total calculado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Sin solicitudes de finiquito todavía. Llegan solas desde el portal del
                  cliente; también puedes usar el cálculo libre.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.id}>
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
                  <TableCell>{formatFecha(f.creada?.slice(0, 10))}</TableCell>
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
                    <Button
                      size="sm"
                      variant="outline"
                      render={<Link href={`/finiquitos/calculadora?gestion=${f.id}`} />}
                    >
                      <Calculator className="size-3.5" />
                      {f.totalCalculado !== null ? "Recalcular" : "Calcular"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        El flujo de aprobación y envío de la solicitud sigue en el módulo Gestiones RRHH;
        acá se hace el cálculo y queda guardado en la misma solicitud.
      </p>
    </div>
  );
}
