"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { opcionesPeriodo } from "@/lib/periodos";
import {
  claseDias,
  claseEstado,
  type LiquidacionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import { guardarLiquidacion } from "./actions";
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
  "En espera de detalle",
  "Procesando liquidaciones",
  "Pendiente Previred",
  "Previred enviado",
  "Previred listo para pago RS",
  "Previred pagado",
];

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
  const [guardando, startGuardar] = useTransition();

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""} ${c.previred_rut ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && c.estado !== estadoF) return false;
      if (modF && c.modalidad_previred !== modF) return false;
      if (respF && c.responsable !== respF) return false;
      return true;
    });
  }, [filas, buscar, estadoF, modF, respF]);

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
      label: "Plazo ≤ 5 días",
      valor: filas.filter(
        (c) =>
          c.estado !== "Previred pagado" &&
          c.dias_restantes_previred !== null &&
          c.dias_restantes_previred <= 5,
      ).length,
    },
  ];

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
        fechaConsulta: get("fecha_consulta"),
        fechaDetalle: get("fecha_detalle"),
        fechaLiquidaciones: get("fecha_liquidaciones"),
        fechaPrevired: get("fecha_previred"),
        fechaPreviredListoPago: get("fecha_previred_listo_pago"),
        fechaPreviredPagado: get("fecha_previred_pagado"),
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {resumen.map((r) => (
          <ResumenCard key={r.label} label={r.label} valor={r.valor} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Período"
          className={selectCls}
          value={periodo}
          onChange={(e) =>
            router.push(`/liquidaciones?periodo=${e.target.value}`)
          }
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
              <TableHead className="w-[220px]">Cliente</TableHead>
              <TableHead>RUT Previred</TableHead>
              <TableHead>Modalidad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Plazo</TableHead>
              <TableHead className="text-center">Días</TableHead>
              <TableHead>Consulta</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Liquidac.</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={13}
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
                  <TableCell>{c.previred_rut ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="uppercase">
                      {c.modalidad_previred}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={claseEstado(c.estado)}
                    >
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
                  <TableCell>{formatFecha(c.fecha_consulta_enviada)}</TableCell>
                  <TableCell>{formatFecha(c.fecha_detalle_recibido)}</TableCell>
                  <TableCell>
                    {formatFecha(c.fecha_liquidaciones_enviadas)}
                  </TableCell>
                  <TableCell>
                    {formatFecha(c.fecha_previred_presentada)}
                  </TableCell>
                  <TableCell>
                    {formatFecha(c.fecha_previred_pagado)}
                  </TableCell>
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
                  defaultValue={editando.modalidad_previred || "pago"}
                >
                  <option value="pago">Pago (hasta día 13)</option>
                  <option value="dnp">DNP (hasta día 10)</option>
                </select>
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_consulta">Consulta enviada</Label>
                <Input
                  id="fecha_consulta"
                  name="fecha_consulta"
                  type="date"
                  defaultValue={editando.fecha_consulta_enviada ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_detalle">Detalle recibido</Label>
                <Input
                  id="fecha_detalle"
                  name="fecha_detalle"
                  type="date"
                  defaultValue={editando.fecha_detalle_recibido ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_liquidaciones">Liquidac. enviadas</Label>
                <Input
                  id="fecha_liquidaciones"
                  name="fecha_liquidaciones"
                  type="date"
                  defaultValue={editando.fecha_liquidaciones_enviadas ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_previred">Previred enviado</Label>
                <Input
                  id="fecha_previred"
                  name="fecha_previred"
                  type="date"
                  defaultValue={editando.fecha_previred_presentada ?? ""}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fecha_previred_listo_pago">
                  Listo para pago RS
                </Label>
                <Input
                  id="fecha_previred_listo_pago"
                  name="fecha_previred_listo_pago"
                  type="date"
                  defaultValue={editando.fecha_previred_listo_pago ?? ""}
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="monto">Monto Previred total</Label>
                <Input
                  id="monto"
                  name="monto"
                  type="number"
                  inputMode="numeric"
                  defaultValue={editando.monto_previred_total ?? ""}
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
