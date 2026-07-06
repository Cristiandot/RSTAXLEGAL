"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Check, Undo2, ChevronRight, Plus, UserPlus } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  LABEL_ESTADO,
  ESTADOS_ONBOARDING,
  GRUPOS_CARTERA,
  PLACEHOLDER_LINEAS,
  claseEstadoOnboarding,
  claseFuente,
  claseCompletitud,
  tipoCampo,
  type Catalogos,
  type CatalogoOpcion,
  type GrupoClienteOpcion,
  type EmpresaOnboardingRow,
  type PorCampoRow,
  type CambioPropuestoRow,
  type FaltanteRow,
} from "@/lib/onboarding";
import {
  faltantesDeEmpresa,
  registrosFaltanCampo,
  setOnboardingEstado,
  aprobarCambio,
  devolverCambio,
  guardarCampo,
  crearEmpresa,
  crearCliente,
  type NuevaEmpresaInput,
} from "./actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Tab = "empresas" | "campos" | "validacion";

function StatCard({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

function Pct({ valor }: { valor: number | null }) {
  return (
    <span className={claseCompletitud(valor)}>
      {valor === null ? "—" : `${valor}%`}
    </span>
  );
}

/** Input inline para llenar un campo faltante y guardarlo directo a la ficha. */
function EditorCampo({
  item,
  selector,
  opciones,
  onSaved,
}: {
  item: FaltanteRow;
  selector: string | null;
  opciones?: CatalogoOpcion[];
  onSaved: () => void;
}) {
  const [valor, setValor] = useState("");
  const [saving, startSave] = useTransition();
  const tipo = tipoCampo(item.campo);

  function guardar() {
    if (!valor.trim() || saving) return;
    startSave(async () => {
      const res = await guardarCampo(
        item.entidad,
        item.registro_id,
        item.campo,
        valor,
      );
      if (res.ok) {
        toast.success(`${item.etiqueta}: guardado`);
        onSaved();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  return (
    <div className="flex w-full items-start gap-1.5">
      {selector ? (
        <select
          aria-label={item.etiqueta}
          className={`${selectCls} h-8 w-full min-w-0`}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        >
          <option value="">— Elegir —</option>
          {(opciones ?? []).map((o) => (
            <option key={o.codigo} value={o.codigo}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      ) : tipo === "lineas" ? (
        <Textarea
          rows={2}
          className="min-w-0 flex-1 bg-card text-sm"
          placeholder={PLACEHOLDER_LINEAS[item.campo] ?? ""}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      ) : (
        <Input
          type={
            tipo === "fecha" ? "date" : tipo === "numero" ? "number" : "text"
          }
          className="h-8 w-full min-w-0 bg-card text-sm"
          placeholder={
            tipo === "rut"
              ? "12.345.678-9"
              : tipo === "correo"
                ? "correo@dominio.cl"
                : item.etiqueta
          }
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
          }}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 px-2"
        title="Guardar"
        disabled={saving || !valor.trim()}
        onClick={guardar}
      >
        <Check className="size-4" />
      </Button>
    </div>
  );
}

/** Campos faltantes agrupados, cada uno editable en línea. */
function CamposEditables({
  items,
  catalogos,
  selectores,
  onSaved,
}: {
  items: FaltanteRow[];
  catalogos: Catalogos;
  selectores: Record<string, string | null>;
  onSaved: (f: FaltanteRow) => void;
}) {
  const porGrupo = useMemo(() => {
    const m = new Map<string, FaltanteRow[]>();
    for (const it of items) {
      const arr = m.get(it.grupo) ?? [];
      arr.push(it);
      m.set(it.grupo, arr);
    }
    return [...m.entries()];
  }, [items]);

  if (!items.length)
    return (
      <p className="text-sm text-emerald-600">Sin campos faltantes. ✓</p>
    );

  return (
    <div className="space-y-3">
      {porGrupo.map(([grupo, arr]) => (
        <div key={grupo}>
          <div className="text-xs font-medium text-muted-foreground">
            {grupo}
          </div>
          <div className="mt-1.5 space-y-1.5">
            {arr.map((c) => {
              const sel = selectores[`${c.entidad}:${c.campo}`] ?? null;
              return (
                <div
                  key={`${c.registro_id}:${c.campo}`}
                  className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-2"
                >
                  <Badge
                    variant="outline"
                    className={`${claseFuente(c.fuente)} mt-1 max-w-full justify-start`}
                    title={`${c.etiqueta} · Fuente: ${c.fuente}`}
                  >
                    <span className="truncate">{c.etiqueta}</span>
                  </Badge>
                  <EditorCampo
                    item={c}
                    selector={sel}
                    opciones={sel ? catalogos[sel] : undefined}
                    onSaved={() => onSaved(c)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function OnboardingClient({
  empresas,
  porCampo,
  cambios,
  catalogos,
  selectores,
  grupos,
  errorCarga,
}: {
  empresas: EmpresaOnboardingRow[];
  porCampo: PorCampoRow[];
  cambios: CambioPropuestoRow[];
  catalogos: Catalogos;
  selectores: Record<string, string | null>;
  grupos: GrupoClienteOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("empresas");
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [entidadF, setEntidadF] = useState("");
  const [marcando, startMarcar] = useTransition();
  const [accionando, startAccion] = useTransition();

  // Drill-down empresa
  const [empSel, setEmpSel] = useState<EmpresaOnboardingRow | null>(null);
  const [empFaltantes, setEmpFaltantes] = useState<FaltanteRow[]>([]);
  const [cargandoEmp, startEmp] = useTransition();

  // Drill-down campo
  const [campoSel, setCampoSel] = useState<PorCampoRow | null>(null);
  const [campoFaltantes, setCampoFaltantes] = useState<FaltanteRow[]>([]);
  const [cargandoCampo, startCampo] = useTransition();

  // Devolver cambio
  const [devolviendo, setDevolviendo] = useState<CambioPropuestoRow | null>(
    null,
  );
  const [obs, setObs] = useState("");

  // Nueva empresa (cuelga de un cliente existente o de uno nuevo)
  const NUEVA_VACIA: NuevaEmpresaInput = {
    rut_empresa: "",
    razon_social: "",
    nuevo_cliente_letra: "D",
  };
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [nueva, setNueva] = useState<NuevaEmpresaInput>(NUEVA_VACIA);
  // "" = sin elegir · "__nuevo__" = cliente nuevo · uuid = grupo existente
  const [clienteSel, setClienteSel] = useState("");
  const [creando, startCrear] = useTransition();

  function setN(k: keyof NuevaEmpresaInput, v: string) {
    setNueva((p) => ({ ...p, [k]: v }));
  }

  const clienteListo =
    clienteSel === "__nuevo__"
      ? Boolean(nueva.nuevo_cliente_nombre?.trim())
      : Boolean(clienteSel);

  // Nuevo cliente (solo, sin empresa todavía)
  const [nuevoCliOpen, setNuevoCliOpen] = useState(false);
  const [nuevoCliNombre, setNuevoCliNombre] = useState("");
  const [nuevoCliLetra, setNuevoCliLetra] = useState("D");
  const [nuevoCliCorreo, setNuevoCliCorreo] = useState("");
  const [nuevoCliFono, setNuevoCliFono] = useState("");
  const [creandoCli, startCrearCli] = useTransition();

  function crearClienteSolo() {
    startCrearCli(async () => {
      const res = await crearCliente(
        nuevoCliNombre,
        nuevoCliLetra,
        nuevoCliCorreo,
        nuevoCliFono,
      );
      if (res.ok) {
        toast.success(
          `Cliente creado como ${res.codigo}. Su carpeta OneDrive se creará automáticamente en unos minutos.`,
        );
        setNuevoCliOpen(false);
        setNuevoCliNombre("");
        setNuevoCliCorreo("");
        setNuevoCliFono("");
        router.refresh();
      } else toast.error(res.error ?? "Error al crear el cliente");
    });
  }

  function crear() {
    startCrear(async () => {
      const input: NuevaEmpresaInput = {
        ...nueva,
        grupo_id: clienteSel === "__nuevo__" ? undefined : clienteSel,
        nuevo_cliente_nombre:
          clienteSel === "__nuevo__" ? nueva.nuevo_cliente_nombre : undefined,
        nuevo_cliente_letra:
          clienteSel === "__nuevo__" ? nueva.nuevo_cliente_letra : undefined,
      };
      const res = await crearEmpresa(input);
      if (res.ok) {
        toast.success(
          "Empresa creada. La carpeta OneDrive se creará automáticamente en unos minutos.",
        );
        setNuevaOpen(false);
        setNueva(NUEVA_VACIA);
        setClienteSel("");
        router.refresh();
      } else toast.error(res.error ?? "Error al crear la empresa");
    });
  }

  /** Al guardar un campo desde un diálogo: sacarlo de la lista local y refrescar contadores. */
  function guardadoEnEmpresa(f: FaltanteRow) {
    setEmpFaltantes((prev) =>
      prev.filter((x) => !(x.registro_id === f.registro_id && x.campo === f.campo)),
    );
    router.refresh();
  }
  function guardadoEnCampo(f: FaltanteRow) {
    setCampoFaltantes((prev) =>
      prev.filter((x) => x.registro_id !== f.registro_id),
    );
    router.refresh();
  }

  const empresasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return empresas.filter((e) => {
      if (q) {
        const t =
          `${e.razon_social} ${e.rut_empresa ?? ""} ${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && e.onboarding_estado !== estadoF) return false;
      return true;
    });
  }, [empresas, buscar, estadoF]);

  const camposFiltrados = useMemo(() => {
    const out = porCampo.filter((c) => !entidadF || c.entidad === entidadF);
    return [...out].sort((a, b) => b.faltan - a.faltan);
  }, [porCampo, entidadF]);

  const pctProm = useMemo(() => {
    const vals = empresas
      .map((e) => e.pct_empresa)
      .filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [empresas]);

  function abrirEmpresa(e: EmpresaOnboardingRow) {
    setEmpSel(e);
    setEmpFaltantes([]);
    startEmp(async () => {
      setEmpFaltantes(await faltantesDeEmpresa(e.cliente_id));
    });
  }

  function abrirCampo(c: PorCampoRow) {
    setCampoSel(c);
    setCampoFaltantes([]);
    startCampo(async () => {
      setCampoFaltantes(await registrosFaltanCampo(c.entidad, c.campo));
    });
  }

  function cambiarEstado(clienteId: string, estado: string) {
    startMarcar(async () => {
      const res = await setOnboardingEstado(clienteId, estado);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error al cambiar la etapa");
    });
  }

  function aprobar(id: string) {
    startAccion(async () => {
      const res = await aprobarCambio(id);
      if (res.ok) {
        toast.success("Cambio aprobado y aplicado");
        router.refresh();
      } else toast.error(res.error ?? "Error al aprobar");
    });
  }

  function confirmarDevolver() {
    if (!devolviendo) return;
    const id = devolviendo.id;
    startAccion(async () => {
      const res = await devolverCambio(id, obs);
      if (res.ok) {
        toast.success("Cambio devuelto al cliente");
        setDevolviendo(null);
        setObs("");
        router.refresh();
      } else toast.error(res.error ?? "Error al devolver");
    });
  }

  const tabBtn = (t: Tab, label: string, badge?: number) => (
    <button
      onClick={() => setTab(t)}
      className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition ${
        tab === t
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      {badge ? (
        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">
          {badge}
        </span>
      ) : null}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Onboarding y calidad de datos
        </h1>
        <p className="text-sm text-muted-foreground">
          Estado de completitud de los datos de empresas y trabajadores, por
          campo y por empresa, y cola de validación de lo que cargan los
          clientes.
        </p>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {tabBtn("empresas", "Empresas")}
        {tabBtn("campos", "Por campo")}
        {tabBtn("validacion", "Validación", cambios.length)}
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {/* ====================== EMPRESAS ====================== */}
      {tab === "empresas" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Empresas" valor={empresas.length} />
            <StatCard
              label="% ficha promedio"
              valor={pctProm === null ? "—" : `${pctProm}%`}
            />
            <StatCard
              label="En revisión"
              valor={
                empresas.filter((e) => e.onboarding_estado === "en_revision")
                  .length
              }
            />
            <StatCard
              label="Completas"
              valor={
                empresas.filter((e) => e.onboarding_estado === "completo").length
              }
            />
            <StatCard
              label="Ficha < 60%"
              valor={
                empresas.filter(
                  (e) => e.pct_empresa !== null && e.pct_empresa < 60,
                ).length
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa o RUT…"
                className="h-9 w-56 bg-card pl-8"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
            <select
              aria-label="Etapa"
              className={selectCls}
              value={estadoF}
              onChange={(e) => setEstadoF(e.target.value)}
            >
              <option value="">Todas las etapas</option>
              {ESTADOS_ONBOARDING.map((s) => (
                <option key={s} value={s}>
                  {LABEL_ESTADO[s]}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => setNuevoCliOpen(true)}
            >
              <UserPlus className="size-4" /> Nuevo cliente
            </Button>
            <Button size="sm" className="h-9" onClick={() => setNuevaOpen(true)}>
              <Plus className="size-4" /> Nueva empresa
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">
              {empresasFiltradas.length} de {empresas.length} empresas
            </span>
          </div>

          <div className="card-soft rounded-xl bg-card">
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[170px]">Cliente</TableHead>
                  <TableHead className="w-[240px]">Empresa</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-center">% Ficha</TableHead>
                  <TableHead className="text-center">Trab.</TableHead>
                  <TableHead className="text-center">% Trab.</TableHead>
                  <TableHead className="text-center">Campos faltan</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                ) : (
                  empresasFiltradas.map((e) => (
                    <TableRow
                      key={e.cliente_id}
                      className="cursor-pointer"
                      onClick={() => abrirEmpresa(e)}
                    >
                      <TableCell>
                        {e.grupo_codigo || e.grupo_nombre ? (
                          <span
                            className="block max-w-[170px] truncate text-sm"
                            title={`${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.trim()}
                          >
                            {e.grupo_codigo ? (
                              <span className="font-medium">
                                {e.grupo_codigo}
                              </span>
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
                          className="block max-w-[240px] truncate"
                          title={e.razon_social}
                        >
                          {e.razon_social}
                        </span>
                      </TableCell>
                      <TableCell>
                        <RutCopiable rut={e.rut_empresa} />
                      </TableCell>
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <select
                          aria-label="Etapa"
                          className={`${selectCls} h-8`}
                          value={e.onboarding_estado}
                          disabled={marcando}
                          onChange={(ev) =>
                            cambiarEstado(e.cliente_id, ev.target.value)
                          }
                        >
                          {ESTADOS_ONBOARDING.map((s) => (
                            <option key={s} value={s}>
                              {LABEL_ESTADO[s]}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Pct valor={e.pct_empresa} />
                      </TableCell>
                      <TableCell className="text-center">{e.n_trab}</TableCell>
                      <TableCell className="text-center">
                        <Pct valor={e.pct_trab} />
                      </TableCell>
                      <TableCell className="text-center">
                        {e.faltan_empresa + e.faltan_trab}
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
        </div>
      ) : null}

      {/* ====================== POR CAMPO ====================== */}
      {tab === "campos" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Entidad"
              className={selectCls}
              value={entidadF}
              onChange={(e) => setEntidadF(e.target.value)}
            >
              <option value="">Empresas y trabajadores</option>
              <option value="cliente">Solo empresas</option>
              <option value="trabajador">Solo trabajadores</option>
            </select>
            <span className="ml-auto text-sm text-muted-foreground">
              Atacar en lotes: ordenado por mayor cantidad de faltantes.
            </span>
          </div>

          <div className="card-soft rounded-xl bg-card">
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Entidad</TableHead>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead className="text-center">Faltan</TableHead>
                  <TableHead className="text-center">Requeridos</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {camposFiltrados.map((c) => (
                  <TableRow
                    key={`${c.entidad}:${c.campo}`}
                    className={`cursor-pointer ${c.faltan === 0 ? "opacity-50" : ""}`}
                    onClick={() => c.faltan > 0 && abrirCampo(c)}
                  >
                    <TableCell className="capitalize text-muted-foreground">
                      {c.entidad}
                    </TableCell>
                    <TableCell>{c.grupo}</TableCell>
                    <TableCell className="font-medium">{c.etiqueta}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={claseFuente(c.fuente)}>
                        {c.fuente}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {c.faltan === 0 ? (
                        <span className="text-emerald-600">0</span>
                      ) : (
                        <span className="text-red-600">{c.faltan}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {c.requeridos}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.faltan > 0 ? <ChevronRight className="size-4" /> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      {/* ====================== VALIDACIÓN ====================== */}
      {tab === "validacion" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cambios cargados o corregidos por los clientes. No pasan a oficial
            hasta que el equipo los aprueba. Aprobar aplica el valor a la ficha;
            devolver lo rechaza con una observación.
          </p>
          {cambios.length === 0 ? (
            <div className="card-soft rounded-xl bg-card py-12 text-center text-muted-foreground">
              No hay cambios pendientes de validación.
            </div>
          ) : (
            <div className="card-soft overflow-hidden rounded-xl bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Empresa</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Propuesto</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cambios.map((c) => (
                    <TableRow key={c.id} className="hover:bg-transparent">
                      <TableCell className="font-medium">
                        {c.razon_social ?? "—"}
                        <span className="block text-xs capitalize text-muted-foreground">
                          {c.entidad}
                        </span>
                      </TableCell>
                      <TableCell>{c.etiqueta}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.valor_actual ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {c.valor_propuesto ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {c.origen}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={accionando}
                            onClick={() => aprobar(c.id)}
                          >
                            <Check className="size-4" /> Aprobar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={accionando}
                            onClick={() => {
                              setDevolviendo(c);
                              setObs("");
                            }}
                          >
                            <Undo2 className="size-4" /> Devolver
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : null}

      {/* ============ Diálogo: detalle de empresa ============ */}
      <Dialog
        open={empSel !== null}
        onOpenChange={(o) => {
          if (!o) setEmpSel(null);
        }}
      >
        {empSel ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {empSel.razon_social}
              </DialogTitle>
              <DialogDescription>
                <Badge
                  variant="outline"
                  className={claseEstadoOnboarding(empSel.onboarding_estado)}
                >
                  {LABEL_ESTADO[empSel.onboarding_estado]}
                </Badge>
                <span className="ml-2">
                  Ficha <Pct valor={empSel.pct_empresa} /> · {empSel.n_trab}{" "}
                  trabajadores · complete y guarde campo a campo
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {cargandoEmp ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : (
                (() => {
                  const ficha = empFaltantes.filter(
                    (f) => f.entidad === "cliente",
                  );
                  const trabs = empFaltantes.filter(
                    (f) => f.entidad === "trabajador",
                  );
                  const porTrab = new Map<string, FaltanteRow[]>();
                  for (const t of trabs) {
                    const arr = porTrab.get(t.registro_id) ?? [];
                    arr.push(t);
                    porTrab.set(t.registro_id, arr);
                  }
                  return (
                    <>
                      <div>
                        <div className="mb-1 text-sm font-semibold">
                          Ficha de la empresa
                        </div>
                        <CamposEditables
                          items={ficha}
                          catalogos={catalogos}
                          selectores={selectores}
                          onSaved={guardadoEnEmpresa}
                        />
                      </div>
                      {[...porTrab.values()].map((arr) => (
                        <div key={arr[0].registro_id}>
                          <div className="mb-1 text-sm font-semibold">
                            {arr[0].registro_nombre}{" "}
                            <span className="font-normal text-muted-foreground">
                              {arr[0].registro_rut ?? ""}
                            </span>
                          </div>
                          <CamposEditables
                            items={arr}
                            catalogos={catalogos}
                            selectores={selectores}
                            onSaved={guardadoEnEmpresa}
                          />
                        </div>
                      ))}
                      {ficha.length === 0 && trabs.length === 0 ? (
                        <p className="text-sm text-emerald-600">
                          Esta empresa tiene todos sus datos requeridos. ✓
                        </p>
                      ) : null}
                    </>
                  );
                })()
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ============ Diálogo: detalle de campo ============ */}
      <Dialog
        open={campoSel !== null}
        onOpenChange={(o) => {
          if (!o) setCampoSel(null);
        }}
      >
        {campoSel ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {campoSel.etiqueta}
              </DialogTitle>
              <DialogDescription>
                {campoFaltantes.length || campoSel.faltan}{" "}
                {campoSel.entidad === "cliente" ? "empresas" : "trabajadores"}{" "}
                sin este dato · fuente {campoSel.fuente} · llene y guarde uno a
                uno
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {cargandoCampo ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : campoFaltantes.length === 0 ? (
                <p className="text-sm text-emerald-600">
                  Todos los registros tienen este dato. ✓
                </p>
              ) : (
                <div className="space-y-2">
                  {campoFaltantes.map((f) => {
                    const sel = selectores[`${f.entidad}:${f.campo}`] ?? null;
                    return (
                      <div
                        key={f.registro_id}
                        className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)] items-start gap-2"
                      >
                        <div className="pt-1">
                          <div
                            className="truncate text-sm font-medium"
                            title={f.registro_nombre}
                          >
                            {f.registro_nombre}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {f.registro_rut ?? "—"}
                          </div>
                        </div>
                        <EditorCampo
                          item={f}
                          selector={sel}
                          opciones={sel ? catalogos[sel] : undefined}
                          onSaved={() => guardadoEnCampo(f)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ============ Diálogo: devolver cambio ============ */}
      <Dialog
        open={devolviendo !== null}
        onOpenChange={(o) => {
          if (!o) setDevolviendo(null);
        }}
      >
        {devolviendo ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Devolver cambio al cliente
              </DialogTitle>
              <DialogDescription>
                {devolviendo.etiqueta} · {devolviendo.razon_social ?? ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="obs">Observación (qué corregir)</Label>
              <Textarea
                id="obs"
                rows={3}
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Ej.: el RUT no corresponde, falta el dígito verificador…"
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDevolviendo(null)}
              >
                Cancelar
              </Button>
              <Button disabled={accionando} onClick={confirmarDevolver}>
                {accionando ? "Devolviendo…" : "Devolver"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ============ Diálogo: nuevo cliente ============ */}
      <Dialog open={nuevoCliOpen} onOpenChange={setNuevoCliOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Nuevo cliente</DialogTitle>
            <DialogDescription>
              El cliente agrupa una o más empresas. Se le asigna el
              correlativo siguiente de su letra y su carpeta OneDrive se crea
              automáticamente; las empresas se agregan después con &ldquo;Nueva
              empresa&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-nombre">Nombre del cliente *</Label>
              <Input
                id="nc-nombre"
                placeholder="Ej.: Domingo Undurraga"
                value={nuevoCliNombre}
                onChange={(e) => setNuevoCliNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nuevoCliNombre.trim())
                    crearClienteSolo();
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nc-letra">Letra de cartera *</Label>
              <select
                id="nc-letra"
                className={selectCls}
                value={nuevoCliLetra}
                onChange={(e) => setNuevoCliLetra(e.target.value)}
              >
                {GRUPOS_CARTERA.map((g) => (
                  <option key={g.codigo} value={g.codigo}>
                    {g.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nc-correo">Correo</Label>
                <Input
                  id="nc-correo"
                  type="email"
                  placeholder="correo@dominio.cl"
                  value={nuevoCliCorreo}
                  onChange={(e) => setNuevoCliCorreo(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nc-fono">Teléfono</Label>
                <Input
                  id="nc-fono"
                  placeholder="+56 9 …"
                  value={nuevoCliFono}
                  onChange={(e) => setNuevoCliFono(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevoCliOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={creandoCli || !nuevoCliNombre.trim()}
              onClick={crearClienteSolo}
            >
              {creandoCli ? "Creando…" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Diálogo: nueva empresa ============ */}
      <Dialog open={nuevaOpen} onOpenChange={setNuevaOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-heading">Nueva empresa</DialogTitle>
            <DialogDescription>
              Toda empresa cuelga de un <span className="font-medium">cliente</span>{" "}
              (que puede tener varias). Si el cliente es nuevo, se le asigna el
              correlativo siguiente de su letra y su carpeta OneDrive se crea
              automáticamente; la empresa queda en{" "}
              <span className="font-medium">pendiente de contacto</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="ne-cliente">Cliente *</Label>
              <select
                id="ne-cliente"
                className={selectCls}
                value={clienteSel}
                onChange={(e) => setClienteSel(e.target.value)}
              >
                <option value="">— Elegir cliente —</option>
                <option value="__nuevo__">➕ Cliente nuevo…</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.codigo ? `${g.codigo} — ` : ""}
                    {g.nombre}
                  </option>
                ))}
              </select>
            </div>
            {clienteSel === "__nuevo__" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-cliente-nombre">
                    Nombre del cliente nuevo *
                  </Label>
                  <Input
                    id="ne-cliente-nombre"
                    placeholder="Ej.: Domingo Undurraga"
                    value={nueva.nuevo_cliente_nombre ?? ""}
                    onChange={(e) => setN("nuevo_cliente_nombre", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-letra">Letra de cartera *</Label>
                  <select
                    id="ne-letra"
                    className={selectCls}
                    value={nueva.nuevo_cliente_letra}
                    onChange={(e) => setN("nuevo_cliente_letra", e.target.value)}
                  >
                    {GRUPOS_CARTERA.map((g) => (
                      <option key={g.codigo} value={g.codigo}>
                        {g.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-cli-correo">Correo del cliente</Label>
                  <Input
                    id="ne-cli-correo"
                    type="email"
                    placeholder="correo@dominio.cl"
                    value={nueva.nuevo_cliente_correo ?? ""}
                    onChange={(e) => setN("nuevo_cliente_correo", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-cli-fono">Teléfono del cliente</Label>
                  <Input
                    id="ne-cli-fono"
                    placeholder="+56 9 …"
                    value={nueva.nuevo_cliente_telefono ?? ""}
                    onChange={(e) => setN("nuevo_cliente_telefono", e.target.value)}
                  />
                </div>
              </>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-rut">RUT empresa *</Label>
              <Input
                id="ne-rut"
                placeholder="76.123.456-7"
                value={nueva.rut_empresa}
                onChange={(e) => setN("rut_empresa", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-razon">Razón social *</Label>
              <Input
                id="ne-razon"
                value={nueva.razon_social}
                onChange={(e) => setN("razon_social", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-fantasia">Nombre de fantasía</Label>
              <Input
                id="ne-fantasia"
                value={nueva.nombre_fantasia ?? ""}
                onChange={(e) => setN("nombre_fantasia", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-tipo">Tipo de sociedad</Label>
              <select
                id="ne-tipo"
                className={selectCls}
                value={nueva.tipo_sociedad ?? ""}
                onChange={(e) => setN("tipo_sociedad", e.target.value)}
              >
                <option value="">— Elegir —</option>
                {(catalogos.tipo_sociedad ?? []).map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-regimen">Régimen tributario</Label>
              <select
                id="ne-regimen"
                className={selectCls}
                value={nueva.regimen_tributario ?? ""}
                onChange={(e) => setN("regimen_tributario", e.target.value)}
              >
                <option value="">— Elegir —</option>
                {(catalogos.regimen_tributario ?? []).map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-giro">Giro</Label>
              <Input
                id="ne-giro"
                value={nueva.giro ?? ""}
                onChange={(e) => setN("giro", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-comuna">Comuna</Label>
              <select
                id="ne-comuna"
                className={selectCls}
                value={nueva.comuna ?? ""}
                onChange={(e) => setN("comuna", e.target.value)}
              >
                <option value="">— Elegir —</option>
                {(catalogos.comuna ?? []).map((o) => (
                  <option key={o.codigo} value={o.codigo}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-domicilio">Domicilio</Label>
              <Input
                id="ne-domicilio"
                value={nueva.domicilio ?? ""}
                onChange={(e) => setN("domicilio", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-contacto">Persona de contacto</Label>
              <Input
                id="ne-contacto"
                value={nueva.contacto_nombre ?? ""}
                onChange={(e) => setN("contacto_nombre", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-correo">Correo de contacto</Label>
              <Input
                id="ne-correo"
                type="email"
                value={nueva.contacto_correo ?? ""}
                onChange={(e) => setN("contacto_correo", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ne-fono">Teléfono de contacto</Label>
              <Input
                id="ne-fono"
                value={nueva.contacto_telefono ?? ""}
                onChange={(e) => setN("contacto_telefono", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevaOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                creando ||
                !clienteListo ||
                !nueva.razon_social.trim() ||
                !nueva.rut_empresa.trim()
              }
              onClick={crear}
            >
              {creando ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
