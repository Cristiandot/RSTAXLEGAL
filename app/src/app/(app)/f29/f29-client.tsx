"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { formatFecha } from "@/lib/format";
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
  actualizarPagoF29,
  enviarCorreoF29,
  enviarCorreoF29Pagado,
  guardarF29,
  marcarPasoF29,
} from "./actions";
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
  "Pendiente presentación",
  "Cerrado",
  "Guardado y enviado",
  "Fondos en RS",
  "Pagado",
];

/** Paso único del F29 marcable con checkbox inline: F29 enviado (cierra el ciclo). */
const PASOS_F29: {
  columna: "fecha_f29_presentado" | "fecha_pago_f29";
  label: string;
}[] = [
  { columna: "fecha_f29_presentado", label: "F29" },
  { columna: "fecha_pago_f29", label: "Pagado" },
];

/** Fecha de hoy en zona local del usuario (YYYY-MM-DD), para estampar hitos. */
function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Input de monto que guarda al salir del campo o con Enter. */
function MontoInline({
  valor,
  disabled,
  onGuardar,
}: {
  valor: number | string | null;
  disabled: boolean;
  onGuardar: (monto: string) => void;
}) {
  const [texto, setTexto] = useState(valor === null ? "" : String(valor));
  const original = valor === null ? "" : String(valor);
  return (
    <Input
      type="number"
      inputMode="numeric"
      placeholder="—"
      className="h-8 w-28 bg-card text-right tabular-nums"
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto !== original) onGuardar(texto);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/**
 * Celda "Paga": selector RS/cliente. Usa estado local para que, al elegir
 * "Paga RS", aparezca de inmediato la casilla de fecha de pago a la oficina
 * (sin esperar al refresh del servidor).
 */
function PagaCell({
  pagoPor,
  fechaPagoOficina,
  fechaPagoF29,
  disabled,
  onGuardar,
}: {
  pagoPor: string | null;
  fechaPagoOficina: string | null;
  fechaPagoF29: string | null;
  disabled: boolean;
  onGuardar: (patch: {
    pagoPor?: string | null;
    fechaPagoOficina?: string | null;
    fechaPagoF29?: string | null;
  }) => void;
}) {
  const [pago, setPago] = useState(pagoPor ?? "");
  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label="Quién paga el F29"
        className="h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={pago}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          setPago(v);
          onGuardar({ pagoPor: v || null });
        }}
      >
        <option value="">—</option>
        <option value="rs">Paga RS</option>
        <option value="cliente">Paga cliente</option>
      </select>
      {pago === "rs" ? (
        <Input
          type="date"
          className="h-7 w-36 bg-card text-xs"
          defaultValue={fechaPagoOficina ?? ""}
          disabled={disabled}
          onChange={(e) => onGuardar({ fechaPagoOficina: e.target.value || null })}
          aria-label="Fecha en que el cliente pagó a la oficina"
          title="Fecha en que el cliente pagó a la oficina (para acreditar el pago)"
        />
      ) : null}
      {pago === "cliente" ? (
        <Input
          type="date"
          className="h-7 w-36 bg-card text-xs"
          defaultValue={fechaPagoF29 ?? ""}
          disabled={disabled}
          onChange={(e) => onGuardar({ fechaPagoF29: e.target.value || null })}
          aria-label="Fecha en que el cliente pagó el F29"
          title="Fecha de pago del F29 por el cliente — al ingresarla, el estado pasa a Pagado"
        />
      ) : null}
    </div>
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
  // Hito único F29 como checklist: tildar estampa la fecha de hoy al guardar.
  const [presentadoChk, setPresentadoChk] = useState(false);
  // Correo del cliente (ficha) editable desde el modal.
  const [correoCli, setCorreoCli] = useState("");
  // Monto TOTAL controlado: permite el botón "Sin pago ($0)" del modal.
  const [montoTotal, setMontoTotal] = useState("");
  // N° de operación del pago (cuando paga la oficina), editable desde el modal.
  const [numOp, setNumOp] = useState("");
  // Quién paga, en vivo: al elegir "Paga RS" aparecen de inmediato la fecha de
  // transferencia a la oficina y el bloque para marcar pagado + avisar.
  const [pagoPorSel, setPagoPorSel] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [marcando, startMarcar] = useTransition();
  const [enviando, startEnviar] = useTransition();
  const [enviandoPago, startEnviarPago] = useTransition();

  function abrirModal(c: F29Row) {
    setPresentadoChk(c.fecha_f29_presentado !== null);
    setCorreoCli(c.correo_empresa ?? "");
    setNumOp(c.numero_operacion ?? "");
    setPagoPorSel(c.pago_por ?? "");
    setMontoTotal(c.monto_a_pagar === null ? "" : String(c.monto_a_pagar));
    setEditando(c);
  }

  function togglePaso(cicloId: string, columna: string, hecho: boolean) {
    startMarcar(async () => {
      const res = await marcarPasoF29(cicloId, columna, hecho);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Error al actualizar");
    });
  }

  function guardarPago(
    cicloId: string,
    patch: {
      pagoPor?: string | null;
      monto?: string | null;
      ppm?: string | null;
      fechaPagoOficina?: string | null;
      fechaPagoF29?: string | null;
    },
  ) {
    startMarcar(async () => {
      const res = await actualizarPagoF29(cicloId, patch);
      if (res.ok) {
        toast.success("Guardado");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar");
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
      if (concilF === "ok" && !c.conciliacion_ok) return false;
      if (concilF === "no" && c.conciliacion_ok) return false;
      if (respF && c.responsable !== respF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: F29Row): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "concil": return c.conciliacion_ok ? 0 : 1; // OK primero en asc
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "plazo": return c.plazo_f29;
        case "dias": return c.dias_restantes_f29;
        case "armado": return c.fecha_f29_armado;
        case "presentado": return c.fecha_f29_presentado;
        case "monto": return c.monto_a_pagar !== null ? Number(c.monto_a_pagar) : null;
        case "ppm": return c.ppm !== null ? Number(c.ppm) : null;
        case "folio": return c.folio_f29;
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
    // El hito conserva su fecha original si ya estaba marcado; si se tilda
    // recién ahora, se estampa hoy; si se destilda, queda en blanco.
    const hoy = hoyLocal();
    return {
      cicloId: ciclo.ciclo_id,
      clienteId: ciclo.cliente_id,
      responsableId: get("responsable"),
      // fecha_f29_armado ya no se gestiona en la UI: se conserva tal cual.
      fechaArmado: ciclo.fecha_f29_armado,
      fechaPresentado: presentadoChk
        ? (ciclo.fecha_f29_presentado ?? hoy)
        : null,
      monto: get("monto"),
      ppm: get("ppm"),
      folio: get("folio"),
      pagoPor: get("pago_por"),
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
              <ThSort col="concil" orden={orden} setOrden={setOrden}>Conciliación</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="plazo" orden={orden} setOrden={setOrden}>Plazo</ThSort>
              <ThSort col="dias" orden={orden} setOrden={setOrden} className="text-center">Días</ThSort>
              <ThSort col="presentado" orden={orden} setOrden={setOrden} className="text-center">F29</ThSort>
              <TableHead className="text-center">Pagado</TableHead>
              <TableHead>Paga</TableHead>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Monto</ThSort>
              <ThSort col="ppm" orden={orden} setOrden={setOrden} className="text-right">PPM</ThSort>
              <ThSort col="folio" orden={orden} setOrden={setOrden}>Folio</ThSort>
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
                    {c.conciliacion_ok ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        OK
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        Pendiente
                      </Badge>
                    )}
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
                  {PASOS_F29.map((p) => (
                    <TableCell
                      key={p.columna}
                      className="text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={c[p.columna] !== null}
                        disabled={marcando}
                        onCheckedChange={(v) => togglePaso(c.ciclo_id, p.columna, v === true)}
                        aria-label={p.label}
                        title={
                          c[p.columna]
                            ? `${p.label}: ${formatFecha(c[p.columna])}`
                            : `Marcar ${p.label} (estampa la fecha de hoy)`
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <PagaCell
                      key={`paga-${c.ciclo_id}-${c.pago_por ?? ""}`}
                      pagoPor={c.pago_por}
                      fechaPagoOficina={c.fecha_pago_oficina}
                      fechaPagoF29={c.fecha_pago_f29}
                      disabled={marcando}
                      onGuardar={(patch) => guardarPago(c.ciclo_id, patch)}
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <MontoInline
                      key={`${c.ciclo_id}-${c.monto_a_pagar ?? ""}`}
                      valor={c.monto_a_pagar}
                      disabled={marcando}
                      onGuardar={(m) => guardarPago(c.ciclo_id, { monto: m })}
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <MontoInline
                      key={`ppm-${c.ciclo_id}-${c.ppm ?? ""}`}
                      valor={c.ppm}
                      disabled={marcando}
                      onGuardar={(m) => guardarPago(c.ciclo_id, { ppm: m })}
                    />
                  </TableCell>
                  <TableCell>{c.folio_f29 ?? "—"}</TableCell>
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
              className="grid grid-cols-2 gap-3"
            >
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

              <div className="col-span-2 flex items-start gap-2.5 rounded-lg border border-input bg-card p-3">
                <Checkbox
                  id="chk_presentado"
                  checked={presentadoChk}
                  onCheckedChange={(v) => setPresentadoChk(v === true)}
                />
                <Label
                  htmlFor="chk_presentado"
                  className="flex cursor-pointer flex-col items-start gap-0.5"
                >
                  <span className="font-medium">F29</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {presentadoChk
                      ? editando.fecha_f29_presentado
                        ? formatFecha(editando.fecha_f29_presentado)
                        : "Se estampa hoy al guardar"
                      : "Pendiente"}
                  </span>
                </Label>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="monto">Monto TOTAL a pagar</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="monto"
                    name="monto"
                    type="number"
                    inputMode="numeric"
                    className="flex-1"
                    value={montoTotal}
                    onChange={(e) => setMontoTotal(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMontoTotal("0")}
                    title="F29 declarado sin monto a pagar: deja el monto en $0"
                  >
                    Sin pago ($0)
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  Si el F29 quedó sin monto a pagar, usa «Sin pago ($0)»: el
                  aviso y la Comunicación mensual salen como informativo, sin
                  botón de pago ni plazo.
                </span>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-3">
                <div className="col-span-2 text-xs font-semibold text-muted-foreground sm:col-span-3">
                  Desglose del F29 — solo los conceptos con monto salen en el
                  detalle al cliente (Comunicación mensual)
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="monto_iva">IVA</Label>
                  <Input
                    id="monto_iva"
                    name="monto_iva"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={editando.monto_iva ?? ""}
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
                    defaultValue={editando.imp_unico ?? ""}
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
                    defaultValue={editando.monto_retenciones ?? ""}
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
                    defaultValue={editando.ppm ?? ""}
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
                    defaultValue={editando.monto_otros ?? ""}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pago_por">¿Quién paga el F29?</Label>
                <select
                  id="pago_por"
                  name="pago_por"
                  className={selectCls}
                  value={pagoPorSel}
                  onChange={(e) => setPagoPorSel(e.target.value)}
                >
                  <option value="">Sin definir</option>
                  <option value="rs">Transfiere a RS (paga la oficina)</option>
                  <option value="cliente">Paga el cliente (directo al SII)</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  Define el aviso: «cliente» incluye botón para pagar en el SII;
                  «RS» incluye los datos de transferencia a la oficina.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folio">Folio F29</Label>
                <Input
                  id="folio"
                  name="folio"
                  defaultValue={editando.folio_f29 ?? ""}
                />
              </div>

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
                      : "Guarda el formulario, marca el F29 como presentado y envía al cliente el aviso (desglose, monto y plazo). El F29 pasa a «Guardado y enviado» y el correo se guarda en su ficha."}
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
                      enviandoPago ||
                      pagoPorSel !== "rs" ||
                      !numOp.trim() ||
                      !correoCli.trim()
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
                      : pagoPorSel === "rs"
                        ? "Registra la fecha de pago (el F29 pasa a «Pagado») y envía al cliente el comprobante con monto, fecha y N° de operación."
                        : "El comprobante «pagado por RS» aplica solo cuando el cliente transfiere a RS. La fecha de pago igual se puede registrar y guardar aquí."}
                </span>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="col-span-2 text-xs font-semibold text-muted-foreground">
                  Para el correo de Comunicación mensual
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="postergacion_monto">Opción de postergar ($)</Label>
                  <Input
                    id="postergacion_monto"
                    name="postergacion_monto"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={editando.postergacion_monto ?? ""}
                  />
                  <span className="text-xs text-muted-foreground">
                    Si el cliente puede postergar el IVA, escribe el monto: sale
                    en el detalle del correo.
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="comentario_correo">Comentario personalizado</Label>
                  <Textarea
                    id="comentario_correo"
                    name="comentario_correo"
                    rows={2}
                    placeholder="Nota del contador para el cliente…"
                    defaultValue={editando.comentario_correo ?? ""}
                  />
                </div>
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
