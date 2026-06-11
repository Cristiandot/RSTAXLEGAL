"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, X } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { opcionesPeriodo } from "@/lib/periodos";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  claseEstado,
  type ConciliacionRow,
  type IvaEjecucionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  eliminarCambioIva,
  guardarConciliacion,
  registrarCambioIva,
} from "./actions";
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

const ESTADOS = [
  "Sin iniciar",
  "Descargando",
  "Listo para conciliar",
  "Conciliado",
];

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResumenCard({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: number;
  tono?: "ok" | "alerta";
}) {
  const color =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "alerta"
        ? "text-red-600"
        : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${color}`}>{valor}</div>
    </div>
  );
}

function BadgeKame({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-muted-foreground">—</span>;
  return estado === "ON" ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      ON
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
      OFF
    </Badge>
  );
}

export function ConciliacionClient({
  periodo,
  filas,
  usuarios,
  ivaEjecuciones,
  errorCarga,
}: {
  periodo: string;
  filas: ConciliacionRow[];
  usuarios: UsuarioOpcion[];
  ivaEjecuciones: IvaEjecucionRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [kameF, setKameF] = useState("");
  const [saludF, setSaludF] = useState("");
  const [respF, setRespF] = useState("");
  const [editando, setEditando] = useState<ConciliacionRow | null>(null);
  const [obsIva, setObsIva] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [ivaPendiente, startIva] = useTransition();

  const [orden, setOrden] = useState<Orden>(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && c.estado !== estadoF) return false;
      if (kameF && c.kame_cert_estado !== kameF) return false;
      if (saludF === "si" && !c.es_profesional_salud) return false;
      if (saludF === "no" && c.es_profesional_salud) return false;
      if (respF === "__SIN_ASIGNAR__") {
        if (c.responsable) return false;
      } else if (respF && c.responsable !== respF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: ConciliacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "kame": return c.kame_cert_estado;
        case "salud": return c.es_profesional_salud ? 0 : 1; // Salud primero en asc
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "compras": return c.fecha_compras_descargadas;
        case "ventas": return c.fecha_ventas_descargadas;
        case "conciliacion": return c.fecha_conciliacion_kame_ok;
        case "iva": return c.es_profesional_salud ? c.iva_salud_ejecuciones : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, kameF, saludF, respF, orden]);

  const resumen: {
    label: string;
    valor: number;
    tono?: "ok" | "alerta";
  }[] = [
    { label: "Total", valor: filas.length },
    {
      label: "Sin iniciar",
      valor: filas.filter((c) => c.estado === "Sin iniciar").length,
    },
    {
      label: "En curso",
      valor: filas.filter((c) =>
        ["Descargando", "Listo para conciliar"].includes(c.estado),
      ).length,
    },
    {
      label: "Conciliados",
      valor: filas.filter((c) => c.estado === "Conciliado").length,
      tono: "ok",
    },
    {
      label: "KAME OFF",
      valor: filas.filter((c) => c.kame_cert_estado === "OFF").length,
      tono: "alerta",
    },
    {
      label: "Sin asignar",
      valor: filas.filter((c) => !c.responsable).length,
    },
  ];

  const ivaDelEditando = editando
    ? ivaEjecuciones.filter((e) => e.cliente_id === editando.cliente_id)
    : [];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => {
      const v = fd.get(k);
      return v === null || v === "" ? null : String(v);
    };
    const ciclo = editando;
    startGuardar(async () => {
      const res = await guardarConciliacion({
        cicloId: ciclo.ciclo_id,
        clienteId: ciclo.cliente_id,
        responsableId: get("responsable"),
        kameCierre: get("kame_cierre"),
        fechaCompras: get("fecha_compras"),
        fechaVentas: get("fecha_ventas"),
        fechaConciliacion: get("fecha_conciliacion"),
        observaciones: get("observaciones"),
      });
      if (res.ok) {
        toast.success("Cambios guardados");
        setEditando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function onRegistrarIva() {
    if (!editando) return;
    const clienteId = editando.cliente_id;
    const obs = obsIva.trim();
    startIva(async () => {
      const res = await registrarCambioIva(clienteId, obs || null);
      if (res.ok) {
        toast.success("Cambio IVA registrado");
        setObsIva("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al registrar");
      }
    });
  }

  function onEliminarIva(id: string) {
    if (!window.confirm("¿Eliminar este registro?")) return;
    startIva(async () => {
      const res = await eliminarCambioIva(id);
      if (res.ok) {
        toast.success("Registro eliminado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al eliminar");
      }
    });
  }

  const respDefault = editando
    ? (usuarios.find((u) => u.nombre === editando.responsable)?.id ?? "")
    : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Conciliación C/V
        </h1>
        <p className="text-sm text-muted-foreground">
          Descargas SII de Compras/Ventas, revisión KAME y cambios IVA salud.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {resumen.map((r) => (
          <ResumenCard
            key={r.label}
            label={r.label}
            valor={r.valor}
            tono={r.tono}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Período"
          className={selectCls}
          value={periodo}
          onChange={(e) => router.push(`/conciliacion?periodo=${e.target.value}`)}
        >
          {opcionesPeriodo().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o RUT…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>

        <select
          aria-label="Estado"
          className={selectCls}
          value={estadoF}
          onChange={(e) => setEstadoF(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          aria-label="KAME"
          className={selectCls}
          value={kameF}
          onChange={(e) => setKameF(e.target.value)}
        >
          <option value="">KAME: todos</option>
          <option value="ON">KAME ON</option>
          <option value="OFF">KAME OFF</option>
        </select>

        <select
          aria-label="Salud"
          className={selectCls}
          value={saludF}
          onChange={(e) => setSaludF(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="si">Solo Salud (IVA semanal)</option>
          <option value="no">No salud</option>
        </select>

        <select
          aria-label="Responsable"
          className={selectCls}
          value={respF}
          onChange={(e) => setRespF(e.target.value)}
        >
          <option value="">Todos los responsables</option>
          <option value="__SIN_ASIGNAR__">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.nombre}>
              {u.nombre}
            </option>
          ))}
        </select>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} clientes
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[220px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="kame" orden={orden} setOrden={setOrden}>KAME</ThSort>
              <ThSort col="salud" orden={orden} setOrden={setOrden}>Salud</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="compras" orden={orden} setOrden={setOrden}>Compras</ThSort>
              <ThSort col="ventas" orden={orden} setOrden={setOrden}>Ventas</ThSort>
              <ThSort col="conciliacion" orden={orden} setOrden={setOrden}>Conciliación</ThSort>
              <ThSort col="iva" orden={orden} setOrden={setOrden}>IVA cambios</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.ciclo_id}
                  onClick={() => setEditando(c)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[220px] truncate"
                      title={c.razon_social}
                    >
                      {c.razon_social}
                    </span>
                  </TableCell>
                  <TableCell>{c.rut_empresa ?? "—"}</TableCell>
                  <TableCell>
                    <BadgeKame estado={c.kame_cert_estado} />
                  </TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      <Badge
                        variant="outline"
                        className="border-pink-200 bg-pink-50 text-pink-700"
                      >
                        Salud
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.responsable ?? "—"}</TableCell>
                  <TableCell>{formatFecha(c.fecha_compras_descargadas)}</TableCell>
                  <TableCell>{formatFecha(c.fecha_ventas_descargadas)}</TableCell>
                  <TableCell>{formatFecha(c.fecha_conciliacion_kame_ok)}</TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      c.iva_salud_ejecuciones > 0 ? (
                        <span>
                          <strong>{c.iva_salud_ejecuciones}</strong> cambios
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Sin cambios
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editando !== null}
        onOpenChange={(o) => {
          if (!o) {
            setEditando(null);
            setObsIva("");
          }
        }}
      >
        {editando ? (
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editando.razon_social}
              </DialogTitle>
              <DialogDescription>
                {[
                  editando.rut_empresa ? `RUT: ${editando.rut_empresa}` : null,
                  `Período ${editando.periodo}`,
                  `KAME actual: ${editando.kame_cert_estado ?? "—"}`,
                  editando.es_profesional_salud ? "PROFESIONAL DE SALUD" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            <form
              id="form-conciliacion"
              onSubmit={onSubmit}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="responsable">Responsable conciliación</Label>
                <select
                  id="responsable"
                  name="responsable"
                  className={selectCls}
                  defaultValue={respDefault}
                >
                  <option value="">Sin asignar</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="kame_cierre">KAME al cierre del mes</Label>
                <select
                  id="kame_cierre"
                  name="kame_cierre"
                  className={selectCls}
                  defaultValue={editando.kame_cert_estado_al_cierre ?? ""}
                >
                  <option value="">— No revisado aún —</option>
                  <option value="ON">ON (funciona OK)</option>
                  <option value="OFF">OFF (hay problemas)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_compras">Compras descargadas SII</Label>
                <Input
                  id="fecha_compras"
                  name="fecha_compras"
                  type="date"
                  defaultValue={editando.fecha_compras_descargadas ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_ventas">Ventas descargadas SII</Label>
                <Input
                  id="fecha_ventas"
                  name="fecha_ventas"
                  type="date"
                  defaultValue={editando.fecha_ventas_descargadas ?? ""}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="fecha_conciliacion">Conciliación KAME OK</Label>
                <Input
                  id="fecha_conciliacion"
                  name="fecha_conciliacion"
                  type="date"
                  defaultValue={editando.fecha_conciliacion_kame_ok ?? ""}
                />
              </div>

              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  name="observaciones"
                  rows={2}
                  defaultValue={editando.observaciones ?? ""}
                />
              </div>
            </form>

            {editando.es_profesional_salud ? (
              <div className="rounded-lg border border-pink-200 bg-pink-50/60 p-3">
                <div className="text-xs font-semibold tracking-wide text-pink-700 uppercase">
                  Cambios IVA recuperable → no recuperable (este período)
                </div>
                <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                  {ivaDelEditando.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      Sin cambios registrados este período.
                    </p>
                  ) : (
                    ivaDelEditando.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-start justify-between rounded-md bg-card px-2.5 py-1.5 text-sm"
                      >
                        <div>
                          <span className="font-medium">
                            {formatFecha(e.fecha_ejecutada)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {e.responsable_nombre ?? "Sin responsable"}
                          </span>
                          {e.observaciones ? (
                            <p className="text-xs text-muted-foreground">
                              {e.observaciones}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onEliminarIva(e.id)}
                          className="ml-2 shrink-0 rounded p-0.5 text-red-600 hover:bg-red-50"
                          title="Eliminar registro"
                          disabled={ivaPendiente}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Observación (opcional)"
                    className="h-8 bg-card text-sm"
                    value={obsIva}
                    onChange={(e) => setObsIva(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 bg-pink-700 hover:bg-pink-800"
                    onClick={onRegistrarIva}
                    disabled={ivaPendiente}
                  >
                    <Plus className="size-4" />
                    Registrar cambio
                  </Button>
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="form-conciliacion"
                disabled={guardando}
              >
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
