"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Send, Plus, Trash2, Receipt } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { RutCopiable } from "@/components/rut-copiable";
import {
  claseEstado,
  copiasComunicacion,
  type CentroCostoRow,
  type ComunicacionRow,
  type FacturaPendienteRow,
} from "@/lib/ciclos";
import { etiquetaPeriodo } from "@/lib/periodos";
import {
  enviarCorreoComunicacion,
  guardarComunicacion,
  type CentroCostoInput,
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

const ESTADOS = ["Pendiente", "Enviado"];

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

export function ComunicacionClient({
  periodo,
  filas,
  centros,
  facturas,
  errorCarga,
}: {
  periodo: string;
  filas: ComunicacionRow[];
  centros: CentroCostoRow[];
  facturas: FacturaPendienteRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [editando, setEditando] = useState<ComunicacionRow | null>(null);
  // Estado del diálogo: centros de costo, override F29, correo y observaciones.
  const [centrosEdit, setCentrosEdit] = useState<CentroCostoInput[]>([]);
  const [montoF29, setMontoF29] = useState("");
  const [correoCli, setCorreoCli] = useState("");
  const [obs, setObs] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [enviando, startEnviar] = useTransition();

  const centrosPorCom = useMemo(() => {
    const m = new Map<string, CentroCostoRow[]>();
    for (const c of centros) {
      const arr = m.get(c.comunicacion_id) ?? [];
      arr.push(c);
      m.set(c.comunicacion_id, arr);
    }
    return m;
  }, [centros]);

  const facturasPorCliente = useMemo(() => {
    const m = new Map<string, FacturaPendienteRow[]>();
    for (const f of facturas) {
      const arr = m.get(f.cliente_id) ?? [];
      arr.push(f);
      m.set(f.cliente_id, arr);
    }
    return m;
  }, [facturas]);

  function abrirModal(c: ComunicacionRow) {
    const det = centrosPorCom.get(c.comunicacion_id) ?? [];
    setCentrosEdit(
      det.map((d) => ({ centro: d.centro_costo, monto: String(d.monto) })),
    );
    setMontoF29(c.monto_f29_override === null ? "" : String(c.monto_f29_override));
    setCorreoCli(c.correo_empresa ?? "");
    setObs(c.observaciones ?? "");
    setEditando(c);
  }

  function guardar(despues?: () => void) {
    if (!editando) return;
    const com = editando;
    startGuardar(async () => {
      const res = await guardarComunicacion({
        comunicacionId: com.comunicacion_id,
        clienteId: com.cliente_id,
        montoF29: montoF29.trim() || null,
        observaciones: obs.trim() || null,
        correoCliente: correoCli.trim() || null,
        centros: centrosEdit,
      });
      if (res.ok) {
        if (despues) despues();
        else {
          toast.success("Cambios guardados");
          setEditando(null);
          router.refresh();
        }
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  function enviarAviso() {
    if (!editando) return;
    const com = editando;
    // Primero se guardan los cambios abiertos, para que el correo salga con
    // lo que se ve en pantalla y no con lo último persistido.
    guardar(() => {
      startEnviar(async () => {
        const res = await enviarCorreoComunicacion(
          com.comunicacion_id,
          correoCli.trim() || null,
        );
        if (res.ok) {
          toast.success(`Resumen enviado a ${res.enviadoA}`);
          setEditando(null);
          router.refresh();
        } else {
          toast.error(res.error ?? "Error al enviar el correo");
        }
      });
    });
  }

  const [orden, setOrden] = useState<Orden>(null);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (estadoF && c.estado !== estadoF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: ComunicacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "previred": return c.monto_previred !== null ? Number(c.monto_previred) : null;
        case "f29": return c.monto_f29 !== null ? Number(c.monto_f29) : null;
        case "facturas": return c.facturas_pendientes_monto !== null ? Number(c.facturas_pendientes_monto) : null;
        case "total": return c.total_a_pagar !== null ? Number(c.total_a_pagar) : null;
        case "estado": return c.estado;
        case "enviado": return c.fecha_correo_enviado;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, orden]);

  const resumen = [
    { label: "Total", valor: filas.length },
    { label: "Enviados", valor: filas.filter((c) => c.estado === "Enviado").length },
    { label: "Pendientes", valor: filas.filter((c) => c.estado === "Pendiente").length },
    {
      label: "Sin montos aún",
      valor: filas.filter((c) => Number(c.total_a_pagar ?? 0) === 0).length,
    },
  ];

  // Empresas hermanas del mismo grupo (cliente con varias empresas): el correo
  // sale consolidado con el detalle de todas las que tengan montos.
  const hermanas = editando?.grupo_id
    ? filas.filter(
        (f) =>
          f.grupo_id === editando.grupo_id &&
          f.comunicacion_id !== editando.comunicacion_id,
      )
    : [];

  // Todos los correos a los que saldrá este envío (cliente completo).
  const copiasEditando = editando
    ? copiasComunicacion(
        editando.grupo_id
          ? filas.filter((f) => f.grupo_id === editando.grupo_id)
          : [editando],
        correoCli,
      )
    : [];

  const facturasEditando = editando
    ? (facturasPorCliente.get(editando.cliente_id) ?? [])
    : [];
  const totalFacturasEditando = facturasEditando.reduce(
    (s, f) => s + Number(f.monto ?? 0),
    0,
  );
  // Total en vivo del diálogo: detalle de centros si hay, si no el del ciclo.
  const totalCentrosEdit = centrosEdit.reduce(
    (s, c) => s + (Number(c.monto) || 0),
    0,
  );
  const previredVivo =
    centrosEdit.length > 0
      ? totalCentrosEdit
      : editando?.previred_total_ciclo !== null && editando !== null
        ? Number(editando.previred_total_ciclo)
        : 0;
  const f29Vivo = montoF29.trim()
    ? Number(montoF29) || 0
    : editando?.monto_f29_ciclo !== null && editando !== null
      ? Number(editando.monto_f29_ciclo)
      : 0;
  const totalVivo = previredVivo + f29Vivo + totalFacturasEditando;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Comunicación mensual
        </h1>
        <p className="text-sm text-muted-foreground">
          Resumen de pagos por empresa: imposiciones Previred por centro de
          costo, F29 y facturas RS pendientes — con envío del detalle al cliente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map((r) => (
          <ResumenCard key={r.label} label={r.label} valor={r.valor} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo
          periodo={periodo}
          onCambio={(p) => router.push(`/comunicacion?periodo=${p}`)}
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

        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} empresas
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[240px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="previred" orden={orden} setOrden={setOrden} className="text-right">Previred</ThSort>
              <TableHead className="text-center">Centros</TableHead>
              <ThSort col="f29" orden={orden} setOrden={setOrden} className="text-right">F29</ThSort>
              <ThSort col="facturas" orden={orden} setOrden={setOrden} className="text-right">Facturas RS</ThSort>
              <ThSort col="total" orden={orden} setOrden={setOrden} className="text-right">Total</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="enviado" orden={orden} setOrden={setOrden}>Enviado</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.comunicacion_id}
                  onClick={() => abrirModal(c)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[240px] truncate"
                      title={c.razon_social}
                    >
                      {c.razon_social}
                    </span>
                  </TableCell>
                  <TableCell><RutCopiable rut={c.rut_empresa} /></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMonto(c.monto_previred)}
                    {c.dnp_declarado ? (
                      <Badge
                        variant="outline"
                        className="ml-1.5 border-amber-200 bg-amber-50 text-amber-700"
                        title="Período declarado sin pago (DNP) — el correo incluye la advertencia"
                      >
                        DNP
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    {c.previred_centros > 0 ? (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        {c.previred_centros}
                      </Badge>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title="Sin centros de costo cargados: usa el total del ciclo de Liquidaciones"
                      >
                        ciclo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMonto(c.monto_f29)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.facturas_pendientes > 0 ? (
                      <span title={`${c.facturas_pendientes} factura(s) pendiente(s)`}>
                        {formatMonto(c.facturas_pendientes_monto)}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({c.facturas_pendientes})
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMonto(c.total_a_pagar)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.fecha_correo_enviado
                      ? formatFecha(c.fecha_correo_enviado.slice(0, 10))
                      : "—"}
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
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editando.razon_social}
              </DialogTitle>
              <DialogDescription>
                {[
                  editando.rut_empresa ? `RUT: ${editando.rut_empresa}` : null,
                  `Período ${etiquetaPeriodo(editando.periodo)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
              {hermanas.length > 0 ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-800">
                  Cliente <strong>{editando.grupo_nombre}</strong>: el correo
                  sale consolidado con el detalle separado por empresa e
                  incluirá también{" "}
                  {hermanas.map((h) => h.razon_social).join(", ")} (las que
                  tengan montos del período). El envío queda marcado en todas.
                </div>
              ) : null}
              {/* Imposiciones Previred por centro de costo */}
              <div className="space-y-2 rounded-lg border border-input bg-card p-3">
                <div className="flex items-center justify-between">
                  <Label>Imposiciones Previred — centros de costo</Label>
                  <span className="text-xs text-muted-foreground">
                    Ciclo Liquidaciones:{" "}
                    {formatMonto(editando.previred_total_ciclo)}
                  </span>
                </div>
                {editando.dnp_declarado ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    Período declarado <strong>sin pago (DNP)</strong> en
                    Liquidaciones: el correo incluirá la advertencia y la
                    recomendación de pagar dentro del mes.
                  </div>
                ) : null}
                {centrosEdit.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      placeholder="Centro de costo (ej.: Casa matriz)"
                      value={c.centro}
                      onChange={(e) =>
                        setCentrosEdit((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, centro: e.target.value } : x,
                          ),
                        )
                      }
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Monto"
                      value={c.monto}
                      onChange={(e) =>
                        setCentrosEdit((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, monto: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-36 text-right tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar centro de costo"
                      onClick={() =>
                        setCentrosEdit((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="size-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCentrosEdit((prev) => [...prev, { centro: "", monto: "" }])
                    }
                  >
                    <Plus className="size-4" />
                    Agregar centro de costo
                  </Button>
                  {centrosEdit.length > 0 ? (
                    <span className="text-sm font-medium tabular-nums">
                      Subtotal: {formatMonto(totalCentrosEdit)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin centros: el mensaje usa el total del ciclo.
                    </span>
                  )}
                </div>
              </div>

              {/* F29 */}
              <div className="space-y-1.5 rounded-lg border border-input bg-card p-3">
                <Label htmlFor="monto_f29">F29 — monto a pagar</Label>
                <Input
                  id="monto_f29"
                  type="number"
                  inputMode="numeric"
                  value={montoF29}
                  onChange={(e) => setMontoF29(e.target.value)}
                  placeholder={
                    editando.monto_f29_ciclo !== null
                      ? String(editando.monto_f29_ciclo)
                      : "—"
                  }
                  className="w-44 text-right tabular-nums"
                />
                <span className="block text-xs text-muted-foreground">
                  Del módulo F29: {formatMonto(editando.monto_f29_ciclo)}. Déjalo
                  vacío para usar ese monto; escribe uno solo si necesitas
                  corregirlo aquí.
                </span>
              </div>

              {/* Facturas RS pendientes */}
              <div className="space-y-1.5 rounded-lg border border-input bg-card p-3">
                <div className="flex items-center gap-2">
                  <Receipt className="size-4 text-muted-foreground" />
                  <Label>Facturas RS pendientes de pago</Label>
                </div>
                {facturasEditando.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Sin facturas pendientes.
                  </span>
                ) : (
                  <div className="space-y-1">
                    {facturasEditando.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>
                          Factura N° {f.folio} · {etiquetaPeriodo(f.periodo)}
                        </span>
                        <span className="tabular-nums">{formatMonto(f.monto)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t pt-1 text-sm font-medium">
                      <span>Subtotal facturas</span>
                      <span className="tabular-nums">
                        {formatMonto(totalFacturasEditando)}
                      </span>
                    </div>
                  </div>
                )}
                <span className="block text-xs text-muted-foreground">
                  Se listan todas las no pagadas (se administran en Facturación).
                </span>
              </div>

              {/* Total y envío */}
              <div className="flex items-center justify-between rounded-lg border border-input bg-muted/20 p-3">
                <span className="font-medium">Total a comunicar</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatMonto(totalVivo)}
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="correo_cliente">Correo del cliente</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="correo_cliente"
                    type="email"
                    placeholder="correo@cliente.cl"
                    value={correoCli}
                    onChange={(e) => setCorreoCli(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={enviarAviso}
                    disabled={guardando || enviando || !correoCli.trim()}
                  >
                    <Send className="size-4" />
                    {editando.fecha_correo_enviado ? "Reenviar" : "Enviar"}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {enviando || guardando
                    ? "Guardando y enviando…"
                    : editando.fecha_correo_enviado
                      ? `Último envío: ${formatFecha(editando.fecha_correo_enviado.slice(0, 10))}`
                      : "Guarda los cambios y envía al cliente el resumen de pagos del período. El correo se guarda en su ficha."}
                </span>
                <div className="rounded-md border border-input bg-muted/20 p-2 text-xs">
                  <span className="font-medium">Saldrá a:</span>{" "}
                  {correoCli.trim() || "— (falta el correo principal)"}
                  {copiasEditando.length > 0 ? (
                    <>
                      {" "}· <span className="font-medium">en copia ({copiasEditando.length}):</span>{" "}
                      <span className="text-muted-foreground">
                        {copiasEditando.join(", ")}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {" "}· sin copias (agrega correos adicionales en la ficha
                      de Empresas)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="observaciones">Observaciones (internas)</Label>
                <Textarea
                  id="observaciones"
                  rows={2}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => guardar()}
                disabled={guardando || enviando}
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
