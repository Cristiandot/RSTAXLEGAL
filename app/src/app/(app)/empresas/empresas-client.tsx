"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";
import { formatFecha } from "@/lib/format";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GrupoClienteOpcion } from "@/lib/onboarding";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type EmpresaFichaRow = {
  id: string;
  razon_social: string;
  nombre_fantasia: string | null;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  tipo_sociedad: string | null;
  regimen_tributario: string | null;
  giro: string | null;
  fecha_inicio_actividades: string | null;
  domicilio: string | null;
  comuna: string | null;
  ciudad: string | null;
  correo_empresa: string | null;
  telefono_empresa: string | null;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  banco: string | null;
  tipo_cuenta: string | null;
  numero_cuenta: string | null;
  hace_f29: boolean | null;
  hace_liquidaciones: boolean | null;
  n_trabajadores_esperados: number | null;
  activo: boolean | null;
  n_trab_activos: number;
};

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{valor || "—"}</div>
    </div>
  );
}

function SiNo({ v }: { v: boolean | null }) {
  return v ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      Sí
    </Badge>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function EmpresasClient({
  empresas,
  grupos,
  errorCarga,
}: {
  empresas: EmpresaFichaRow[];
  grupos: GrupoClienteOpcion[];
  errorCarga: string | null;
}) {
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);

  // Detalle: ficha de la empresa
  const [empSel, setEmpSel] = useState<EmpresaFichaRow | null>(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = empresas.filter((e) => {
      if (q) {
        const t =
          `${e.razon_social} ${e.nombre_fantasia ?? ""} ${e.rut_empresa ?? ""} ${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (clienteF === "__sin__" && e.grupo_id) return false;
      if (clienteF && clienteF !== "__sin__" && e.grupo_id !== clienteF)
        return false;
      return true;
    });
    if (!orden) return out;
    const val = (e: EmpresaFichaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
        case "trab":
          return e.n_trab_activos;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, orden]);

  function abrir(e: EmpresaFichaRow) {
    setEmpSel(e);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas
        </h1>
        <p className="text-sm text-muted-foreground">
          Ficha de cada empresa de la cartera y su nómina de recursos humanos.
        </p>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, RUT o cliente…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <select
          aria-label="Cliente"
          className={`${selectCls} max-w-[220px]`}
          value={clienteF}
          onChange={(e) => setClienteF(e.target.value)}
        >
          <option value="">Todos los clientes</option>
          <option value="__sin__">Sin cliente asignado</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.codigo ? `${g.codigo} — ` : ""}
              {g.nombre}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {empresas.length} empresas
        </span>
      </div>

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[180px]">
                Cliente
              </ThSort>
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[260px]">
                Empresa
              </ThSort>
              <TableHead>RUT</TableHead>
              <TableHead className="text-center">F29</TableHead>
              <TableHead className="text-center">Liquidaciones</TableHead>
              <ThSort col="trab" orden={orden} setOrden={setOrden} className="text-center">
                Trab.
              </ThSort>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => abrir(e)}
                >
                  <TableCell>
                    {e.grupo_codigo || e.grupo_nombre ? (
                      <span
                        className="block max-w-[180px] truncate text-sm"
                        title={`${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.trim()}
                      >
                        {e.grupo_codigo ? (
                          <span className="font-medium">{e.grupo_codigo}</span>
                        ) : null}{" "}
                        <span className="text-muted-foreground">
                          {e.grupo_nombre}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sin cliente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[260px] truncate"
                      title={e.razon_social}
                    >
                      {e.razon_social}
                    </span>
                    {e.nombre_fantasia ? (
                      <span className="block text-xs text-muted-foreground">
                        {e.nombre_fantasia}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RutCopiable rut={e.rut_empresa} />
                  </TableCell>
                  <TableCell className="text-center">
                    <SiNo v={e.hace_f29} />
                  </TableCell>
                  <TableCell className="text-center">
                    <SiNo v={e.hace_liquidaciones} />
                  </TableCell>
                  <TableCell className="text-center">
                    {e.n_trab_activos}
                    {e.n_trabajadores_esperados !== null ? (
                      <span
                        className={
                          e.n_trab_activos < e.n_trabajadores_esperados
                            ? "text-red-600"
                            : "text-muted-foreground"
                        }
                      >
                        {" "}
                        / {e.n_trabajadores_esperados}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ============ Diálogo: ficha + nómina ============ */}
      <Dialog
        open={empSel !== null}
        onOpenChange={(o) => {
          if (!o) setEmpSel(null);
        }}
      >
        {empSel ? (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {empSel.razon_social}
              </DialogTitle>
              <DialogDescription>
                {empSel.grupo_codigo ? `${empSel.grupo_codigo} — ` : ""}
                {empSel.grupo_nombre ?? "Sin cliente"} ·{" "}
                {empSel.rut_empresa ?? "sin RUT"}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {/* Datos de la empresa (la nómina vive en Empresas — Nómina) */}
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-sm font-semibold">
                  Datos de la empresa
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  <Dato label="Nombre de fantasía" valor={empSel.nombre_fantasia} />
                  <Dato label="Tipo de sociedad" valor={empSel.tipo_sociedad} />
                  <Dato label="Régimen tributario" valor={empSel.regimen_tributario} />
                  <Dato label="Giro" valor={empSel.giro} />
                  <Dato
                    label="Inicio de actividades"
                    valor={
                      empSel.fecha_inicio_actividades
                        ? formatFecha(empSel.fecha_inicio_actividades)
                        : null
                    }
                  />
                  <Dato
                    label="Domicilio"
                    valor={
                      [empSel.domicilio, empSel.comuna, empSel.ciudad]
                        .filter(Boolean)
                        .join(", ") || null
                    }
                  />
                  <Dato label="Correo empresa" valor={empSel.correo_empresa} />
                  <Dato label="Teléfono empresa" valor={empSel.telefono_empresa} />
                  <Dato label="Contacto" valor={empSel.contacto_nombre} />
                  <Dato label="Correo contacto" valor={empSel.contacto_correo} />
                  <Dato label="Teléfono contacto" valor={empSel.contacto_telefono} />
                  <Dato
                    label="Cuenta bancaria"
                    valor={
                      [empSel.banco, empSel.tipo_cuenta, empSel.numero_cuenta]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  />
                </div>
              </div>

            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
