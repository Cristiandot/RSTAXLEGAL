"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, ChevronRight, ChevronDown, Users, Plus, X } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { Progreso } from "@/components/progreso";
import { EditorCampo } from "@/components/campos-editables";
import { comparar, type Orden } from "@/lib/ordenar";
import { formatFecha, formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
import {
  tipoCampo,
  type CampoDef,
  type Catalogos,
  type FaltanteRow,
  type GrupoClienteOpcion,
} from "@/lib/onboarding";
import {
  fichasDeEmpresa,
  agregarCarga,
  quitarCarga,
  type TrabajadorFichaRow,
  type CargaFamiliar,
} from "./actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GENEROS_CARGA = ["Masculino", "Femenino"];
const PARENTESCOS = ["Hijo/a", "Cónyuge", "Conviviente civil", "Madre", "Padre", "Otro"];

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

/** ¿Aplica el campo a este trabajador? (reglas condicionales del catálogo). */
function aplicaCampo(campo: string, valores: Record<string, string | null>): boolean {
  if (campo === "plan_isapre") {
    const salud = valores["salud"];
    return Boolean(salud) && salud !== "Fonasa";
  }
  if (campo === "afp") {
    const regimen = valores["regimen_previsional"];
    return !regimen || /afp/i.test(regimen);
  }
  return true;
}

/** Cargas familiares del trabajador: lista + agregar/quitar. */
function CargasCard({
  trabajador,
  onCambio,
}: {
  trabajador: TrabajadorFichaRow;
  onCambio: () => void;
}) {
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [genero, setGenero] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [trabajando, start] = useTransition();

  function agregar() {
    if (!nombre.trim() || trabajando) return;
    start(async () => {
      const carga: CargaFamiliar = {
        rut: rut || null,
        nombre,
        fecha_nacimiento: fecha || null,
        genero: genero || null,
        parentesco: parentesco || null,
      };
      const res = await agregarCarga(trabajador.id, carga);
      if (res.ok) {
        toast.success("Carga agregada");
        setRut("");
        setNombre("");
        setFecha("");
        setGenero("");
        setParentesco("");
        onCambio();
      } else toast.error(res.error ?? "Error al agregar la carga");
    });
  }

  function quitar(i: number) {
    start(async () => {
      const res = await quitarCarga(trabajador.id, i);
      if (res.ok) {
        toast.success("Carga quitada");
        onCambio();
      } else toast.error(res.error ?? "Error al quitar la carga");
    });
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 text-sm font-semibold">
        Cargas familiares{" "}
        {trabajador.cargas.length ? (
          <span className="font-normal text-muted-foreground">
            · {trabajador.cargas.length}
          </span>
        ) : null}
      </div>

      {trabajador.cargas.length ? (
        <div className="mb-3 space-y-1">
          {trabajador.cargas.map((c, i) => (
            <div
              key={`${c.rut ?? "c"}-${i}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-card px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.nombre ?? "—"}
              </span>
              <RutCopiable rut={c.rut} />
              <span className="text-xs text-muted-foreground">
                {[
                  c.parentesco,
                  c.genero,
                  c.fecha_nacimiento ? formatFecha(c.fecha_nacimiento) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                title="Quitar carga"
                disabled={trabajando}
                onClick={() => quitar(i)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Sin cargas registradas.
        </p>
      )}

      <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_8.5rem_8.5rem_8rem_8.5rem_auto]">
        <Input
          className="h-8 bg-card text-sm"
          placeholder="Nombre completo *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Input
          className="h-8 bg-card text-sm"
          placeholder="12.345.678-9"
          value={rut}
          onChange={(e) => setRut(e.target.value)}
        />
        <Input
          className="h-8 bg-card text-sm"
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <select
          aria-label="Género"
          className={`${selectCls} h-8`}
          value={genero}
          onChange={(e) => setGenero(e.target.value)}
        >
          <option value="">Género</option>
          {GENEROS_CARGA.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          aria-label="Parentesco"
          className={`${selectCls} h-8`}
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
        >
          <option value="">Parentesco</option>
          {PARENTESCOS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={trabajando || !nombre.trim()}
          onClick={agregar}
        >
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
    </div>
  );
}

/** Ficha completa (expandible) de un trabajador: llenos + faltantes editables. */
function FichaTrabajador({
  trabajador,
  empresaId,
  camposPorGrupo,
  catalogos,
  abierto,
  onToggle,
  onCambio,
}: {
  trabajador: TrabajadorFichaRow;
  empresaId: string;
  camposPorGrupo: [string, CampoDef[]][];
  catalogos: Catalogos;
  abierto: boolean;
  onToggle: () => void;
  onCambio: () => void;
}) {
  const t = trabajador;
  const faltanObligatorios = useMemo(
    () =>
      camposPorGrupo
        .flatMap(([, defs]) => defs)
        .filter(
          (d) =>
            d.obligatorio &&
            aplicaCampo(d.campo, t.valores) &&
            !t.valores[d.campo],
        ).length,
    [camposPorGrupo, t.valores],
  );

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 text-left"
        onClick={onToggle}
      >
        {abierto ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold">{t.nombre}</span>
        <RutCopiable rut={t.rut} />
        {t.sucursal ? (
          <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
            {t.sucursal}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {[
            t.cargo,
            t.tipo_contrato,
            t.sueldo_base !== null ? `$${formatMonto(t.sueldo_base)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {faltanObligatorios === 0 ? (
          <span className="text-sm text-emerald-600">✓</span>
        ) : (
          <span className="text-xs font-semibold text-red-600">
            faltan {faltanObligatorios}
          </span>
        )}
      </button>

      {abierto ? (
        <div className="space-y-3 border-t p-3">
          {camposPorGrupo.map(([grupo, defs]) => {
            const visibles = defs.filter((d) =>
              aplicaCampo(d.campo, t.valores),
            );
            if (!visibles.length) return null;
            return (
              <div key={grupo}>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {grupo}
                </div>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {visibles.map((def) => {
                    const v = t.valores[def.campo];
                    if (v !== null && v !== undefined) {
                      return (
                        <div key={def.campo}>
                          <div className="text-xs text-muted-foreground">
                            {def.etiqueta}
                          </div>
                          <div className="text-sm">
                            {tipoCampo(def.campo) === "fecha"
                              ? formatFecha(v)
                              : v}
                          </div>
                        </div>
                      );
                    }
                    const item: FaltanteRow = {
                      entidad: "trabajador",
                      registro_id: t.id,
                      cliente_id: empresaId,
                      campo: def.campo,
                      etiqueta: def.etiqueta,
                      grupo: def.grupo,
                      fuente: def.fuente,
                      registro_nombre: t.nombre,
                      registro_rut: t.rut,
                    };
                    return (
                      <div key={def.campo} className="flex flex-col gap-1">
                        <div className="text-xs text-muted-foreground">
                          {def.etiqueta}
                          {def.obligatorio ? " *" : ""}
                        </div>
                        <EditorCampo
                          item={item}
                          selector={def.selector}
                          opciones={
                            def.selector ? catalogos[def.selector] : undefined
                          }
                          onSaved={onCambio}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <CargasCard trabajador={t} onCambio={onCambio} />
        </div>
      ) : null}
    </div>
  );
}

const SIN_CENTRO = "__sin__";

export function NominasClient({
  empresas,
  grupos,
  catalogos,
  fichaCampos,
  errorCarga,
}: {
  empresas: NominaEmpresaRow[];
  grupos: GrupoClienteOpcion[];
  catalogos: Catalogos;
  fichaCampos: CampoDef[];
  errorCarga: string | null;
}) {
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);

  // Detalle: fichas de la nómina de la empresa
  const [empSel, setEmpSel] = useState<NominaEmpresaRow | null>(null);
  const [fichas, setFichas] = useState<TrabajadorFichaRow[]>([]);
  const [centro, setCentro] = useState("");
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [cargando, startCargar] = useTransition();

  const camposPorGrupo = useMemo(() => {
    const m = new Map<string, CampoDef[]>();
    for (const c of fichaCampos) {
      const arr = m.get(c.grupo) ?? [];
      arr.push(c);
      m.set(c.grupo, arr);
    }
    return [...m.entries()];
  }, [fichaCampos]);

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

  function cargarFichas(empresaId: string) {
    startCargar(async () => {
      setFichas(await fichasDeEmpresa(empresaId));
    });
  }

  function abrir(e: NominaEmpresaRow) {
    setEmpSel(e);
    setFichas([]);
    setCentro("");
    setAbiertoId(null);
    cargarFichas(e.id);
  }

  // Centros de costo (columna sucursal) presentes en la nómina activa.
  const centros = useMemo(() => {
    const s = new Set<string>();
    let sinCentro = false;
    for (const t of fichas) {
      if (t.activo === false) continue;
      if (t.sucursal?.trim()) s.add(t.sucursal.trim());
      else sinCentro = true;
    }
    return { lista: [...s].sort(), sinCentro };
  }, [fichas]);

  const trabajadoresVisibles = useMemo(() => {
    return fichas.filter((t) => {
      if (t.activo === false) return false;
      if (!centro) return true;
      if (centro === SIN_CENTRO) return !t.sucursal?.trim();
      return t.sucursal?.trim() === centro;
    });
  }, [fichas, centro]);

  const desvinculados = useMemo(
    () => fichas.filter((t) => t.activo === false).length,
    [fichas],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas — Nómina de trabajadores
        </h1>
        <p className="text-sm text-muted-foreground">
          Solo empresas con liquidaciones de sueldo. Este es el lugar para
          rellenar la ficha de cada trabajador, con filtro por centro de costo.
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

      {/* ============ Diálogo: fichas de la nómina ============ */}
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
                expanda un trabajador para completar su ficha
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

            <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
              {cargando && fichas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : trabajadoresVisibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin trabajadores activos
                  {centro ? " en este centro de costo" : " cargados"}.
                </p>
              ) : (
                trabajadoresVisibles.map((t) => (
                  <FichaTrabajador
                    key={t.id}
                    trabajador={t}
                    empresaId={empSel.id}
                    camposPorGrupo={camposPorGrupo}
                    catalogos={catalogos}
                    abierto={abiertoId === t.id}
                    onToggle={() =>
                      setAbiertoId(abiertoId === t.id ? null : t.id)
                    }
                    onCambio={() => cargarFichas(empSel.id)}
                  />
                ))
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
