"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ChevronRight, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThSort } from "@/components/th-sort";
import { TextoCopiable } from "@/components/texto-copiable";
import { RutCopiable } from "@/components/rut-copiable";
import { Progreso } from "@/components/progreso";
import { comparar, type Orden } from "@/lib/ordenar";
import { EditorCampo } from "@/components/campos-editables";
import {
  claseFuente,
  type Catalogos,
  type ClienteResumenRow,
  type EmpresaDeGrupo,
  type FaltanteRow,
  type PorCampoRow,
} from "@/lib/onboarding";
import {
  registrosFaltanCampo,
  actualizarContactoCliente,
} from "../onboarding/actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Tab = "clientes" | "campos";

function StatCard({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

export function ClientesClient({
  clientes,
  empresasDeGrupo,
  porCampo,
  catalogos,
  selectores,
  errorCarga,
}: {
  clientes: ClienteResumenRow[];
  empresasDeGrupo: Record<string, EmpresaDeGrupo[]>;
  porCampo: PorCampoRow[];
  catalogos: Catalogos;
  selectores: Record<string, string | null>;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("clientes");
  const [buscar, setBuscar] = useState("");
  const [orden, setOrden] = useState<Orden>(null);
  const [entidadF, setEntidadF] = useState("");

  // Detalle de cliente (empresas básicas)
  const [cliSel, setCliSel] = useState<ClienteResumenRow | null>(null);

  // Correo editable dentro del detalle
  const [correo, setCorreo] = useState("");
  const [guardandoContacto, startContacto] = useTransition();

  // Drill-down por campo
  const [campoSel, setCampoSel] = useState<PorCampoRow | null>(null);
  const [campoFaltantes, setCampoFaltantes] = useState<FaltanteRow[]>([]);
  const [cargandoCampo, startCampo] = useTransition();

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = clientes.filter((c) => {
      if (!q) return true;
      const t =
        `${c.codigo ?? ""} ${c.nombre} ${c.correo ?? ""}`.toLowerCase();
      return t.includes(q);
    });
    if (!orden) return out; // por código (orden del servidor)
    const val = (c: ClienteResumenRow): unknown => {
      switch (orden.col) {
        case "codigo":
          return c.codigo;
        case "nombre":
          return c.nombre;
        case "empresas":
          return c.n_empresas;
        case "pct":
          return c.pct;
        case "faltan":
          return c.faltan;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [clientes, buscar, orden]);

  const camposFiltrados = useMemo(() => {
    const out = porCampo.filter((c) => !entidadF || c.entidad === entidadF);
    return [...out].sort((a, b) => b.faltan - a.faltan);
  }, [porCampo, entidadF]);

  const pctProm = useMemo(() => {
    const vals = clientes
      .map((c) => c.pct)
      .filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [clientes]);

  function abrirCliente(c: ClienteResumenRow) {
    setCliSel(c);
    setCorreo(c.correo ?? "");
  }

  function abrirCampo(c: PorCampoRow) {
    setCampoSel(c);
    setCampoFaltantes([]);
    startCampo(async () => {
      setCampoFaltantes(await registrosFaltanCampo(c.entidad, c.campo));
    });
  }

  function guardarContacto() {
    if (!cliSel) return;
    const id = cliSel.grupo_id;
    startContacto(async () => {
      const res = await actualizarContactoCliente(id, correo);
      if (res.ok) {
        toast.success("Correo del cliente guardado");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
    });
  }

  function quitarFaltanteCampo(f: FaltanteRow) {
    setCampoFaltantes((prev) => prev.filter((x) => x.registro_id !== f.registro_id));
    router.refresh();
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition ${
        tab === t
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Clientes
        </h1>
        <p className="text-sm text-muted-foreground">
          Datos simples de cada cliente y checklist de completitud de las
          fichas de sus empresas y trabajadores, para ir rellenando.
        </p>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {tabBtn("clientes", "Clientes")}
        {tabBtn("campos", "Por campo")}
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {/* ====================== CLIENTES ====================== */}
      {tab === "clientes" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Clientes" valor={clientes.length} />
            <StatCard
              label="% completado promedio"
              valor={pctProm === null ? "—" : `${pctProm}%`}
            />
            <StatCard
              label="Completos (100%)"
              valor={clientes.filter((c) => c.pct === 100).length}
            />
            <StatCard
              label="Bajo 60%"
              valor={clientes.filter((c) => c.pct !== null && c.pct < 60).length}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente…"
                className="h-9 w-56 bg-card pl-8"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtrados.length} de {clientes.length} clientes
            </span>
          </div>

          <div className="card-soft rounded-xl bg-card">
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ThSort col="codigo" orden={orden} setOrden={setOrden} className="w-[80px]">
                    Código
                  </ThSort>
                  <ThSort col="nombre" orden={orden} setOrden={setOrden} className="w-[220px]">
                    Cliente
                  </ThSort>
                  <TableHead>Correo</TableHead>
                  <ThSort col="empresas" orden={orden} setOrden={setOrden} className="text-center">
                    Empresas
                  </ThSort>
                  <ThSort col="pct" orden={orden} setOrden={setOrden}>
                    % Completado
                  </ThSort>
                  <ThSort col="faltan" orden={orden} setOrden={setOrden} className="text-center">
                    Faltan
                  </ThSort>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtrados.map((c) => (
                    <TableRow
                      key={c.grupo_id}
                      className="cursor-pointer"
                      onClick={() => abrirCliente(c)}
                    >
                      <TableCell className="font-medium">
                        {c.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span
                          className="block max-w-[220px] truncate"
                          title={c.nombre}
                        >
                          {c.nombre}
                        </span>
                      </TableCell>
                      <TableCell>
                        <TextoCopiable
                          texto={c.correo}
                          etiqueta="Correo"
                          className="max-w-[240px]"
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {c.n_empresas}
                      </TableCell>
                      <TableCell>
                        <Progreso pct={c.pct} />
                      </TableCell>
                      <TableCell className="text-center">
                        {c.faltan === 0 ? (
                          <span className="text-emerald-600">0</span>
                        ) : (
                          <span className="font-semibold text-red-600">
                            {c.faltan}
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
                      {c.entidad === "cliente" ? "empresa" : c.entidad}
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

      {/* ============ Diálogo: detalle de cliente (checklist) ============ */}
      <Dialog
        open={cliSel !== null}
        onOpenChange={(o) => {
          if (!o) setCliSel(null);
        }}
      >
        {cliSel ? (
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {cliSel.codigo ? `${cliSel.codigo} — ` : ""}
                {cliSel.nombre}
              </DialogTitle>
              <DialogDescription>
                {cliSel.n_empresas}{" "}
                {cliSel.n_empresas === 1 ? "empresa" : "empresas"} · completado{" "}
                {cliSel.pct === null ? "—" : `${cliSel.pct}%`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {/* Datos simples del cliente */}
              <div className="rounded-lg border bg-muted/40 p-3">
                {cliSel.carpeta_onedrive ? (
                  <p
                    className="mb-2 truncate text-xs text-muted-foreground"
                    title={cliSel.carpeta_onedrive}
                  >
                    Carpeta OneDrive: {cliSel.carpeta_onedrive}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="cli-correo" className="text-xs">
                      Correo del cliente
                    </Label>
                    <Input
                      id="cli-correo"
                      className="h-8 bg-card text-sm"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={guardandoContacto}
                    onClick={guardarContacto}
                  >
                    <Save className="size-4" /> Guardar
                  </Button>
                </div>
              </div>

              {/* Empresas del cliente (datos básicos; el detalle vive en /empresas) */}
              <div>
                <div className="mb-1 text-sm font-semibold">Empresas</div>
                {(empresasDeGrupo[cliSel.grupo_id] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Este cliente no tiene empresas registradas.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Empresa</TableHead>
                        <TableHead>RUT</TableHead>
                        <TableHead className="text-center">F29</TableHead>
                        <TableHead className="text-center">Previred</TableHead>
                        <TableHead>% Completado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(empresasDeGrupo[cliSel.grupo_id] ?? []).map((emp) => (
                        <TableRow key={emp.id} className="hover:bg-transparent">
                          <TableCell className="font-medium">
                            <span
                              className="block max-w-[200px] truncate"
                              title={emp.razon_social}
                            >
                              {emp.razon_social}
                            </span>
                          </TableCell>
                          <TableCell>
                            <RutCopiable rut={emp.rut_empresa} />
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {emp.hace_f29 ? (
                              <span className="font-medium text-emerald-600">
                                Sí
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {emp.hace_liquidaciones ? (
                              <span
                                className="font-medium text-emerald-600"
                                title="Trabajadores activos de la sociedad"
                              >
                                Sí · {emp.n_trab_activos} trab.
                              </span>
                            ) : (
                              <span className="text-muted-foreground">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Progreso pct={emp.pct} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ============ Diálogo: detalle de campo (lotes) ============ */}
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
                          onSaved={() => quitarFaltanteCampo(f)}
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
    </div>
  );
}
