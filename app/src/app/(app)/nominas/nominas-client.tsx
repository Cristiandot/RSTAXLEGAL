"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Users } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { Progreso } from "@/components/progreso";
import { CamposEditables } from "@/components/campos-editables";
import { comparar, type Orden } from "@/lib/ordenar";
import { formatMonto } from "@/lib/format";
import { Input } from "@/components/ui/input";
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
import type {
  Catalogos,
  FaltanteRow,
  GrupoClienteOpcion,
} from "@/lib/onboarding";
import { nominaDeEmpresa, type TrabajadorNominaRow } from "../empresas/actions";
import { faltantesDeEmpresa } from "../onboarding/actions";

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

const SIN_CENTRO = "__sin__";

export function NominasClient({
  empresas,
  grupos,
  catalogos,
  selectores,
  errorCarga,
}: {
  empresas: NominaEmpresaRow[];
  grupos: GrupoClienteOpcion[];
  catalogos: Catalogos;
  selectores: Record<string, string | null>;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);

  // Detalle: nómina editable de la empresa
  const [empSel, setEmpSel] = useState<NominaEmpresaRow | null>(null);
  const [nomina, setNomina] = useState<TrabajadorNominaRow[]>([]);
  const [faltantes, setFaltantes] = useState<FaltanteRow[]>([]);
  const [centro, setCentro] = useState("");
  const [cargando, startCargar] = useTransition();

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
    if (!orden) return out;
    const val = (e: NominaEmpresaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
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

  function abrir(e: NominaEmpresaRow) {
    setEmpSel(e);
    setNomina([]);
    setFaltantes([]);
    setCentro("");
    startCargar(async () => {
      const [n, f] = await Promise.all([
        nominaDeEmpresa(e.id),
        faltantesDeEmpresa(e.id),
      ]);
      setNomina(n);
      setFaltantes(f.filter((x) => x.entidad === "trabajador"));
    });
  }

  function quitarFaltante(f: FaltanteRow) {
    setFaltantes((prev) =>
      prev.filter((x) => !(x.registro_id === f.registro_id && x.campo === f.campo)),
    );
    router.refresh();
  }

  // Centros de costo (columna sucursal) presentes en la nómina activa.
  const centros = useMemo(() => {
    const s = new Set<string>();
    let sinCentro = false;
    for (const t of nomina) {
      if (t.activo === false) continue;
      if (t.sucursal?.trim()) s.add(t.sucursal.trim());
      else sinCentro = true;
    }
    return { lista: [...s].sort(), sinCentro };
  }, [nomina]);

  const trabajadoresVisibles = useMemo(() => {
    return nomina.filter((t) => {
      if (t.activo === false) return false;
      if (!centro) return true;
      if (centro === SIN_CENTRO) return !t.sucursal?.trim();
      return t.sucursal?.trim() === centro;
    });
  }, [nomina, centro]);

  const desvinculados = useMemo(
    () => nomina.filter((t) => t.activo === false).length,
    [nomina],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas — Nómina de trabajadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo empresas con liquidaciones de sueldo. Este es el lugar para
          rellenar los datos de los trabajadores, con filtro por centro de
          costo.
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
              <TableHead>RUT</TableHead>
              <ThSort col="activos" orden={orden} setOrden={setOrden} className="text-center">
                Activos / Declarados
              </ThSort>
              <ThSort col="pct" orden={orden} setOrden={setOrden}>
                % Datos trab.
              </ThSort>
              <ThSort col="faltan" orden={orden} setOrden={setOrden} className="text-center">
                Faltan
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
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ============ Diálogo: rellenar datos de la nómina ============ */}
      <Dialog
        open={empSel !== null}
        onOpenChange={(o) => {
          if (!o) setEmpSel(null);
        }}
      >
        {empSel ? (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading">
                <Users className="size-5" />
                {empSel.razon_social}
              </DialogTitle>
              <DialogDescription>
                {empSel.grupo_codigo ? `${empSel.grupo_codigo} — ` : ""}
                {empSel.grupo_nombre ?? "Sin cliente"} · {empSel.n_trab_activos}{" "}
                activos
                {empSel.n_trabajadores_esperados !== null
                  ? ` de ${empSel.n_trabajadores_esperados} declarados`
                  : ""}
                {desvinculados ? ` · ${desvinculados} desvinculados` : ""} ·
                complete y guarde campo a campo
              </DialogDescription>
            </DialogHeader>

            {/* Filtro por centro de costo */}
            {centros.lista.length || centros.sinCentro ? (
              <select
                aria-label="Centro de costo"
                className={`${selectCls} max-w-[280px]`}
                value={centro}
                onChange={(e) => setCentro(e.target.value)}
              >
                <option value="">Todos los centros de costo</option>
                {centros.lista.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {centros.sinCentro ? (
                  <option value={SIN_CENTRO}>Sin centro de costo</option>
                ) : null}
              </select>
            ) : null}

            <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
              {cargando ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : trabajadoresVisibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin trabajadores activos
                  {centro ? " en este centro de costo" : " cargados"}.
                </p>
              ) : (
                trabajadoresVisibles.map((t) => {
                  const deTrab = faltantes.filter(
                    (f) => f.registro_id === t.id,
                  );
                  return (
                    <div key={t.id} className="rounded-lg border p-3">
                      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold">
                          {t.nombre}
                        </span>
                        <RutCopiable rut={t.rut} />
                        {t.sucursal ? (
                          <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                            {t.sucursal}
                          </span>
                        ) : null}
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {[
                          t.cargo,
                          t.tipo_contrato,
                          t.sueldo_base !== null
                            ? `$${formatMonto(t.sueldo_base)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Sin datos contractuales"}
                      </p>
                      {deTrab.length === 0 ? (
                        <p className="text-sm text-emerald-600">
                          Ficha completa. ✓
                        </p>
                      ) : (
                        <CamposEditables
                          items={deTrab}
                          catalogos={catalogos}
                          selectores={selectores}
                          onSaved={quitarFaltante}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
