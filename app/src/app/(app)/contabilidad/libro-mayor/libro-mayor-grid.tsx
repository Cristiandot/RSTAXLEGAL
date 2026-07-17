"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { formatMonto } from "@/lib/format";
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

export type FilaLibroMayor = {
  clienteId: string;
  razonSocial: string;
  rutEmpresa: string | null;
  activo: boolean;
  terminado: boolean;
  cargado: boolean;
  cuadra: boolean | null;
  nCuentas: number;
  nMovimientos: number;
  totalDebe: number;
  totalHaber: number;
  actualizado: string | null;
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
    tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${color}`}>{valor}</div>
    </div>
  );
}

function EstadoCelda({ f }: { f: FilaLibroMayor }) {
  if (!f.cargado)
    return (
      <span className="inline-flex h-6 items-center rounded-md border border-dashed border-border px-1.5 text-[11px] font-medium text-muted-foreground/70">
        Sin información
      </span>
    );
  return f.cuadra ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      ✓ Cargado
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
      ≠ Descuadre
    </Badge>
  );
}

export function LibroMayorGrid({
  anio,
  filas,
  errorCarga,
}: {
  anio: number;
  filas: FilaLibroMayor[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [servicioF, setServicioF] = useState("activas");

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q) {
        const t = `${f.razonSocial} ${f.rutEmpresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (servicioF === "activas" && f.terminado) return false;
      if (servicioF === "terminadas" && !f.terminado) return false;
      if (estadoF === "cargado" && !f.cargado) return false;
      if (estadoF === "sin_info" && f.cargado) return false;
      if (estadoF === "descuadre" && !(f.cargado && f.cuadra === false))
        return false;
      return true;
    });
  }, [filas, buscar, estadoF, servicioF]);

  const universo = filas.filter((f) =>
    servicioF === "activas" ? !f.terminado : servicioF === "terminadas" ? f.terminado : true,
  );
  const resumen: { label: string; valor: number; tono?: "ok" | "alerta" }[] = [
    { label: "Empresas", valor: universo.length },
    { label: "Cargadas", valor: universo.filter((f) => f.cargado).length, tono: "ok" },
    {
      label: "Sin información",
      valor: universo.filter((f) => !f.cargado).length,
    },
    {
      label: "Con descuadre",
      valor: universo.filter((f) => f.cargado && f.cuadra === false).length,
      tono: "alerta",
    },
  ];

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Libro Mayor {anio}
          </h1>
          <p className="text-sm text-muted-foreground">
            Libro Mayor anual importado desde KAME por empresa. Haz click en una
            fila para ver el detalle, el resumen por cuenta y descargar el
            archivo original.
          </p>
        </div>
        <select
          aria-label="Año"
          className={selectCls}
          value={String(anio)}
          onChange={(e) => router.push(`/contabilidad/libro-mayor?anio=${e.target.value}`)}
        >
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>
              Año {y}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map((r) => (
          <ResumenCard key={r.label} label={r.label} valor={r.valor} tono={r.tono} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          aria-label="Servicio"
          className={selectCls}
          value={servicioF}
          onChange={(e) => setServicioF(e.target.value)}
        >
          <option value="activas">Servicio: activas</option>
          <option value="terminadas">Servicio terminado</option>
          <option value="">Todas</option>
        </select>
        <select
          aria-label="Estado"
          className={selectCls}
          value={estadoF}
          onChange={(e) => setEstadoF(e.target.value)}
        >
          <option value="">Estado: todos</option>
          <option value="cargado">Cargadas</option>
          <option value="sin_info">Sin información</option>
          <option value="descuadre">Con descuadre</option>
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {universo.length} empresas
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
              <TableHead className="w-[300px]">Cliente</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Estado {anio}</TableHead>
              <TableHead className="text-right">Cuentas</TableHead>
              <TableHead className="text-right">Movimientos</TableHead>
              <TableHead className="text-right">Total Debe</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Sin resultados para estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow
                  key={f.clienteId}
                  onClick={() =>
                    router.push(`/contabilidad/${f.clienteId}/libro-mayor?anio=${anio}`)
                  }
                  className="group cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <span className="block max-w-[300px] truncate" title={f.razonSocial}>
                      {f.razonSocial}
                    </span>
                    {f.terminado ? (
                      <span className="text-[11px] text-muted-foreground">
                        servicio terminado
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{f.rutEmpresa ?? "—"}</TableCell>
                  <TableCell>
                    <EstadoCelda f={f} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.cargado ? f.nCuentas : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.cargado ? f.nMovimientos.toLocaleString("es-CL") : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.cargado ? formatMonto(f.totalDebe) : "—"}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="size-4 text-muted-foreground/50" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
