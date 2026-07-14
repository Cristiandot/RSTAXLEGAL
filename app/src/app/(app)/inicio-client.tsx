"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  ExternalLink,
  History,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { formatFecha } from "@/lib/format";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  CANAL_LABEL,
  CANALES_TAREA,
  claseTipoGestion,
  diasDesde,
  TIPO_GESTION_HREF,
  TIPO_GESTION_LABEL,
  type GestionRow,
} from "@/lib/gestiones";
import type { UsuarioOpcion } from "@/lib/ciclos";
import {
  asignarEmpresaTarea,
  asignarGestion,
  completarTarea,
  crearTarea,
  editarTextoTarea,
} from "./actions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Color semántico del estado de la gestión (pendiente=ámbar, avanzada=celeste). */
function claseEstadoGestion(estado: string): string {
  switch (estado) {
    case "solicitada":
    case "solicitado":
    case "por_tramitar":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "generado":
    case "en_revision":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "aprobada":
    case "aprobado":
    case "enviada":
    case "enviado":
    case "tramitada":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rechazada":
    case "anulado":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

/** Mini indicador de carga de trabajo sobre la bandeja. */
function KpiTile({
  label,
  valor,
  alerta = false,
  activo = false,
  onClick,
}: {
  label: string;
  valor: number;
  alerta?: boolean;
  activo?: boolean;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`card-soft rounded-xl bg-card px-4 py-3 text-left transition ${
        onClick ? "cursor-pointer hover:-translate-y-0.5" : ""
      } ${activo ? "ring-2 ring-[var(--brand-teal,#17A2B8)]" : ""}`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-2xl font-semibold ${alerta && valor > 0 ? "text-red-600" : ""}`}
      >
        {valor}
      </div>
    </Comp>
  );
}


/** "2026-07-10" local de un timestamptz ISO. */
function fechaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}



export function InicioClient({
  pendientes,
  historial,
  usuarios,
  clientes,
  errorCarga,
}: {
  pendientes: GestionRow[];
  historial: GestionRow[];
  usuarios: UsuarioOpcion[];
  clientes: { id: string; razon_social: string; grupo_id: string | null }[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [respF, setRespF] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);
  const [orden, setOrden] = useState<Orden>(null);
  const [asignando, startAsignar] = useTransition();
  // Diálogo del botón "+": tarea manual con canal y plazo de entrega.
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [ntTitulo, setNtTitulo] = useState("");
  const [ntDetalle, setNtDetalle] = useState("");
  const [ntCliente, setNtCliente] = useState("");
  const [ntCanal, setNtCanal] = useState("dashboard");
  const [ntResp, setNtResp] = useState("");
  const [creando, startCrear] = useTransition();
  // Diálogo de edición de texto de un requerimiento (tarea).
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDetalle, setEditDetalle] = useState("");
  const [editando, startEditar] = useTransition();

  // Empresas agrupadas por cliente (grupo), para el desplegable de Empresa por
  // fila: al abrirlo se ofrecen todas las sociedades de ese cliente.
  const empresasPorGrupo = useMemo(() => {
    const m = new Map<string, { id: string; razon_social: string }[]>();
    for (const c of clientes) {
      if (!c.grupo_id) continue;
      const arr = m.get(c.grupo_id) ?? [];
      arr.push({ id: c.id, razon_social: c.razon_social });
      m.set(c.grupo_id, arr);
    }
    return m;
  }, [clientes]);

  const tiposPresentes = useMemo(() => {
    const s = new Set(pendientes.map((g) => g.tipo));
    return Object.keys(TIPO_GESTION_LABEL).filter((t) => s.has(t));
  }, [pendientes]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = pendientes.filter((g) => {
      if (tipoF && g.tipo !== tipoF) return false;
      if (respF === "sin" && g.responsable_id !== null) return false;
      if (respF && respF !== "sin" && g.responsable_id !== respF) return false;
      if (q) {
        const t = `${g.cliente ?? ""} ${g.cliente_codigo ?? ""} ${g.razon_social ?? ""} ${g.trabajador ?? ""} ${g.detalle ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      return true;
    });
    if (!orden) return out;
    const valor = (g: GestionRow): unknown => {
      switch (orden.col) {
        case "tipo": return TIPO_GESTION_LABEL[g.tipo] ?? g.tipo;
        case "cliente": return g.cliente;
        case "empresa": return g.razon_social;
        case "detalle": return g.trabajador ?? g.detalle;
        case "canal": return g.canal;
        case "recibida": return g.created_at;
        case "estado": return g.estado;
        case "responsable": return g.responsable;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [pendientes, buscar, tipoF, respF, orden]);

  const sinAsignar = pendientes.filter((g) => g.responsable_id === null).length;
  const atrasadas = pendientes.filter((g) => diasDesde(g.created_at) > 3).length;
  const nuevasSemana = pendientes.filter((g) => diasDesde(g.created_at) <= 7).length;

  function asignar(g: GestionRow, responsableId: string | null) {
    startAsignar(async () => {
      const res = await asignarGestion(g.fuente, g.gestion_id, responsableId);
      if (res.ok) {
        toast.success(responsableId ? "Gestión asignada" : "Asignación quitada");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al asignar");
      }
    });
  }

  function asignarEmpresa(g: GestionRow, clienteId: string | null) {
    startAsignar(async () => {
      const res = await asignarEmpresaTarea(g.gestion_id, clienteId);
      if (res.ok) {
        toast.success("Empresa actualizada");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al cambiar la empresa");
      }
    });
  }

  function abrirEdicion(g: GestionRow) {
    setEditId(g.gestion_id);
    setEditTitulo(g.titulo ?? "");
    setEditDetalle(g.detalle_raw ?? "");
    setEditOpen(true);
  }

  function guardarEdicion() {
    if (!editId) return;
    startEditar(async () => {
      const res = await editarTextoTarea(editId, editTitulo, editDetalle.trim() || null);
      if (res.ok) {
        toast.success("Requerimiento actualizado");
        setEditOpen(false);
        setEditId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al editar el requerimiento");
      }
    });
  }

  function crear() {
    startCrear(async () => {
      const res = await crearTarea({
        titulo: ntTitulo,
        detalle: ntDetalle.trim() || null,
        clienteId: ntCliente || null,
        canal: ntCanal,
        plazo: null,
        responsableId: ntResp || null,
      });
      if (res.ok) {
        toast.success("Tarea creada");
        setNuevaOpen(false);
        setNtTitulo("");
        setNtDetalle("");
        setNtCliente("");
        setNtCanal("dashboard");
        setNtResp("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al crear la tarea");
      }
    });
  }

  function completar(g: GestionRow, terminada: boolean) {
    startAsignar(async () => {
      const res = await completarTarea(g.gestion_id, terminada);
      if (res.ok) {
        toast.success(terminada ? "Tarea terminada" : "Tarea reabierta");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al actualizar la tarea");
      }
    });
  }

  function filaGestion(g: GestionRow, esHistorial: boolean) {
    const dias = diasDesde(g.created_at);
    const esTarea = g.fuente === "tareas_oficina";
    const empresasGrupo = g.grupo_id ? empresasPorGrupo.get(g.grupo_id) ?? [] : [];
    // La empresa se puede cambiar solo en requerimientos (tareas) cuyo cliente
    // (grupo) tenga empresas donde elegir.
    const puedeCambiarEmpresa = esTarea && !esHistorial && empresasGrupo.length > 0;
    // Si la empresa asignada no está en la lista (p.ej. inactiva), la incluimos
    // igual como opción para no perderla del selector.
    const faltaActual =
      g.cliente_id !== null && !empresasGrupo.some((e) => e.id === g.cliente_id);
    const href = `${TIPO_GESTION_HREF[g.tipo] ?? "/"}?gestion=${g.gestion_id}`;
    return (
      <TableRow
        key={`${g.fuente}-${g.gestion_id}`}
        onClick={esTarea ? undefined : () => router.push(href)}
        className={esTarea ? undefined : "cursor-pointer"}
      >
        <TableCell>
          <Badge variant="outline" className={claseTipoGestion(g.tipo)}>
            {TIPO_GESTION_LABEL[g.tipo] ?? g.tipo}
          </Badge>
        </TableCell>
        <TableCell className="font-medium">
          <span className="block max-w-[200px] truncate" title={g.cliente ?? ""}>
            {g.cliente ?? "—"}
            {g.cliente_codigo ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {g.cliente_codigo}
              </span>
            ) : null}
          </span>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {puedeCambiarEmpresa ? (
            <select
              aria-label="Empresa del requerimiento"
              className="h-8 max-w-[200px] rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={g.cliente_id ?? ""}
              disabled={asignando}
              onChange={(e) => asignarEmpresa(g, e.target.value || null)}
            >
              <option value="">— Sin empresa</option>
              {faltaActual ? (
                <option value={g.cliente_id ?? ""}>{g.razon_social}</option>
              ) : null}
              {empresasGrupo.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.razon_social}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="block max-w-[200px] truncate text-muted-foreground"
              title={g.razon_social ?? ""}
            >
              {g.razon_social ?? "—"}
            </span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <span
              className="block max-w-[240px] truncate"
              title={`${g.trabajador ?? ""} ${g.detalle ?? ""}`}
            >
              {g.trabajador ?? g.detalle ?? "—"}
              {g.trabajador && g.detalle ? (
                <span className="text-xs text-muted-foreground"> · {g.detalle}</span>
              ) : null}
            </span>
            {esTarea && !esHistorial ? (
              <button
                type="button"
                aria-label="Ver y editar texto del requerimiento"
                title="Ver / editar texto"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirEdicion(g);
                }}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <Search className="size-3.5" />
              </button>
            ) : null}
          </div>
        </TableCell>
        <TableCell>
          {g.canal ? (
            <Badge variant="outline" className="border-slate-200 bg-slate-50 font-normal text-slate-600">
              {CANAL_LABEL[g.canal] ?? g.canal}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <span className="text-sm tabular-nums">{formatFecha(fechaLocal(g.created_at))}</span>
          {!esHistorial ? (
            dias > 7 ? (
              <span className="ml-1.5 inline-flex rounded-full border border-red-200 bg-red-50 px-1.5 py-px text-[11px] font-semibold text-red-700">
                hace {dias} días
              </span>
            ) : (
              <span
                className={`ml-1.5 text-xs ${dias > 3 ? "font-medium text-amber-600" : "text-muted-foreground"}`}
              >
                {dias === 0 ? "hoy" : `hace ${dias} d`}
              </span>
            )
          ) : null}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={claseEstadoGestion(g.estado)}>
            {g.estado.replace(/_/g, " ")}
          </Badge>
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {esHistorial ? (
            <span className="text-sm">{g.responsable ?? "—"}</span>
          ) : (
            <div className="flex flex-col gap-0.5">
              <select
                aria-label="Asignar responsable"
                className="h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={g.responsable_id ?? ""}
                disabled={asignando}
                onChange={(e) => asignar(g, e.target.value || null)}
              >
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
              {g.asignado_at ? (
                <span className="text-[11px] text-muted-foreground">
                  Asignada el {formatFecha(fechaLocal(g.asignado_at))}
                </span>
              ) : null}
            </div>
          )}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          {esTarea ? (
            <button
              type="button"
              disabled={asignando}
              onClick={() => completar(g, !esHistorial)}
              className={`inline-flex items-center gap-1 text-sm font-medium hover:underline ${
                esHistorial ? "text-muted-foreground" : "text-emerald-600"
              }`}
              title={esHistorial ? "Reabrir la tarea" : "Marcar la tarea como terminada"}
            >
              <CheckCircle2 className="size-3.5" />
              {esHistorial ? "Reabrir" : "Terminar"}
            </button>
          ) : (
            <Link
              href={href}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-teal,#17A2B8)] hover:underline"
            >
              Abrir
              <ExternalLink className="size-3.5" />
            </Link>
          )}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Requerimientos de la oficina
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Todo lo que llega de los clientes, para asignar y trabajar. Clic en
            una fila para ir directo a la gestión.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={() => setNuevaOpen(true)}>
            <Plus className="size-4" />
            Nueva tarea
          </Button>
          {tiposPresentes.map((t) => {
            const n = pendientes.filter((g) => g.tipo === t).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTipoF(tipoF === t ? "" : t)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  tipoF === t ? "ring-2 ring-ring" : ""
                } ${claseTipoGestion(t)}`}
              >
                {TIPO_GESTION_LABEL[t]} {n}
              </button>
            );
          })}
        </div>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Gestiones pendientes" valor={pendientes.length} />
        <KpiTile
          label="Sin asignar"
          valor={sinAsignar}
          alerta
          activo={respF === "sin"}
          onClick={() => setRespF(respF === "sin" ? "" : "sin")}
        />
        <KpiTile label="Esperando más de 3 días" valor={atrasadas} alerta />
        <KpiTile label="Recibidas últimos 7 días" valor={nuevasSemana} />
      </div>

      <div className="space-y-3">
          <div className="card-soft rounded-xl bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente, trabajador o detalle…"
                className="h-9 w-64 bg-card pl-8"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
              />
            </div>
            <select
              aria-label="Tipo de gestión"
              className={selectCls}
              value={tipoF}
              onChange={(e) => setTipoF(e.target.value)}
            >
              <option value="">Todos los tipos</option>
              {tiposPresentes.map((t) => (
                <option key={t} value={t}>
                  {TIPO_GESTION_LABEL[t]}
                </option>
              ))}
            </select>
            <select
              aria-label="Responsable"
              className={selectCls}
              value={respF}
              onChange={(e) => setRespF(e.target.value)}
            >
              <option value="">Todos los responsables</option>
              <option value="sin">Sin asignar</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtradas.length} de {pendientes.length}
            </span>
            </div>
            <Table stickyHeader>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <ThSort col="tipo" orden={orden} setOrden={setOrden}>Tipo</ThSort>
                  <ThSort col="cliente" orden={orden} setOrden={setOrden}>Cliente</ThSort>
                  <ThSort col="empresa" orden={orden} setOrden={setOrden}>Empresa</ThSort>
                  <ThSort col="detalle" orden={orden} setOrden={setOrden}>Trabajador / detalle</ThSort>
                  <ThSort col="canal" orden={orden} setOrden={setOrden}>Canal</ThSort>
                  <ThSort col="recibida" orden={orden} setOrden={setOrden}>Recibida</ThSort>
                  <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
                  <ThSort col="responsable" orden={orden} setOrden={setOrden} className="w-[190px]">Responsable</ThSort>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {pendientes.length === 0
                        ? "Sin gestiones pendientes. La oficina está al día."
                        : "Sin resultados para estos filtros."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtradas.map((g) => filaGestion(g, false))
                )}
              </TableBody>
            </Table>
          </div>

          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerHistorial((v) => !v)}
            >
              <History className="size-4" />
              {verHistorial
                ? "Ocultar historial"
                : `Historial reciente (${historial.length})`}
            </Button>
            {verHistorial ? (
              <div className="card-soft mt-3 rounded-xl bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Tipo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Trabajador / detalle</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Recibida</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historial.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-8 text-center text-muted-foreground"
                        >
                          Sin gestiones terminadas recientes.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historial.map((g) => filaGestion(g, true))
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
      </div>

      {/* Diálogo de edición de texto de un requerimiento (tarea) */}
      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          if (!o) {
            setEditOpen(false);
            setEditId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Editar requerimiento</DialogTitle>
            <DialogDescription>
              Ajusta el texto de este requerimiento (correo, WhatsApp o creado a
              mano). No cambia el cliente ni la empresa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed_titulo">Título *</Label>
              <Input
                id="ed_titulo"
                value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed_detalle">Detalle</Label>
              <Textarea
                id="ed_detalle"
                rows={6}
                value={editDetalle}
                onChange={(e) => setEditDetalle(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false);
                setEditId(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={guardarEdicion} disabled={editando || !editTitulo.trim()}>
              {editando ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo del botón "+": tarea manual con canal y plazo de entrega */}
      <Dialog
        open={nuevaOpen}
        onOpenChange={(o) => {
          if (!o) setNuevaOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Nueva tarea</DialogTitle>
            <DialogDescription>
              Requerimiento que llegó por fuera del portal (correo, Wati,
              teléfono) o creado a mano por el equipo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt_titulo">Título *</Label>
              <Input
                id="nt_titulo"
                placeholder="Ej.: Certificado de renta para socio"
                value={ntTitulo}
                onChange={(e) => setNtTitulo(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nt_detalle">Detalle</Label>
              <Textarea
                id="nt_detalle"
                rows={2}
                value={ntDetalle}
                onChange={(e) => setNtDetalle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt_cliente">Cliente</Label>
                <select
                  id="nt_cliente"
                  className={selectCls}
                  value={ntCliente}
                  onChange={(e) => setNtCliente(e.target.value)}
                >
                  <option value="">Sin cliente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.razon_social}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt_canal">Canal</Label>
                <select
                  id="nt_canal"
                  className={selectCls}
                  value={ntCanal}
                  onChange={(e) => setNtCanal(e.target.value)}
                >
                  {CANALES_TAREA.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nt_resp">Responsable</Label>
                <select
                  id="nt_resp"
                  className={selectCls}
                  value={ntResp}
                  onChange={(e) => setNtResp(e.target.value)}
                >
                  <option value="">Sin asignar</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={crear} disabled={creando || !ntTitulo.trim()}>
              {creando ? "Creando…" : "Crear tarea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
