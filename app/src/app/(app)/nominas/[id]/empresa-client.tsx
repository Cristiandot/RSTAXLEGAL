"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Search, Users, Plus, X } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { TextoCopiable } from "@/components/texto-copiable";
import { Progreso } from "@/components/progreso";
import { EditorCampo } from "@/components/campos-editables";
import { formatFecha, formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  tipoCampo,
  type CampoDef,
  type Catalogos,
  type FaltanteRow,
} from "@/lib/onboarding";
import {
  agregarCarga,
  quitarCarga,
  type TrabajadorFichaRow,
  type CargaFamiliar,
} from "../actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const GENEROS_CARGA = ["Masculino", "Femenino"];
const PARENTESCOS = ["Hijo/a", "Cónyuge", "Conviviente civil", "Madre", "Padre", "Otro"];
const SIN_CENTRO = "__sin__";

export type EmpresaCabecera = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  regimen_tributario: string | null;
  giro: string | null;
  comuna: string | null;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  n_trabajadores_esperados: number | null;
  pct_trab: number | null;
  faltan_trab: number;
};

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

function faltanObligatorios(
  t: TrabajadorFichaRow,
  campos: CampoDef[],
): number {
  return campos.filter(
    (d) => d.obligatorio && aplicaCampo(d.campo, t.valores) && !t.valores[d.campo],
  ).length;
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{valor || "—"}</div>
    </div>
  );
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

      <div className="grid grid-cols-2 items-end gap-2 xl:grid-cols-[1fr_8.5rem_8.5rem_8rem_8.5rem_auto]">
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

export function EmpresaNominaClient({
  empresa,
  fichas,
  fichaCampos,
  catalogos,
}: {
  empresa: EmpresaCabecera;
  fichas: TrabajadorFichaRow[];
  fichaCampos: CampoDef[];
  catalogos: Catalogos;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [centro, setCentro] = useState("");
  const [selId, setSelId] = useState<string | null>(null);

  const camposPorGrupo = useMemo(() => {
    const m = new Map<string, CampoDef[]>();
    for (const c of fichaCampos) {
      const arr = m.get(c.grupo) ?? [];
      arr.push(c);
      m.set(c.grupo, arr);
    }
    return [...m.entries()];
  }, [fichaCampos]);

  const activos = useMemo(
    () => fichas.filter((t) => t.activo !== false),
    [fichas],
  );
  const desvinculados = fichas.length - activos.length;

  const centros = useMemo(() => {
    const s = new Set<string>();
    let sinCentro = false;
    for (const t of activos) {
      if (t.sucursal?.trim()) s.add(t.sucursal.trim());
      else sinCentro = true;
    }
    return { lista: [...s].sort(), sinCentro };
  }, [activos]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return activos.filter((t) => {
      if (centro === SIN_CENTRO && t.sucursal?.trim()) return false;
      if (centro && centro !== SIN_CENTRO && t.sucursal?.trim() !== centro)
        return false;
      if (q && !`${t.nombre} ${t.rut ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [activos, centro, buscar]);

  // Trabajador seleccionado: el elegido si sigue visible; si no, el primero
  // con datos pendientes (o el primero a secas).
  const sel = useMemo(() => {
    const porId = selId ? visibles.find((t) => t.id === selId) : undefined;
    if (porId) return porId;
    return (
      visibles.find((t) => faltanObligatorios(t, fichaCampos) > 0) ??
      visibles[0] ??
      null
    );
  }, [selId, visibles, fichaCampos]);

  function recargar() {
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Cabecera de la sociedad */}
      <div>
        <Link
          href="/nominas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Nóminas
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {empresa.razon_social}
          </h1>
          <RutCopiable rut={empresa.rut_empresa} />
          <span className="text-sm text-muted-foreground">
            {empresa.grupo_codigo ? `${empresa.grupo_codigo} — ` : ""}
            {empresa.grupo_nombre ?? "Sin cliente"}
          </span>
        </div>
      </div>

      <div className="card-soft rounded-xl bg-card p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Dato label="Régimen tributario" valor={empresa.regimen_tributario} />
          <Dato label="Giro" valor={empresa.giro} />
          <Dato label="Comuna" valor={empresa.comuna} />
          <Dato label="Contacto" valor={empresa.contacto_nombre} />
          <div>
            <div className="text-xs text-muted-foreground">Correo contacto</div>
            <div className="text-sm">
              <TextoCopiable texto={empresa.contacto_correo} etiqueta="Correo" />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              Dotación · % datos
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={
                  empresa.n_trabajadores_esperados !== null &&
                  activos.length < empresa.n_trabajadores_esperados
                    ? "font-semibold text-red-600"
                    : ""
                }
              >
                {activos.length}
                {empresa.n_trabajadores_esperados !== null
                  ? ` / ${empresa.n_trabajadores_esperados}`
                  : ""}
              </span>
              <Progreso pct={empresa.pct_trab} />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros de la nómina */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar trabajador…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        {centros.lista.length || centros.sinCentro ? (
          <select
            aria-label="Centro de costo"
            className={`${selectCls} max-w-[260px]`}
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
        <span className="ml-auto text-sm text-muted-foreground">
          {visibles.length} de {activos.length} trabajadores activos
          {desvinculados ? ` · ${desvinculados} desvinculados` : ""}
        </span>
      </div>

      {/* Maestro-detalle: lista de trabajadores + ficha */}
      {visibles.length === 0 ? (
        <div className="card-soft rounded-xl bg-card py-12 text-center text-muted-foreground">
          Sin trabajadores activos
          {centro || buscar ? " con este filtro" : " cargados"}.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Lista */}
          <div className="card-soft h-fit max-h-[75vh] overflow-y-auto rounded-xl bg-card p-2 lg:sticky lg:top-4">
            {visibles.map((t) => {
              const faltan = faltanObligatorios(t, fichaCampos);
              const activoSel = sel?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelId(t.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${
                    activoSel ? "bg-muted" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {t.nombre}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[t.rut, t.sucursal].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  {faltan === 0 ? (
                    <span className="text-sm text-emerald-600">✓</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                      {faltan}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Ficha del seleccionado */}
          {sel ? (
            <div className="card-soft space-y-4 rounded-xl bg-card p-4">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="flex items-center gap-1.5 text-lg font-semibold">
                    <Users className="size-4 text-muted-foreground" />
                    {sel.nombre}
                  </span>
                  <RutCopiable rut={sel.rut} />
                  {sel.sucursal ? (
                    <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                      {sel.sucursal}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    sel.cargo,
                    sel.tipo_contrato,
                    sel.sueldo_base !== null
                      ? `$${formatMonto(sel.sueldo_base)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sin datos contractuales"}
                </p>
              </div>

              {camposPorGrupo.map(([grupo, defs]) => {
                const visiblesDefs = defs.filter((d) =>
                  aplicaCampo(d.campo, sel.valores),
                );
                if (!visiblesDefs.length) return null;
                return (
                  <div key={grupo} className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-semibold">{grupo}</div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                      {visiblesDefs.map((def) => {
                        const v = sel.valores[def.campo];
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
                          registro_id: sel.id,
                          cliente_id: empresa.id,
                          campo: def.campo,
                          etiqueta: def.etiqueta,
                          grupo: def.grupo,
                          fuente: def.fuente,
                          registro_nombre: sel.nombre,
                          registro_rut: sel.rut,
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
                                def.selector
                                  ? catalogos[def.selector]
                                  : undefined
                              }
                              onSaved={recargar}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <CargasCard trabajador={sel} onCambio={recargar} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
