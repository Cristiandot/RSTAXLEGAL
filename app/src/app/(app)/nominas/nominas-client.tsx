"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, ChevronRight, Users } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";
import { formatFecha, formatMonto } from "@/lib/format";
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
import { nominaDeEmpresa, type TrabajadorNominaRow } from "../empresas/actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type NominaEmpresaRow = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  hace_liquidaciones: boolean | null;
  n_trabajadores_esperados: number | null;
  n_trab_activos: number;
  n_trab_total: number;
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
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [soloConNomina, setSoloConNomina] = useState(true);
  const [orden, setOrden] = useState<Orden>(null);

  // Detalle: nómina de la empresa
  const [empSel, setEmpSel] = useState<NominaEmpresaRow | null>(null);
  const [nomina, setNomina] = useState<TrabajadorNominaRow[]>([]);
  const [cargando, startCargar] = useTransition();

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = empresas.filter((e) => {
      if (soloConNomina && !e.hace_liquidaciones && e.n_trab_total === 0)
        return false;
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
        case "declarados":
          return e.n_trabajadores_esperados;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, soloConNomina, orden]);

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
    startCargar(async () => {
      setNomina(await nominaDeEmpresa(e.id));
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas — Nómina de trabajadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Revisión de la nómina de cada empresa: dotación activa vs. declarada
          y el detalle contractual y previsional de cada trabajador.
        </p>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Empresas con nómina" valor={filtradas.length} />
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
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={soloConNomina}
            onChange={(e) => setSoloConNomina(e.target.checked)}
          />
          Solo con nómina
        </label>
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
              <TableHead className="text-center">Previred</TableHead>
              <ThSort col="activos" orden={orden} setOrden={setOrden} className="text-center">
                Activos / Declarados
              </ThSort>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
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
                    {e.hace_liquidaciones ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Sí
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Dotacion e={e} />
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

      {/* ============ Diálogo: nómina de la empresa ============ */}
      <Dialog
        open={empSel !== null}
        onOpenChange={(o) => {
          if (!o) setEmpSel(null);
        }}
      >
        {empSel ? (
          <DialogContent className="sm:max-w-4xl">
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
                {empSel.n_trab_total > empSel.n_trab_activos
                  ? ` · ${empSel.n_trab_total - empSel.n_trab_activos} desvinculados`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {cargando ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : nomina.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin trabajadores cargados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Trabajador</TableHead>
                      <TableHead>RUT</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Contrato</TableHead>
                      <TableHead>Jornada</TableHead>
                      <TableHead>Ingreso</TableHead>
                      <TableHead className="text-right">Sueldo base</TableHead>
                      <TableHead>AFP</TableHead>
                      <TableHead>Salud</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nomina.map((t) => (
                      <TableRow
                        key={t.id}
                        className={`hover:bg-transparent ${t.activo === false ? "opacity-50" : ""}`}
                      >
                        <TableCell className="font-medium">
                          {t.nombre}
                          {t.activo === false ? (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              (desvinculado)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <RutCopiable rut={t.rut} />
                        </TableCell>
                        <TableCell>{t.cargo ?? "—"}</TableCell>
                        <TableCell>{t.tipo_contrato ?? "—"}</TableCell>
                        <TableCell>
                          {t.jornada_tipo ?? "—"}
                          {t.horas_semanales !== null
                            ? ` · ${t.horas_semanales}h`
                            : ""}
                        </TableCell>
                        <TableCell>
                          {t.fecha_ingreso ? formatFecha(t.fecha_ingreso) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.sueldo_base === null
                            ? "—"
                            : `$${formatMonto(t.sueldo_base)}`}
                        </TableCell>
                        <TableCell>{t.afp ?? "—"}</TableCell>
                        <TableCell>
                          {t.salud ?? "—"}
                          {t.plan_isapre ? (
                            <span className="block text-xs text-muted-foreground">
                              {t.plan_isapre}
                            </span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
