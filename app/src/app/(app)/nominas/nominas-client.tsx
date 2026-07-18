"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Link2 } from "lucide-react";
import { toast } from "sonner";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { Progreso } from "@/components/progreso";
import { comparar, ordenarPorGrupo, type Orden } from "@/lib/ordenar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { GrupoClienteOpcion } from "@/lib/onboarding";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type NominaEmpresaRow = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  n_trabajadores_esperados: number | null;
  n_trab_activos: number;
  n_trab_total: number;
  /** % de completitud de los datos de los trabajadores. */
  pct_trab: number | null;
  faltan_trab: number;
  /** Token del link público para que el cliente complete datos faltantes. */
  form_token: string | null;
};

function StatCard({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

/** Dotación: activos vs declarados, en rojo si faltan. */
function Dotacion({ e }: { e: NominaEmpresaRow }) {
  if (e.n_trabajadores_esperados === null)
    return <span>{e.n_trab_activos}</span>;
  const faltan = e.n_trab_activos < e.n_trabajadores_esperados;
  return (
    <span
      title={`${e.n_trab_activos} activos de ${e.n_trabajadores_esperados} declarados`}
      className={faltan ? "font-semibold text-red-600" : ""}
    >
      {e.n_trab_activos} / {e.n_trabajadores_esperados}
    </span>
  );
}

export function NominasClient({
  empresas,
  grupos,
  errorCarga,
}: {
  empresas: NominaEmpresaRow[];
  grupos: GrupoClienteOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = empresas.filter((e) => {
      if (q) {
        const t =
          `${e.razon_social} ${e.rut_empresa ?? ""} ${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (clienteF && e.grupo_id !== clienteF) return false;
      return true;
    });
    // Orden por defecto = prioridad de cartera por código de grupo (A.1 → D.45),
    // con la razón social como desempate; las empresas sin cliente al final.
    if (!orden)
      return ordenarPorGrupo(out, (e) => e.grupo_codigo, (e) => e.razon_social);
    const val = (e: NominaEmpresaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
        case "rut":
          return e.rut_empresa;
        case "activos":
          return e.n_trab_activos;
        case "pct":
          return e.pct_trab;
        case "faltan":
          return e.faltan_trab;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, orden]);

  const totalActivos = useMemo(
    () => filtradas.reduce((a, e) => a + e.n_trab_activos, 0),
    [filtradas],
  );
  const conDeficit = useMemo(
    () =>
      filtradas.filter(
        (e) =>
          e.n_trabajadores_esperados !== null &&
          e.n_trab_activos < e.n_trabajadores_esperados,
      ).length,
    [filtradas],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas — Nómina de trabajadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo empresas con liquidaciones de sueldo. Entre a una empresa para
          ver su dashboard y completar la ficha de cada trabajador.
        </p>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Empresas con liquidaciones" valor={filtradas.length} />
        <StatCard label="Trabajadores activos" valor={totalActivos} />
        <StatCard label="Con dotación incompleta" valor={conDeficit} />
      </div>

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
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.codigo ? `${g.codigo} — ` : ""}
              {g.nombre}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} empresas
        </span>
      </div>

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[180px]">
                Cliente
              </ThSort>
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[280px]">
                Empresa
              </ThSort>
              <ThSort col="rut" orden={orden} setOrden={setOrden}>
                RUT
              </ThSort>
              <ThSort col="activos" orden={orden} setOrden={setOrden} className="text-center">
                Activos / Declarados
              </ThSort>
              <ThSort col="pct" orden={orden} setOrden={setOrden}>
                % Datos trab.
              </ThSort>
              <ThSort col="faltan" orden={orden} setOrden={setOrden} className="text-center">
                Faltan
              </ThSort>
              <TableHead className="w-40 text-right" />
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
                  onClick={() => router.push(`/nominas/${e.id}`)}
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
                      className="block max-w-[280px] truncate"
                      title={e.razon_social}
                    >
                      {e.razon_social}
                    </span>
                  </TableCell>
                  <TableCell>
                    <RutCopiable rut={e.rut_empresa} />
                  </TableCell>
                  <TableCell className="text-center">
                    <Dotacion e={e} />
                  </TableCell>
                  <TableCell>
                    <Progreso pct={e.pct_trab} />
                  </TableCell>
                  <TableCell className="text-center">
                    {e.faltan_trab === 0 ? (
                      <span className="text-emerald-600">0</span>
                    ) : (
                      <span className="font-semibold text-red-600">
                        {e.faltan_trab}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      {e.form_token && e.faltan_trab > 0 ? (
                        <button
                          title="Copiar link para que el cliente complete los datos faltantes"
                          className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            const url = `${window.location.origin}/completar-nomina/${e.form_token}`;
                            void navigator.clipboard.writeText(url);
                            toast.success("Link copiado", { description: url });
                          }}
                        >
                          <Link2 className="size-3.5" /> Solicitar datos
                        </button>
                      ) : null}
                      <ChevronRight className="size-4" />
                    </div>
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
