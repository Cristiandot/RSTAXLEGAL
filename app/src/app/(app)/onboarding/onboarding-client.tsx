"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Check, Undo2, Plus, UserPlus, FolderCheck, FolderClock } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { TextoCopiable } from "@/components/texto-copiable";
import { ThSort } from "@/components/th-sort";
import { comparar, type Orden } from "@/lib/ordenar";
import { formatFecha } from "@/lib/format";
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
  GRUPOS_CARTERA,
  type AltaEmpresaRow,
  type Catalogos,
  type GrupoClienteOpcion,
  type CambioPropuestoRow,
} from "@/lib/onboarding";
import {
  aprobarCambio,
  devolverCambio,
  crearEmpresa,
  crearCliente,
  type NuevaEmpresaInput,
} from "./actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Tab = "altas" | "validacion";

/** Carpeta OneDrive de la empresa: nombre real, o el de su cliente, o pendiente. */
function CarpetaCell({ e }: { e: AltaEmpresaRow }) {
  if (e.carpeta_onedrive)
    return (
      <span
        className="flex max-w-[340px] items-center gap-1.5 text-sm"
        title={e.carpeta_onedrive}
      >
        <FolderCheck className="size-3.5 shrink-0 text-emerald-600" />
        <span className="truncate">{e.carpeta_onedrive}</span>
      </span>
    );
  if (e.carpeta_solicitada_at)
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 text-amber-700"
        title="El proceso local la crea en la próxima pasada (máx. 15 min)"
      >
        <FolderClock className="size-3.5" /> Pendiente
      </Badge>
    );
  if (e.grupo_carpeta)
    return (
      <span
        className="flex max-w-[340px] items-center gap-1.5 text-sm text-muted-foreground"
        title={`Carpeta del cliente: ${e.grupo_carpeta} (subcarpeta de la empresa no identificada)`}
      >
        <FolderClock className="size-3.5 shrink-0 text-amber-500" />
        <span className="truncate">{e.grupo_carpeta}\…</span>
      </span>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

export function OnboardingClient({
  empresas,
  grupos,
  cambios,
  catalogos,
  errorCarga,
}: {
  empresas: AltaEmpresaRow[];
  grupos: GrupoClienteOpcion[];
  cambios: CambioPropuestoRow[];
  catalogos: Catalogos;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("altas");
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);
  const [accionando, startAccion] = useTransition();

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
  // Servicios que definen los ciclos mensuales de la empresa.
  const [haceF29, setHaceF29] = useState(true);
  const [haceLiq, setHaceLiq] = useState(false);
  const [nTrab, setNTrab] = useState("");
  const [creando, startCrear] = useTransition();

  // Nuevo cliente (solo, sin empresa todavía)
  const [nuevoCliOpen, setNuevoCliOpen] = useState(false);
  const [nuevoCliNombre, setNuevoCliNombre] = useState("");
  const [nuevoCliLetra, setNuevoCliLetra] = useState("D");
  const [nuevoCliCorreo, setNuevoCliCorreo] = useState("");
  const [nuevoCliFono, setNuevoCliFono] = useState("");
  const [creandoCli, startCrearCli] = useTransition();

  function setN(k: keyof NuevaEmpresaInput, v: string) {
    setNueva((p) => ({ ...p, [k]: v }));
  }

  const clienteListo =
    clienteSel === "__nuevo__"
      ? Boolean(nueva.nuevo_cliente_nombre?.trim())
      : Boolean(clienteSel);

  const empresasFiltradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const filtradas = empresas.filter((e) => {
      if (q) {
        const t =
          `${e.razon_social} ${e.rut_empresa ?? ""} ${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""} ${e.correo ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (clienteF === "__sin__" && e.grupo_id) return false;
      if (clienteF && clienteF !== "__sin__" && e.grupo_id !== clienteF)
        return false;
      return true;
    });
    if (!orden) return filtradas; // orden del servidor: alta más reciente primero
    const val = (e: AltaEmpresaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
        case "alta":
          return e.created_at;
        default:
          return null;
      }
    };
    return [...filtradas].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, orden]);

  function crear() {
    startCrear(async () => {
      const input: NuevaEmpresaInput = {
        ...nueva,
        grupo_id: clienteSel === "__nuevo__" ? undefined : clienteSel,
        nuevo_cliente_nombre:
          clienteSel === "__nuevo__" ? nueva.nuevo_cliente_nombre : undefined,
        nuevo_cliente_letra:
          clienteSel === "__nuevo__" ? nueva.nuevo_cliente_letra : undefined,
        hace_f29: haceF29,
        hace_liquidaciones: haceLiq,
        n_trabajadores_esperados: haceLiq ? Number(nTrab) : undefined,
      };
      const res = await crearEmpresa(input);
      if (res.ok) {
        toast.success(
          "Empresa creada. La carpeta OneDrive se creará automáticamente en unos minutos.",
        );
        setNuevaOpen(false);
        setNueva(NUEVA_VACIA);
        setClienteSel("");
        setHaceF29(true);
        setHaceLiq(false);
        setNTrab("");
        router.refresh();
      } else toast.error(res.error ?? "Error al crear la empresa");
    });
  }

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
          Onboarding
        </h1>
        <p className="text-sm text-muted-foreground">
          Incorporación de clientes y empresas: alta con carpeta OneDrive
          automática, y validación de lo que cargan los clientes. El avance de
          las fichas se controla en Clientes.
        </p>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {tabBtn("altas", "Altas")}
        {tabBtn("validacion", "Validación", cambios.length)}
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {/* ====================== ALTAS ====================== */}
      {tab === "altas" ? (
        <div className="space-y-4">
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
                  <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[190px]">
                    Cliente
                  </ThSort>
                  <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[260px]">
                    Empresa
                  </ThSort>
                  <TableHead>RUT</TableHead>
                  <TableHead>Carpeta OneDrive</TableHead>
                  <TableHead>Correo contacto</TableHead>
                  <ThSort col="alta" orden={orden} setOrden={setOrden}>
                    Alta
                  </ThSort>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                ) : (
                  empresasFiltradas.map((e) => (
                    <TableRow key={e.id} className="hover:bg-transparent">
                      <TableCell>
                        {e.grupo_codigo || e.grupo_nombre ? (
                          <span
                            className="block max-w-[190px] truncate text-sm"
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
                          className="block max-w-[260px] truncate"
                          title={e.razon_social}
                        >
                          {e.razon_social}
                        </span>
                      </TableCell>
                      <TableCell>
                        <RutCopiable rut={e.rut_empresa} />
                      </TableCell>
                      <TableCell>
                        <CarpetaCell e={e} />
                      </TableCell>
                      <TableCell>
                        <TextoCopiable
                          texto={e.correo}
                          etiqueta="Correo"
                          className="max-w-[220px]"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFecha(e.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
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
              <Button variant="outline" onClick={() => setDevolviendo(null)}>
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
              automáticamente.
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
            <div className="rounded-lg border bg-muted/40 p-3 sm:col-span-2">
              <div className="mb-2 text-sm font-semibold">Servicios</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-f29">¿Requiere F29? *</Label>
                  <select
                    id="ne-f29"
                    className={selectCls}
                    value={haceF29 ? "si" : "no"}
                    onChange={(e) => setHaceF29(e.target.value === "si")}
                  >
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ne-liq">¿Liquidaciones de sueldo? *</Label>
                  <select
                    id="ne-liq"
                    className={selectCls}
                    value={haceLiq ? "si" : "no"}
                    onChange={(e) => setHaceLiq(e.target.value === "si")}
                  >
                    <option value="no">No</option>
                    <option value="si">Sí</option>
                  </select>
                </div>
                {haceLiq ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ne-ntrab">N° de trabajadores *</Label>
                    <Input
                      id="ne-ntrab"
                      type="number"
                      min={1}
                      placeholder="Ej.: 8"
                      value={nTrab}
                      onChange={(e) => setNTrab(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
              {haceLiq ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  La dotación declarada se contrasta con las liquidaciones
                  cargadas cada mes, para que no se pase ninguna.
                </p>
              ) : null}
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
                !nueva.rut_empresa.trim() ||
                (haceLiq && !(Number(nTrab) >= 1))
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
