"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { RutCopiable } from "@/components/rut-copiable";
import {
  claseDias,
  claseEstado,
  type LiquidacionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import { guardarLiquidacion, marcarPaso } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  "En espera de detalle",
  "Envío de liquidaciones",
  "Envío previred",
  "Previred listo para pago RS",
  "Previred pagado",
  "DNP declarado",
];

// Pasos marcables con checkbox inline (columna en BD → etiqueta de columna)
const PASOS = [
  { columna: "fecha_consulta_enviada", label: "En espera detalle" },
  { columna: "fecha_detalle_recibido", label: "Envío liquidac." },
  { columna: "fecha_liquidaciones_enviadas", label: "Envío previred" },
] satisfies { columna: keyof LiquidacionRow; label: string }[];

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResumenCard({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

export function LiquidacionesClient({
  periodo,
  filas,
  usuarios,
  errorCarga,
}: {
  periodo: string;
  filas: LiquidacionRow[];
  usuarios: UsuarioOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [modF, setModF] = useState("");
  const [respF, setRespF] = useState("");
  const [editando, setEditando] = useState<LiquidacionRow | null>(null);
  const [modalidadModal, setModalidadModal] = useState("pago");
  const [guardando, startGuardar] = useTransition();
  const [marcando, startMarcar] = useTransition();

  const [orden, setOrden] = useState<Orden>(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""} ${c.previred_rut ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && c.estado !== estadoF) return false;
      if (modF && c.modalidad_previred !== modF) return false;
      if (respF && c.responsable !== respF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: LiquidacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "modalidad": return c.modalidad_previred;
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "plazo": return c.plazo_previred;
        case "dias": return c.dias_restantes_previred;
        case "pagado": return c.fecha_previred_pagado ?? c.fecha_dnp_declarado;
        case "monto": return c.monto_previred_total !== null ? Number(c.monto_previred_total) : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, modF, respF, orden]);

  const resumen = [
    { label: "Total", valor: filas.length },
    {
      label: "Sin iniciar",
      valor: filas.filter((c) => c.estado === "Sin iniciar").length,
    },
    {
      label: "Listo p/ pago RS",
      valor: filas.filter((c) => c.estado === "Previred listo para pago RS")
        .length,
    },
    {
      label: "Pagados",
      valor: filas.filter((c) => c.estado === "Previred pagado").length,
    },
    {
      label: "DNP declarados",
      valor: filas.filter((c) => c.estado === "DNP declarado").length,
    },
    {
      label: "Plazo ≤ 5 días",
      valor: filas.filter(
        (c) =>
          c.estado !== "Previred pagado" &&
          c.estado !== "DNP declarado" &&
          c.dias_restantes_previred !== null &&
          c.dias_restantes_previred <= 5,
      ).length,
    },
  ];

  function toggle(cicloId: string, columna: string, hecho: boolean) {
    startMarcar(async () => {
      const res = await marcarPaso(cicloId, columna, hecho);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error al actualizar");
    });
  }

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
      const res = await guardarLiquidacion({
        cicloId: ciclo.ciclo_id,
        clienteId: ciclo.cliente_id,
        responsableId: get("responsable"),
        modalidad: String(fd.get("modalidad") ?? "pago"),
        fechaPreviredListoPago: get("fecha_previred_listo_pago"),
        fechaPreviredPagado: get("fecha_previred_pagado"),
        fechaDnpDeclarado: get("fecha_dnp_declarado"),
        monto: get("monto"),
        observaciones: get("observaciones"),
        origResponsableDefaultId: ciclo.responsable_default_id,
        origModalidad: ciclo.modalidad_previred,
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

  const respDefault = editando
    ? (usuarios.find((u) => u.nombre === editando.responsable)?.id ?? "")
    : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Liquidaciones · Previred
        </h1>
        <p className="text-sm text-muted-foreground">
          Ciclo mensual de liquidaciones de sueldo y presentación en Previred.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {resumen.map((r) => (
          <ResumenCard key={r.label} label={r.label} valor={r.valor} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo
          periodo={periodo}
          onCambio={(p) => router.push(`/liquidaciones?periodo=${p}`)}
        />

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
          aria-label="Modalidad"
          className={selectCls}
          value={modF}
          onChange={(e) => setModF(e.target.value)}
        >
          <option value="">Todas las modalidades</option>
          <option value="pago">Pago</option>
          <option value="dnp">DNP</option>
        </select>

        <select
          aria-label="Responsable"
          className={selectCls}
          value={respF}
          onChange={(e) => setRespF(e.target.value)}
        >
          <option value="">Todos los responsables</option>
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
              <TableHead>RUT Previred</TableHead>
              <ThSort col="modalidad" orden={orden} setOrden={setOrden}>Modalidad</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="plazo" orden={orden} setOrden={setOrden}>Plazo</ThSort>
              <ThSort col="dias" orden={orden} setOrden={setOrden} className="text-center">Días</ThSort>
              {PASOS.map((p) => (
                <TableHead key={p.columna} className="text-center">
                  {p.label}
                </TableHead>
              ))}
              <ThSort col="pagado" orden={orden} setOrden={setOrden}>Pagado / DNP</ThSort>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Monto</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.ciclo_id}
                  onClick={() => {
                    setModalidadModal(c.modalidad_previred || "pago");
                    setEditando(c);
                  }}
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
                  <TableCell><RutCopiable rut={c.previred_rut} /></TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {c.modalidad_previred}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.responsable ?? "—"}</TableCell>
                  <TableCell>{formatFecha(c.plazo_previred)}</TableCell>
                  <TableCell
                    className={`text-center ${claseDias(c.estado, c.dias_restantes_previred)}`}
                  >
                    {c.dias_restantes_previred ?? "—"}
                  </TableCell>
                  {PASOS.map((p) => (
                    <TableCell
                      key={p.columna}
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={c[p.columna] !== null}
                        disabled={marcando}
                        onCheckedChange={(v) =>
                          toggle(c.ciclo_id, p.columna, v === true)
                        }
                        aria-label={p.label}
                      />
                    </TableCell>
                  ))}
                  <TableCell>{formatFecha(c.fecha_previred_pagado ?? c.fecha_dnp_declarado)}</TableCell>
                  <TableCell className="text-right">
                    {formatMonto(c.monto_previred_total)}
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
          if (!o) setEditando(null);
        }}
      >
        {editando ? (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editando.razon_social}
              </DialogTitle>
              <DialogDescription>
                {[
                  editando.previred_rut
                    ? `RUT Previred: ${editando.previred_rut}`
                    : null,
                  `Período ${editando.periodo}`,
                  editando.responsable_default
                    ? `Resp. por defecto: ${editando.responsable_default}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-muted-foreground">
              Los pasos En espera de detalle · Envío de liquidaciones · Envío
              previred se marcan con los checkboxes de la tabla.
            </p>

            <form
              id="form-liq"
              onSubmit={onSubmit}
              className="grid grid-cols-2 gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="modalidad">Modalidad</Label>
                <select
                  id="modalidad"
                  name="modalidad"
                  className={selectCls}
                  value={modalidadModal}
                  onChange={(e) => setModalidadModal(e.target.value)}
                >
                  <option value="pago">Pago (hasta día 13)</option>
                  <option value="dnp">DNP (hasta día 10)</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {modalidadModal === "dnp"
                    ? "Modalidad DNP: declara sin pago — registra abajo la fecha de declaración."
                    : "¿Este cliente declara sin pagar? Cambia la modalidad a DNP y aparecerá el campo «DNP declarado»."}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="responsable">Responsable</Label>
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

              {modalidadModal === "dnp" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fecha_dnp_declarado">DNP declarado</Label>
                    <Input
                      id="fecha_dnp_declarado"
                      name="fecha_dnp_declarado"
                      type="date"
                      defaultValue={editando.fecha_dnp_declarado ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="monto">Monto declarado</Label>
                    <Input
                      id="monto"
                      name="monto"
                      type="number"
                      inputMode="numeric"
                      defaultValue={editando.monto_previred_total ?? ""}
                    />
                  </div>
                  <input type="hidden" name="fecha_previred_listo_pago" value={editando.fecha_previred_listo_pago ?? ""} />
                  <input type="hidden" name="fecha_previred_pagado" value={editando.fecha_previred_pagado ?? ""} />
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fecha_previred_listo_pago">
                      Previred listo para pago RS
                    </Label>
                    <Input
                      id="fecha_previred_listo_pago"
                      name="fecha_previred_listo_pago"
                      type="date"
                      defaultValue={editando.fecha_previred_listo_pago ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="monto">Monto de pago</Label>
                    <Input
                      id="monto"
                      name="monto"
                      type="number"
                      inputMode="numeric"
                      defaultValue={editando.monto_previred_total ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fecha_previred_pagado">Previred pagado</Label>
                    <Input
                      id="fecha_previred_pagado"
                      name="fecha_previred_pagado"
                      type="date"
                      defaultValue={editando.fecha_previred_pagado ?? ""}
                    />
                  </div>
                  <input type="hidden" name="fecha_dnp_declarado" value={editando.fecha_dnp_declarado ?? ""} />
                </>
              )}

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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" form="form-liq" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
