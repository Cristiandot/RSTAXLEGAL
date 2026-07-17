"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell } from "@/components/credencial-celdas";
import {
  claseDias,
  claseEstado,
  type F29Row,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  enviarCorreoF29,
  enviarCorreoF29Pagado,
  guardarF29,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  soloCerrarConX,
} from "@/components/ui/dialog";

const ESTADOS = [
  "Sin iniciar",
  "Pendiente presentación",
  "Cerrado",
  "Guardado y enviado",
  "Fondos en RS",
  "Pagado",
];

/**
 * Celda de monto TOTAL: muestra el total (solo lectura, se edita en el modal) y,
 * al hacer clic, abre un popover con el desglose del F29 (solo los conceptos con
 * monto distinto de cero).
 */
function MontoDetalle({ fila }: { fila: F29Row }) {
  const total = fila.monto_a_pagar;
  if (total === null || total === undefined || String(total) === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  const conceptos: [string, number | string | null][] = [
    ["IVA", fila.monto_iva],
    ["Impuesto Único", fila.imp_unico],
    ["Retenciones", fila.monto_retenciones],
    ["PPM", fila.ppm],
    ["Otros", fila.monto_otros],
  ];
  const detalle = conceptos.filter(
    ([, v]) =>
      v !== null && v !== undefined && String(v) !== "" && Number(v) !== 0,
  );
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="rounded px-1 font-medium tabular-nums underline decoration-dotted decoration-muted-foreground/60 underline-offset-4 hover:bg-muted"
          />
        }
      >
        {formatMonto(total)}
      </PopoverTrigger>
      <PopoverContent side="left" align="start">
        <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
          Detalle del F29
        </div>
        {detalle.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Sin desglose cargado. Ábrelo en el cliente para detallarlo.
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {detalle.map(([nombre, v]) => (
                <tr key={nombre}>
                  <td className="py-0.5 text-muted-foreground">{nombre}</td>
                  <td className="py-0.5 text-right tabular-nums">
                    {formatMonto(v!)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="pt-1 font-medium">TOTAL</td>
                <td className="pt-1 text-right font-semibold tabular-nums">
                  {formatMonto(total)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </PopoverContent>
    </Popover>
  );
}

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

export function F29Client({
  periodo,
  filas,
  usuarios,
  clavesSii,
  errorCarga,
}: {
  periodo: string;
  filas: F29Row[];
  usuarios: UsuarioOpcion[];
  /** cliente_id → tiene clave SII guardada (el valor se revela on demand). */
  clavesSii: Record<string, boolean>;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [concilF, setConcilF] = useState("");
  const [respF, setRespF] = useState("");
  const [editando, setEditando] = useState<F29Row | null>(null);
  // Correo del cliente (ficha) editable desde el modal.
  const [correoCli, setCorreoCli] = useState("");
  // Detalle del F29 controlado: el TOTAL a pagar se calcula sumando estos
  // conceptos (la contadora solo llena el detalle). Se guardan como strings.
  const [dg, setDg] = useState({
    iva: "",
    impUnico: "",
    ret: "",
    ppm: "",
    otros: "",
  });
  // Opción de postergar el IVA — va en el paso 1 para ofrecerla en el aviso.
  const [postergar, setPostergar] = useState("");
  // N° de operación del pago (cuando paga la oficina), editable desde el modal.
  const [numOp, setNumOp] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [enviando, startEnviar] = useTransition();
  const [enviandoPago, startEnviarPago] = useTransition();

  function abrirModal(c: F29Row) {
    setCorreoCli(c.correo_empresa ?? "");
    setNumOp(c.numero_operacion ?? "");
    setDg({
      iva: c.monto_iva == null ? "" : String(c.monto_iva),
      impUnico: c.imp_unico == null ? "" : String(c.imp_unico),
      ret: c.monto_retenciones == null ? "" : String(c.monto_retenciones),
      ppm: c.ppm == null ? "" : String(c.ppm),
      otros: c.monto_otros == null ? "" : String(c.monto_otros),
    });
    setPostergar(c.postergacion_monto == null ? "" : String(c.postergacion_monto));
    setEditando(c);
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
      if (concilF === "ok" && !c.conciliacion_ok) return false;
      if (concilF === "no" && c.conciliacion_ok) return false;
      if (respF && c.responsable !== respF) return false;
      return true;
    });
    // Orden por defecto = prioridad por código de grupo (A.1, B.2, C.10…),
    // natural gracias a la collation numérica, con la razón social como
    // desempate. Los clientes sin grupo quedan al final.
    if (!orden) {
      return [...out].sort(
        (a, b) =>
          comparar(a.grupo_codigo, b.grupo_codigo, "asc") ||
          comparar(a.razon_social, b.razon_social, "asc"),
      );
    }
    const valor = (c: F29Row): unknown => {
      switch (orden.col) {
        case "grupo": return c.grupo_codigo;
        case "cliente": return c.razon_social;
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "plazo": return c.plazo_f29;
        case "dias": return c.dias_restantes_f29;
        case "monto": return c.monto_a_pagar !== null ? Number(c.monto_a_pagar) : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, concilF, respF, orden]);

  const resumen = [
    { label: "Total", valor: filas.length },
    {
      label: "Sin iniciar",
      valor: filas.filter((c) => c.estado === "Sin iniciar").length,
    },
    {
      label: "Guardado y enviado",
      valor: filas.filter((c) => c.estado === "Guardado y enviado").length,
    },
    {
      label: "Fondos en RS",
      valor: filas.filter((c) => c.estado === "Fondos en RS").length,
    },
    {
      label: "Pagados",
      valor: filas.filter((c) => c.estado === "Pagado").length,
    },
    {
      label: "Plazo ≤ 5 días",
      valor: filas.filter(
        (c) =>
          c.estado !== "Pagado" &&
          c.dias_restantes_f29 !== null &&
          c.dias_restantes_f29 <= 5,
      ).length,
    },
  ];

  /**
   * Payload de `guardarF29` leído del formulario del modal. Lo usan el botón
   * Guardar y AMBOS envíos de correo: los correos usan los datos guardados del
   * ciclo, así que antes de enviar siempre se guarda lo escrito (evita avisos
   * con monto vacío o desactualizado).
   */
  function payloadFormulario(form: HTMLFormElement, ciclo: F29Row) {
    const fd = new FormData(form);
    const get = (k: string) => {
      const v = fd.get(k);
      return v === null || v === "" ? null : String(v);
    };
    return {
      cicloId: ciclo.ciclo_id,
      clienteId: ciclo.cliente_id,
      responsableId: get("responsable"),
      // fecha_f29_armado / fecha_f29_presentado ya no se gestionan a mano en la
      // UI: la presentación/declaración se estampa al pagar el F29 (paso 3),
      // nunca al enviar el aviso. Se conserva el valor histórico.
      fechaArmado: ciclo.fecha_f29_armado,
      fechaPresentado: ciclo.fecha_f29_presentado,
      monto: get("monto"),
      ppm: get("ppm"),
      folio: get("folio"),
      // pago_por quedó fuera de la UI (se ofrecen ambas formas en el aviso); se
      // conserva el valor histórico para no perder datos.
      pagoPor: ciclo.pago_por,
      fechaPagoOficina: get("fecha_pago_oficina"),
      fechaPagoF29: get("fecha_pago_f29"),
      numeroOperacion: numOp.trim() || null,
      correoCliente: correoCli.trim() || null,
      postergacionMonto: get("postergacion_monto"),
      comentarioCorreo: get("comentario_correo"),
      montoIva: get("monto_iva"),
      impUnico: get("imp_unico"),
      montoRetenciones: get("monto_retenciones"),
      montoOtros: get("monto_otros"),
      observaciones: get("observaciones"),
    };
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando) return;
    const payload = payloadFormulario(e.currentTarget, editando);
    startGuardar(async () => {
      const res = await guardarF29(payload);
      if (res.ok) {
        toast.success("Cambios guardados");
        setEditando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  /** Guarda el formulario del modal; devuelve false (con toast) si falla. */
  async function guardarAntesDeEnviar(ciclo: F29Row): Promise<boolean> {
    const form = document.getElementById("form-f29") as HTMLFormElement | null;
    if (!form) return true;
    const res = await guardarF29(payloadFormulario(form, ciclo));
    if (!res.ok) {
      toast.error(res.error ?? "No se pudo guardar antes de enviar");
      return false;
    }
    return true;
  }

  function enviarAviso() {
    if (!editando) return;
    const ciclo = editando;
    startEnviar(async () => {
      if (!(await guardarAntesDeEnviar(ciclo))) return;
      const res = await enviarCorreoF29(ciclo.ciclo_id, correoCli.trim() || null);
      if (res.ok) {
        toast.success(`Guardado y aviso enviado a ${res.enviadoA}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al enviar el correo");
      }
    });
  }

  function enviarAvisoPago() {
    if (!editando) return;
    const ciclo = editando;
    startEnviarPago(async () => {
      if (!(await guardarAntesDeEnviar(ciclo))) return;
      const res = await enviarCorreoF29Pagado(
        ciclo.ciclo_id,
        numOp.trim() || null,
        correoCli.trim() || null,
      );
      if (res.ok) {
        toast.success(`Guardado y aviso de pago enviado a ${res.enviadoA}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al enviar el correo");
      }
    });
  }

  const respDefault = editando
    ? (usuarios.find((u) => u.nombre === editando.responsable)?.id ?? "")
    : "";

  // TOTAL a pagar = suma del detalle. Blancos = 0. La suma puede dar negativa
  // (remanente a favor); en ese caso no hay monto a pagar, así que el total se
  // limita a 0 (queda como F29 sin pago / informativo).
  const num = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const sumaDesglose =
    num(dg.iva) + num(dg.impUnico) + num(dg.ret) + num(dg.ppm) + num(dg.otros);
  const totalPagar = Math.max(0, sumaDesglose);
  const detalleVacio =
    dg.iva === "" &&
    dg.impUnico === "" &&
    dg.ret === "" &&
    dg.ppm === "" &&
    dg.otros === "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          F29
        </h1>
        <p className="text-sm text-muted-foreground">
          Armado y presentación mensual del F29. Plazo uniforme: día 20.
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
          onCambio={(p) => router.push(`/f29?periodo=${p}`)}
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
          aria-label="Conciliación"
          className={selectCls}
          value={concilF}
          onChange={(e) => setConcilF(e.target.value)}
        >
          <option value="">Concil: todos</option>
          <option value="ok">Concil OK</option>
          <option value="no">Sin conciliar aún</option>
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

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[220px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="plazo" orden={orden} setOrden={setOrden}>Plazo</ThSort>
              <ThSort col="dias" orden={orden} setOrden={setOrden} className="text-center">Días</ThSort>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Monto</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.ciclo_id}
                  onClick={() => abrirModal(c)}
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <RutCopiable rut={c.rut_empresa} />
                      <ClaveCell
                        clienteId={c.cliente_id}
                        campo="clave_sii"
                        etiqueta="Clave SII"
                        razonSocial={c.razon_social}
                        tiene={clavesSii[c.cliente_id] ?? false}
                        compacto
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.responsable ?? "—"}</TableCell>
                  <TableCell>{formatFecha(c.plazo_f29)}</TableCell>
                  <TableCell
                    className={`text-center ${claseDias(c.estado, c.dias_restantes_f29)}`}
                  >
                    {c.dias_restantes_f29 ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MontoDetalle fila={c} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={editando !== null}
        onOpenChange={soloCerrarConX(() => setEditando(null))}
      >
        {editando ? (
          <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-lg md:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editando.razon_social}
              </DialogTitle>
              <DialogDescription>
                {[
                  editando.rut_empresa ? `RUT: ${editando.rut_empresa}` : null,
                  `Período ${editando.periodo}`,
                  "Plazo F29: día 20",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>

            {editando.conciliacion_ok ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                <CheckCircle2 className="size-4 shrink-0" />
                Conciliación de Compras y Ventas: OK para este período.
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700">
                <AlertTriangle className="size-4 shrink-0" />
                Conciliación pendiente. Verifica con Solange antes de armar el
                F29.
              </div>
            )}

            <form
              id="form-f29"
              onSubmit={onSubmit}
              className="grid min-h-0 flex-1 items-start gap-4 overflow-y-auto px-1 md:grid-cols-2"
            >
              {/* Columna izquierda — detalle y montos del F29 */}
              <div className="flex flex-col gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
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

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="col-span-2 text-xs font-semibold text-muted-foreground">
                  Detalle del F29 — escribe cada concepto; el TOTAL se calcula
                  solo. Solo los conceptos con monto salen en el detalle al
                  cliente.
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto_iva">IVA</Label>
                  <Input
                    id="monto_iva"
                    name="monto_iva"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={dg.iva}
                    onChange={(e) => setDg({ ...dg, iva: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="imp_unico">Impuesto Único</Label>
                  <Input
                    id="imp_unico"
                    name="imp_unico"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={dg.impUnico}
                    onChange={(e) => setDg({ ...dg, impUnico: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto_retenciones">Retenciones</Label>
                  <Input
                    id="monto_retenciones"
                    name="monto_retenciones"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={dg.ret}
                    onChange={(e) => setDg({ ...dg, ret: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ppm">PPM</Label>
                  <Input
                    id="ppm"
                    name="ppm"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={dg.ppm}
                    onChange={(e) => setDg({ ...dg, ppm: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto_otros">Otros</Label>
                  <Input
                    id="monto_otros"
                    name="monto_otros"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    value={dg.otros}
                    onChange={(e) => setDg({ ...dg, otros: e.target.value })}
                  />
                </div>
              </div>

              {/* TOTAL a pagar: suma automática del detalle (no editable). */}
              <div className="col-span-2 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Monto TOTAL a pagar</span>
                  <span className="text-xs text-muted-foreground">
                    {detalleVacio
                      ? "Se calcula al llenar el detalle de arriba."
                      : sumaDesglose < 0
                        ? `El detalle suma ${formatMonto(sumaDesglose)} (remanente a favor): sin monto a pagar este período.`
                        : "Suma automática del detalle."}
                  </span>
                </div>
                <span className="text-2xl font-semibold tabular-nums">
                  {detalleVacio ? "—" : formatMonto(totalPagar)}
                </span>
                <input
                  type="hidden"
                  name="monto"
                  value={detalleVacio ? "" : String(totalPagar)}
                />
              </div>

              {/* Opción de postergar el IVA — se ofrece en el aviso del paso 1. */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="postergacion_monto">
                  Opción de postergar el IVA ($)
                </Label>
                <Input
                  id="postergacion_monto"
                  name="postergacion_monto"
                  type="number"
                  inputMode="numeric"
                  placeholder="—"
                  className="w-48"
                  value={postergar}
                  onChange={(e) => setPostergar(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  Si el cliente puede postergar el IVA, escribe el monto: el aviso
                  del paso 1 le ofrece la opción y explica cuánto pagaría ahora.
                </span>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="folio">Folio F29</Label>
                <Input
                  id="folio"
                  name="folio"
                  className="w-48"
                  defaultValue={editando.folio_f29 ?? ""}
                />
              </div>
              </div>

              {/* Columna derecha — envío, transferencia, pago y notas */}
              <div className="flex flex-col gap-3">
              {/* Paso 1 — cerrar el detalle: envía el aviso al cliente. */}
              <div className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
                <Label htmlFor="correo_cliente" className="text-sky-900">
                  1 · Enviar detalle del F29 al cliente
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="correo_cliente"
                    type="email"
                    placeholder="correo@cliente.cl"
                    value={correoCli}
                    onChange={(e) => setCorreoCli(e.target.value)}
                    className="flex-1 bg-card"
                  />
                  <Button
                    type="button"
                    onClick={enviarAviso}
                    disabled={enviando || !correoCli.trim()}
                  >
                    <Send className="size-4" />
                    {editando.fecha_correo_f29_enviado
                      ? "Guardar y reenviar"
                      : "Guardar y enviar"}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {enviando
                    ? "Guardando y enviando aviso…"
                    : editando.fecha_correo_f29_enviado
                      ? `Guardado y enviado el ${formatFecha(editando.fecha_correo_f29_enviado.slice(0, 10))}.`
                      : "Guarda el formulario y envía al cliente el aviso (desglose, monto y plazo). El F29 pasa a «Guardado y enviado» —no se marca como declarado ante el SII, eso ocurre al pagar— y el correo se guarda en su ficha."}
                </span>
              </div>

              {/* Paso 2 — el cliente transfirió los fondos a la oficina. */}
              <div className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <Label htmlFor="fecha_pago_oficina" className="text-violet-900">
                  2 · Transfirieron a RS
                </Label>
                <Input
                  id="fecha_pago_oficina"
                  name="fecha_pago_oficina"
                  type="date"
                  className="w-48 bg-card"
                  defaultValue={editando.fecha_pago_oficina ?? ""}
                />
                <span className="text-xs text-muted-foreground">
                  Fecha en que el cliente transfirió los fondos a la oficina. Al
                  guardar con esta fecha, el F29 pasa a «Fondos en RS».
                </span>
              </div>

              {/* Paso 3 — RS pagó el F29: fecha de pago + comprobante al cliente. */}
              <div className="col-span-2 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <Label className="text-emerald-900">
                  3 · Pago del F29 y comprobante al cliente
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fecha_pago_f29" className="text-xs font-normal text-muted-foreground">
                      Fecha de pago del F29
                    </Label>
                    <Input
                      id="fecha_pago_f29"
                      name="fecha_pago_f29"
                      type="date"
                      className="bg-card"
                      defaultValue={editando.fecha_pago_f29 ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="numero_operacion" className="text-xs font-normal text-muted-foreground">
                      N° de operación
                    </Label>
                    <Input
                      id="numero_operacion"
                      placeholder="Ej.: 104839271"
                      value={numOp}
                      onChange={(e) => setNumOp(e.target.value)}
                      className="bg-card"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    onClick={enviarAvisoPago}
                    disabled={
                      enviandoPago || !numOp.trim() || !correoCli.trim()
                    }
                  >
                    <Send className="size-4" />
                    {editando.fecha_correo_pago_enviado
                      ? "Reenviar comprobante"
                      : "Marcar pagado y enviar comprobante"}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {enviandoPago
                    ? "Guardando, marcando pagado y enviando el comprobante…"
                    : editando.fecha_correo_pago_enviado
                      ? `Pagado y avisado el ${formatFecha(editando.fecha_correo_pago_enviado.slice(0, 10))}. El F29 quedó en «Pagado».`
                      : "Úsalo cuando el cliente transfirió a RS y ya pagamos: registra la fecha de pago (el F29 pasa a «Pagado») y envía el comprobante con monto, fecha y N° de operación."}
                </span>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="comentario_correo">
                  Comentario personalizado para el cliente
                </Label>
                <Textarea
                  id="comentario_correo"
                  name="comentario_correo"
                  rows={2}
                  placeholder="Nota del contador para el cliente…"
                  defaultValue={editando.comentario_correo ?? ""}
                />
                <span className="text-xs text-muted-foreground">
                  Sale en el aviso del F29 (paso 1) y en la Comunicación mensual.
                </span>
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
              <Button type="submit" form="form-f29" disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
