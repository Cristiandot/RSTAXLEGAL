"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Check, Undo2, ChevronRight } from "lucide-react";
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
  claseEstadoOnboarding,
  claseFuente,
  claseCompletitud,
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

/** Lista de campos faltantes agrupada por grupo, con su badge de fuente. */
function CamposFaltantes({ items }: { items: FaltanteRow[] }) {
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
    <div className="space-y-2">
      {porGrupo.map(([grupo, arr]) => (
        <div key={grupo}>
          <div className="text-xs font-medium text-muted-foreground">
            {grupo}
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {arr.map((c) => (
              <Badge
                key={c.campo}
                variant="outline"
                className={claseFuente(c.fuente)}
                title={`Fuente: ${c.fuente}`}
              >
                {c.etiqueta}
              </Badge>
            ))}
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
  errorCarga,
}: {
  empresas: EmpresaOnboardingRow[];
  porCampo: PorCampoRow[];
  cambios: CambioPropuestoRow[];
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

  const empresasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return empresas.filter((e) => {
      if (q) {
        const t = `${e.razon_social} ${e.rut_empresa ?? ""}`.toLowerCase();
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
            <span className="ml-auto text-sm text-muted-foreground">
              {empresasFiltradas.length} de {empresas.length} empresas
            </span>
          </div>

          <div className="card-soft rounded-xl bg-card">
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[260px]">Empresa</TableHead>
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
                      colSpan={8}
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
                      <TableCell className="font-medium">
                        <span
                          className="block max-w-[260px] truncate"
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
          <DialogContent className="sm:max-w-lg">
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
                  trabajadores
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
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
                        <CamposFaltantes items={ficha} />
                      </div>
                      {[...porTrab.values()].map((arr) => (
                        <div key={arr[0].registro_id}>
                          <div className="mb-1 text-sm font-semibold">
                            {arr[0].registro_nombre}{" "}
                            <span className="font-normal text-muted-foreground">
                              {arr[0].registro_rut ?? ""}
                            </span>
                          </div>
                          <CamposFaltantes items={arr} />
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
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {campoSel.etiqueta}
              </DialogTitle>
              <DialogDescription>
                {campoSel.faltan} {campoSel.entidad === "cliente" ? "empresas" : "trabajadores"}{" "}
                sin este dato · fuente {campoSel.fuente}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              {cargandoCampo ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
              ) : (
                <Table>
                  <TableBody>
                    {campoFaltantes.map((f) => (
                      <TableRow key={f.registro_id}>
                        <TableCell className="font-medium">
                          {f.registro_nombre}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {f.registro_rut ?? "—"}
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
    </div>
  );
}
