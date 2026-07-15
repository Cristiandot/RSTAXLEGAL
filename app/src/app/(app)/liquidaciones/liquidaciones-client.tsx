"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Send } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell } from "@/components/credencial-celdas";
import {
  CuentaPreviredOficina,
  type CuentaOficina,
} from "@/components/cuenta-previred-oficina";
import {
  claseDias,
  claseEstado,
  type LiquidacionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  actualizarMontoPrevired,
  enviarAvisoPreviredPagado,
  enviarLiquidacionesCliente,
  guardarLiquidacion,
  marcarPaso,
} from "./actions";
import Link from "next/link";
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
  soloCerrarConX,
} from "@/components/ui/dialog";

const ESTADOS = [
  "Sin iniciar",
  "En espera de detalle",
  "Envío de liquidaciones",
  "Envío previred",
  "Previred listo para pago RS",
  "Previred pagado",
  "DNP declarado",
  "DNP pagado",
];

// Único checkbox de la grilla: DNP (declaración sin pago) — viaja a
// Comunicación mensual, que lo advierte en el correo. Las liquidaciones se
// envían con el botón de la columna "Liq. enviadas".
const PASOS = [
  { columna: "fecha_dnp_declarado", label: "DNP" },
] satisfies { columna: keyof LiquidacionRow; label: string }[];

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Input de monto que guarda al salir del campo o con Enter (patrón F29). */
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
      className="h-8 w-32 bg-card text-right tabular-nums"
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
  comunicacion,
  clavesPrevired,
  cuentasOficina,
  errorCarga,
}: {
  periodo: string;
  filas: LiquidacionRow[];
  usuarios: UsuarioOpcion[];
  /** cliente_id → fecha de envío del resumen en Comunicación mensual (o null). */
  comunicacion: Record<string, string | null>;
  /** cliente_id → tiene clave Previred guardada (el valor se revela on demand). */
  clavesPrevired: Record<string, boolean>;
  /** Cuentas de oficina (p. ej. la Previred del contador) — banner superior. */
  cuentasOficina: CuentaOficina[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [modF, setModF] = useState("");
  const [respF, setRespF] = useState("");
  const [editando, setEditando] = useState<LiquidacionRow | null>(null);
  const [modalidadModal, setModalidadModal] = useState("pago");
  // Diálogo de envío de liquidaciones por correo (columna "Liq. enviadas").
  const [envioLiq, setEnvioLiq] = useState<LiquidacionRow | null>(null);
  const [guardando, startGuardar] = useTransition();
  const [marcando, startMarcar] = useTransition();
  const [enviandoLiq, startEnviarLiq] = useTransition();

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
        case "pagado": return c.fecha_previred_pagado ?? c.fecha_dnp_pagado ?? c.fecha_dnp_declarado;
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
      valor: filas.filter(
        (c) => c.estado === "Previred pagado" || c.estado === "DNP pagado",
      ).length,
    },
    {
      label: "DNP declarados",
      valor: filas.filter((c) => c.fecha_dnp_declarado !== null).length,
    },
    {
      label: "Plazo ≤ 5 días",
      valor: filas.filter(
        (c) =>
          c.estado !== "Previred pagado" &&
          c.estado !== "DNP declarado" &&
          c.estado !== "DNP pagado" &&
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

  function enviarLiq(soloMarcar: boolean) {
    if (!envioLiq) return;
    const fila = envioLiq;
    startEnviarLiq(async () => {
      const res = await enviarLiquidacionesCliente(
        fila.ciclo_id,
        fila.cliente_id,
        fila.periodo,
        soloMarcar,
      );
      if (res.ok) {
        toast.success(
          res.enviadoA
            ? `Liquidaciones enviadas a ${res.enviadoA}`
            : "Marcadas como enviadas",
        );
        setEnvioLiq(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al enviar");
      }
    });
  }

  /** Aviso al cliente: imposiciones del período pagadas (usa los datos GUARDADOS del ciclo). */
  function enviarAvisoPagado() {
    if (!editando) return;
    const fila = editando;
    startEnviarLiq(async () => {
      const res = await enviarAvisoPreviredPagado(
        fila.ciclo_id,
        fila.cliente_id,
        fila.periodo,
      );
      if (res.ok) {
        toast.success(
          `Aviso enviado a ${res.enviadoA}${res.cc?.length ? ` (copia: ${res.cc.join(", ")})` : ""}`,
        );
        setEditando(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al enviar el aviso");
      }
    });
  }

  function quitarMarcaLiq() {
    if (!envioLiq) return;
    const fila = envioLiq;
    startEnviarLiq(async () => {
      const res = await marcarPaso(fila.ciclo_id, "fecha_liquidaciones_enviadas", false);
      if (res.ok) {
        toast.success("Marca de envío quitada");
        setEnvioLiq(null);
        router.refresh();
      } else toast.error(res.error ?? "Error al actualizar");
    });
  }

  function guardarMonto(cicloId: string, monto: string) {
    startMarcar(async () => {
      const res = await actualizarMontoPrevired(cicloId, monto);
      if (res.ok) {
        toast.success("Monto guardado");
        router.refresh();
      } else toast.error(res.error ?? "Error al guardar el monto");
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
        fechaDnpPagado: get("fecha_dnp_pagado"),
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

      <CuentaPreviredOficina cuentas={cuentasOficina} />

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

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[220px]">Cliente</ThSort>
              <TableHead>RUT Previred</TableHead>
              <ThSort col="modalidad" orden={orden} setOrden={setOrden}>Modalidad</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="plazo" orden={orden} setOrden={setOrden}>Plazo</ThSort>
              <ThSort col="dias" orden={orden} setOrden={setOrden} className="text-center">Días</ThSort>
              <TableHead className="text-center">Liq. enviadas</TableHead>
              {PASOS.map((p) => (
                <TableHead key={p.columna} className="text-center">
                  {p.label}
                </TableHead>
              ))}
              <TableHead className="text-center" title="Envío del resumen de pagos en Comunicación mensual">
                Previred
              </TableHead>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Monto Previred</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11}
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
                    {c.tipo_cliente === "casa_particular" ? (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-violet-300 bg-violet-50 text-[10px] text-violet-700"
                      >
                        Casa particular
                      </Badge>
                    ) : null}
                    <a
                      href={`/liquidaciones/${c.cliente_id}?periodo=${c.periodo}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-sky-600 hover:underline"
                    >
                      Cargar liquidaciones →
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <RutCopiable rut={c.previred_rut} />
                      <ClaveCell
                        clienteId={c.cliente_id}
                        campo="previred_clave"
                        etiqueta="Clave Previred"
                        razonSocial={c.razon_social}
                        tiene={clavesPrevired[c.cliente_id] ?? false}
                        compacto
                      />
                    </div>
                  </TableCell>
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
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Marcado manual (uso de este mes): tilda cuando las
                          liquidaciones se enviaron por fuera del panel. */}
                      <Checkbox
                        checked={c.fecha_liquidaciones_enviadas !== null}
                        disabled={marcando}
                        onCheckedChange={(v) =>
                          toggle(c.ciclo_id, "fecha_liquidaciones_enviadas", v === true)
                        }
                        aria-label="Liquidaciones enviadas"
                        title={
                          c.fecha_liquidaciones_enviadas
                            ? `Liquidaciones enviadas el ${formatFecha(c.fecha_liquidaciones_enviadas)}`
                            : "Marcar liquidaciones enviadas (estampa la fecha de hoy)"
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setEnvioLiq(c)}
                        className={`rounded p-1 transition ${
                          c.fecha_liquidaciones_enviadas
                            ? "text-emerald-600 hover:bg-emerald-50"
                            : "text-red-500 hover:bg-red-50"
                        }`}
                        title={
                          c.fecha_liquidaciones_enviadas
                            ? "Reenviar las liquidaciones por correo (PDF)"
                            : "Enviar las liquidaciones por correo (PDF) desde el panel"
                        }
                        aria-label="Enviar liquidaciones por correo"
                      >
                        <Send className="size-4" />
                      </button>
                    </div>
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
                        title={
                          c[p.columna]
                            ? `${p.label} · ${formatFecha(c[p.columna])}`
                            : "Marcar si el período quedó con DNP (declaración sin pago) — se advierte en la Comunicación mensual"
                        }
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      // Progresión del flujo Previred hacia el cliente:
                      // Pendiente → Detalle enviado → Pagado → Colilla pago enviada.
                      const detalle = comunicacion[c.cliente_id];
                      const fechaPago = c.fecha_previred_pagado ?? c.fecha_dnp_pagado;
                      const chip = c.fecha_correo_previred_enviado
                        ? {
                            texto: "Colilla pago enviada a cliente",
                            clase:
                              "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                            title: `Aviso de imposiciones pagadas enviado el ${formatFecha(c.fecha_correo_previred_enviado)} (desde el modal de la fila)`,
                          }
                        : fechaPago
                          ? {
                              texto: `${c.fecha_previred_pagado ? "Pagado" : "DNP pagado"} ${formatFecha(fechaPago)}`,
                              clase:
                                "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100",
                              title:
                                "Previred pagado — envía la colilla de pago al cliente desde el modal de la fila",
                            }
                          : detalle
                            ? {
                                texto: `Detalle enviado ${formatFecha(detalle.slice(0, 10))}`,
                                clase:
                                  "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
                                title: `Detalle de pagos enviado el ${formatFecha(detalle.slice(0, 10))} desde Comunicación mensual`,
                              }
                            : {
                                texto: "Pendiente",
                                clase:
                                  "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                                title:
                                  "Detalle de pagos pendiente — se envía desde Comunicación mensual",
                              };
                      return (
                        <Link
                          href={`/comunicacion?periodo=${c.periodo}`}
                          className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition ${chip.clase}`}
                          title={chip.title}
                        >
                          {chip.texto}
                        </Link>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <MontoInline
                      key={`${c.ciclo_id}-${c.monto_previred_total ?? ""}`}
                      valor={c.monto_previred_total}
                      disabled={marcando}
                      onGuardar={(m) => guardarMonto(c.ciclo_id, m)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de envío de liquidaciones por correo */}
      <Dialog
        open={envioLiq !== null}
        onOpenChange={soloCerrarConX(() => setEnvioLiq(null))}
      >
        {envioLiq ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {envioLiq.fecha_liquidaciones_enviadas
                  ? "Reenviar liquidaciones"
                  : "Enviar liquidaciones"}
              </DialogTitle>
              <DialogDescription>
                {envioLiq.razon_social} · Período {envioLiq.periodo}
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground">
              Se enviará un PDF con todas las liquidaciones calculadas del
              período (una por página) al correo de la ficha de la empresa, con
              copia a sus correos adicionales.
            </p>
            {envioLiq.fecha_liquidaciones_enviadas ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                <span>
                  Enviadas el {formatFecha(envioLiq.fecha_liquidaciones_enviadas)}.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={enviandoLiq}
                  onClick={quitarMarcaLiq}
                >
                  Quitar marca
                </Button>
              </div>
            ) : null}

            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEnvioLiq(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={enviandoLiq}
                onClick={() => enviarLiq(true)}
                title="Para liquidaciones despachadas fuera del panel (p. ej. KAME): solo estampa la fecha"
              >
                Solo marcar como enviadas
              </Button>
              <Button
                type="button"
                disabled={enviandoLiq}
                onClick={() => enviarLiq(false)}
              >
                {enviandoLiq ? "Enviando…" : "Enviar por correo"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog
        open={editando !== null}
        onOpenChange={soloCerrarConX(() => setEditando(null))}
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
              El paso «Liquidaciones enviadas» se marca con el checkbox de la
              tabla. Con la fecha de pago («Previred pagado» — o «DNP pagado»
              en modalidad DNP) y el monto guardados, abajo puedes enviar el
              aviso inmediato al cliente (además del resumen de Comunicación
              mensual).
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
                    ? "Modalidad DNP: declara sin pago — registra la fecha de declaración y, cuando el cliente pague, la fecha en «DNP pagado»."
                    : "¿Este cliente declara sin pagar? Cambia la modalidad a DNP y aparecerán los campos «DNP declarado» y «DNP pagado»."}
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fecha_dnp_pagado">DNP pagado</Label>
                    <Input
                      id="fecha_dnp_pagado"
                      name="fecha_dnp_pagado"
                      type="date"
                      defaultValue={editando.fecha_dnp_pagado ?? ""}
                    />
                    <p className="text-xs text-muted-foreground">
                      Fecha en que la planilla declarada quedó pagada.
                    </p>
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
                  <input type="hidden" name="fecha_dnp_pagado" value={editando.fecha_dnp_pagado ?? ""} />
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

            {/* Aviso al cliente: imposiciones pagadas. En modalidad pago exige
                «Previred pagado»; en DNP exige «DNP pagado» y el correo informa
                además la fecha en que se declaró el DNP. */}
            {(() => {
              const esDnp = modalidadModal === "dnp";
              const fechaPagoGuardada = esDnp
                ? editando.fecha_dnp_pagado
                : editando.fecha_previred_pagado;
              return (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <p className="mr-auto text-sm font-semibold">
                    Aviso al cliente: imposiciones pagadas
                  </p>
                  {editando.fecha_correo_previred_enviado ? (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      Enviado el {formatFecha(editando.fecha_correo_previred_enviado)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {editando.correo_empresa || editando.contacto_correo || editando.grupo_correo ? (
                    <>
                      Le llegaría a{" "}
                      <b>
                        {editando.correo_empresa ??
                          editando.contacto_correo ??
                          editando.grupo_correo}
                      </b>
                      {!editando.correo_empresa
                        ? editando.contacto_correo
                          ? " (correo del contacto)"
                          : " (correo del cliente)"
                        : ""}
                      {editando.correos_adicionales?.length ? (
                        <>
                          {" "}con copia a <b>{editando.correos_adicionales.join(", ")}</b>
                        </>
                      ) : null}
                      {esDnp
                        ? ", indicando el período, la fecha en que se declaró el DNP, la fecha en que se pagó y el monto."
                        : ", indicando el período y el monto pagado."}
                    </>
                  ) : (
                    <span className="text-red-600">
                      La empresa no tiene ningún correo en su ficha — cárgalo en Empresas para poder enviar.
                    </span>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={editando.fecha_correo_previred_enviado ? "outline" : "default"}
                    disabled={
                      enviandoLiq ||
                      !fechaPagoGuardada ||
                      !editando.monto_previred_total ||
                      (!editando.correo_empresa &&
                        !editando.contacto_correo &&
                        !editando.grupo_correo)
                    }
                    onClick={enviarAvisoPagado}
                  >
                    <Send className="size-4" />
                    {enviandoLiq
                      ? "Enviando…"
                      : editando.fecha_correo_previred_enviado
                        ? "Reenviar aviso"
                        : "Enviar aviso de pago"}
                  </Button>
                  {!fechaPagoGuardada || !editando.monto_previred_total ? (
                    <span className="text-xs text-muted-foreground">
                      Requiere fecha de «{esDnp ? "DNP pagado" : "Previred pagado"}» y monto{" "}
                      <b>guardados</b> (si los acabas de escribir, guarda primero y vuelve a
                      abrir).
                    </span>
                  ) : null}
                </div>
              </div>
              );
            })()}

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
