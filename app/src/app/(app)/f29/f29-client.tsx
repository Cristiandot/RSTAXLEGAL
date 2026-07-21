"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, CheckCircle2, AlertTriangle, Send, FileDown } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell } from "@/components/credencial-celdas";
import {
  claseDias,
  claseEstado,
  f29Cerrado,
  type F29Row,
  type PostergacionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  enviarCorreoF29,
  enviarCorreoF29Pagado,
  generarTxtF29Sii,
  guardarF29,
  getObservadaF29,
  marcarObservadaF29,
  marcarPostergadoPagado,
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

// Conciliación de Compras y Ventas aún no es parte del proceso F29: se oculta
// el aviso del modal y el filtro de la grilla hasta que se active (flip a true).
const MOSTRAR_CONCILIACION = false;

const ESTADOS = [
  "Sin iniciar",
  "Pendiente presentación",
  "Guardado y enviado",
  "Fondos en RS",
  "Declarado, folio pendiente",
  "Pagado, folio pendiente",
  "Giro TGR",
  "Declarado",
];

/**
 * Marca "Observada" del F29: único estado manual del semáforo del portal (el
 * resto se deriva del ciclo). Se levanta o se quita a mano; pinta el mes en rojo
 * en la vista del cliente. Autónomo: lee su estado al abrir y guarda al togglear.
 */
function ObservadaToggle({ clienteId, periodo }: { clienteId: string; periodo: string }) {
  const [obs, setObs] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void getObservadaF29(clienteId, periodo).then((v) => {
      if (vivo) setObs(v);
    });
    return () => { vivo = false; };
  }, [clienteId, periodo]);

  async function toggle(v: boolean) {
    setGuardando(true);
    const r = await marcarObservadaF29(clienteId, periodo, v);
    setGuardando(false);
    if (r.ok) {
      setObs(v);
      toast.success(v ? "F29 marcado como observado por el SII" : "Observación quitada");
    } else {
      toast.error(r.error ?? "No se pudo guardar la observación.");
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={obs ?? false}
        disabled={obs === null || guardando}
        onChange={(e) => toggle(e.target.checked)}
        className="size-4 accent-red-600"
      />
      <span>
        Observado por el SII{" "}
        <span className="text-xs text-muted-foreground">(pinta el mes en rojo en el portal del cliente)</span>
      </span>
    </label>
  );
}

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

/** IVA postergado que quedó pendiente de pago en el período (0 si no postergó). */
function postergadoPendiente(c: F29Row): number {
  const v = c.iva_postergado;
  if (v === null || v === undefined || String(v) === "") return 0;
  return Number(v) || 0;
}

/**
 * Elegible para el envío masivo del aviso (paso 1): el correo sale con los
 * datos GUARDADOS del ciclo, así que exige monto guardado y correo en la ficha,
 * y que el F29 no esté cerrado (declarado/pagado ya no lleva aviso).
 */
function enviableMasivo(c: F29Row): boolean {
  const monto = c.monto_a_pagar;
  const tieneMonto =
    monto !== null && monto !== undefined && String(monto) !== "";
  return (
    tieneMonto &&
    Boolean((c.correo_empresa ?? "").trim()) &&
    !f29Cerrado(c.estado)
  );
}

/** Por qué una fila NO es seleccionable para el envío masivo (tooltip). */
function motivoNoEnviable(c: F29Row): string {
  if (f29Cerrado(c.estado)) return "F29 cerrado: ya no lleva aviso.";
  const monto = c.monto_a_pagar;
  if (monto === null || monto === undefined || String(monto) === "")
    return "Falta guardar el detalle del F29 (ábrelo y llena los conceptos).";
  if (!(c.correo_empresa ?? "").trim())
    return "Falta el correo del cliente en la ficha (ábrelo y guárdalo).";
  return "";
}

/**
 * Botón «Generar TXT F29 para SII»: arma el archivo UPLOAD F29 (RCV del período
 * por tipo de documento + desglose GUARDADO del ciclo) y lo descarga como
 * [RUT 8 dígitos].txt, listo para cargarlo en sii.cl → Impuestos Mensuales →
 * Declarar y Pagar por Caja (F29 y F50) → tipo de ingreso Upload. El SII
 * recalcula los totalizadores al cargar; las advertencias de cuadratura quedan
 * visibles bajo el botón para revisarlas en pantalla antes de presentar.
 */
function TxtF29Sii({ cicloId }: { cicloId: string }) {
  const [generando, setGenerando] = useState(false);
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [resumen, setResumen] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setAdvertencias([]);
    setResumen(null);
    const r = await generarTxtF29Sii(cicloId);
    setGenerando(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo generar el TXT del F29");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([r.contenido], { type: "text/plain;charset=ascii" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = r.nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
    setAdvertencias(r.advertencias);
    setResumen(`${r.nombreArchivo} · ${r.codigos.length} códigos`);
    toast.success(`TXT F29 generado: ${r.nombreArchivo}`);
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-indigo-200 pt-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generar}
          disabled={generando}
        >
          <FileDown className="size-4" />
          {generando ? "Generando…" : "Generar TXT F29 para SII"}
        </Button>
        {resumen && (
          <span className="text-xs text-muted-foreground">{resumen}</span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        Arma el archivo Upload con el RCV del período y el detalle GUARDADO
        (guarda primero si cambiaste algo). Se carga en sii.cl → Declarar y
        Pagar por Caja (F29) → Upload; ahí el SII recalcula los totales y
        validas antes de presentar.
      </span>
      {advertencias.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {advertencias.map((a, i) => (
            <li key={i} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function claseEstadoSii(id: number | null): string {
  if (id === 1) return "border-emerald-300 bg-emerald-50 text-emerald-700"; // Vigente
  if (id === 10) return "border-amber-300 bg-amber-50 text-amber-700"; // Guardada (borrador)
  return "border-border bg-muted text-muted-foreground"; // otros / rechazada
}

/**
 * Celda "SII": estado y folio de lo declarado en el SII (espejo sii_f29_estado),
 * más un aviso de conciliación contra el panel (falta folio / folio distinto).
 * Vacía si aún no se ha bajado el período del SII.
 */
function SiiCelda({ fila }: { fila: F29Row }) {
  if (!fila.sii_estado) {
    return <span className="text-xs text-muted-foreground" title="Aún no bajado del SII">—</span>;
  }
  const declarada = Boolean(fila.sii_declarada);
  const panelFolio = (fila.folio_f29 ?? "").trim();
  const siiFolio = (fila.sii_folio ?? "").trim();
  let aviso: string | null = null;
  if (declarada && !panelFolio) aviso = "falta folio en panel";
  else if (declarada && siiFolio && panelFolio && panelFolio !== siiFolio) aviso = "folio ≠ panel";
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="outline" className={`w-fit ${claseEstadoSii(fila.sii_estado_id)}`}>
        {fila.sii_estado}
      </Badge>
      {siiFolio && (
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {siiFolio}
        </span>
      )}
      {aviso && <span className="text-[11px] text-amber-600">{aviso}</span>}
      {declarada && fila.sii_pagado === true && (
        <span className="text-[11px] text-emerald-600">
          pagado {formatFecha(fila.sii_pago_fecha)}
        </span>
      )}
      {declarada && fila.sii_pagado === false && (
        <span className="text-[11px] text-red-600">sin pago en SII</span>
      )}
    </div>
  );
}

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Panel de seguimiento del IVA postergado (art. 64 LIVS, vence a los 2 meses).
 * Vive arriba de la grilla /f29 y es INDEPENDIENTE del período seleccionado:
 * lista todas las postergaciones abiertas de la cartera para poder cobrarlas.
 */
function PostergacionesPanel({ filas }: { filas: PostergacionRow[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);
  const [guardando, startGuardar] = useTransition();
  const hoy = new Date().toISOString().slice(0, 10);
  const total = filas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const vencidos = filas.filter((f) => f.vencimiento && f.vencimiento < hoy).length;

  function marcarPagado(cicloId: string) {
    startGuardar(async () => {
      const r = await marcarPostergadoPagado(cicloId, true);
      if (r.ok) {
        toast.success("IVA postergado marcado como pagado");
        router.refresh();
      } else {
        toast.error(r.error ?? "No se pudo marcar como pagado");
      }
    });
  }

  if (filas.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
        <CheckCircle2 className="size-4 shrink-0" />
        Sin IVA postergado pendiente de cobro.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <span className="font-medium text-amber-900">
          IVA postergado — seguimiento de cobro
        </span>
        <span className="text-sm text-amber-800">
          {filas.length} pendiente{filas.length === 1 ? "" : "s"} ·{" "}
          {formatMonto(total)}
          {vencidos > 0 ? ` · ${vencidos} vencido${vencidos === 1 ? "" : "s"}` : ""}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {abierto ? "ocultar" : "ver"}
        </span>
      </button>
      {abierto && (
        <div className="overflow-x-auto border-t border-amber-200 bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Cliente</th>
                <th className="px-3 py-1.5 font-medium">Período</th>
                <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                <th className="px-3 py-1.5 font-medium">Folio</th>
                <th className="px-3 py-1.5 font-medium">Vence</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const vencido = Boolean(f.vencimiento && f.vencimiento < hoy);
                return (
                  <tr key={f.ciclo_id} className="border-t border-border">
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-1.5">
                        {f.grupo_codigo && (
                          <span className="rounded bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                            {f.grupo_codigo}
                          </span>
                        )}
                        <span className="truncate" title={f.razon_social}>
                          {f.razon_social}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 tabular-nums">{f.periodo}</td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                      {formatMonto(f.monto ?? 0)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {f.folio_f29 ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-1.5 tabular-nums ${vencido ? "font-semibold text-red-600" : ""}`}
                    >
                      {formatFecha(f.vencimiento)}
                      {vencido ? " · vencido" : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        disabled={guardando}
                        onClick={() => marcarPagado(f.ciclo_id)}
                        className="rounded border border-input bg-card px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                      >
                        Marcar pagado
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

export function F29Client({
  periodo,
  filas,
  usuarios,
  clavesSii,
  postergaciones,
  errorCarga,
}: {
  periodo: string;
  filas: F29Row[];
  usuarios: UsuarioOpcion[];
  /** cliente_id → tiene clave SII guardada (el valor se revela on demand). */
  clavesSii: Record<string, boolean>;
  /** Postergaciones de IVA abiertas (todos los períodos) para el seguimiento de cobro. */
  postergaciones: PostergacionRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [concilF, setConcilF] = useState("");
  const [respF, setRespF] = useState("");
  // Solo clientes que postergaron IVA con monto pendiente (seguimiento de cobro).
  const [soloPost, setSoloPost] = useState(false);
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
  // Opción de postergar el IVA — sí/no; lo postergable es el IVA del desglose.
  const [postergar, setPostergar] = useState(false);
  // Postergación EJERCIDA al declarar: el cliente aceptó postergar y el F29 se
  // presentó con el IVA postergado — pagó solo lo no postergable (PPM, etc.).
  // El monto se precarga con el IVA del detalle pero es editable (el neteo con
  // remanentes lo decide el SII; se copia del F29 declarado).
  const [postergado, setPostergado] = useState(false);
  const [ivaPost, setIvaPost] = useState("");
  // N° de operación del pago (cuando paga la oficina), editable desde el modal.
  const [numOp, setNumOp] = useState("");
  const [guardando, startGuardar] = useTransition();
  const [enviando, startEnviar] = useTransition();
  const [enviandoPago, startEnviarPago] = useTransition();

  // Envío masivo del aviso (paso 1): selección por checkbox en la grilla,
  // confirmación con la lista y envío uno a uno (misma barrera del server que
  // el envío individual: sin monto guardado el correo no sale).
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Foto de las filas al abrir el diálogo: la lista y sus resultados no se
  // mueven aunque la selección cambie al terminar (los ok se destildan).
  const [masivoLista, setMasivoLista] = useState<F29Row[]>([]);
  const [masivoAbierto, setMasivoAbierto] = useState(false);
  const [enviandoMasivo, setEnviandoMasivo] = useState(false);
  const [progresoMasivo, setProgresoMasivo] = useState({ hecho: 0, total: 0 });
  const [resultadosMasivo, setResultadosMasivo] = useState<
    Map<string, { ok: boolean; error?: string; enviadoA?: string }>
  >(new Map());

  // Al cambiar el período cambian los ciclo_id: se poda la selección para no
  // arrastrar ids que ya no están en pantalla.
  useEffect(() => {
    setSel((prev) => {
      const vivos = new Set(filas.map((c) => c.ciclo_id));
      const next = new Set([...prev].filter((id) => vivos.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filas]);

  function toggleSel(cicloId: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(cicloId)) next.delete(cicloId);
      else next.add(cicloId);
      return next;
    });
  }

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
    setPostergar(Boolean(c.postergar_iva));
    setPostergado(c.iva_postergado != null && Number(c.iva_postergado) > 0);
    setIvaPost(
      c.iva_postergado == null || Number(c.iva_postergado) === 0
        ? ""
        : String(c.iva_postergado),
    );
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
      if (soloPost && postergadoPendiente(c) <= 0) return false;
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
        case "rut": return c.rut_empresa;
        case "estado": return c.estado;
        case "sii": return c.sii_estado;
        case "responsable": return c.responsable;
        case "plazo": return c.plazo_f29;
        case "dias": return c.dias_restantes_f29;
        case "monto": return c.monto_a_pagar !== null ? Number(c.monto_a_pagar) : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, estadoF, concilF, respF, soloPost, orden]);

  // Postergaciones del período con IVA pendiente de pago (para el banner de cobro).
  const postergados = filas.filter((c) => postergadoPendiente(c) > 0);
  const totalPostergado = postergados.reduce((s, c) => s + postergadoPendiente(c), 0);

  // Envío masivo: filas seleccionadas (sobre TODAS las del período, no solo las
  // filtradas: la selección sobrevive a cambios de filtro) y enviables a la vista.
  const seleccionadas = filas.filter((c) => sel.has(c.ciclo_id));
  const enviablesVisibles = filtradas.filter(enviableMasivo);
  const todasVisiblesSel =
    enviablesVisibles.length > 0 &&
    enviablesVisibles.every((c) => sel.has(c.ciclo_id));

  function toggleTodasVisibles() {
    setSel((prev) => {
      const next = new Set(prev);
      if (todasVisiblesSel) {
        for (const c of enviablesVisibles) next.delete(c.ciclo_id);
      } else {
        for (const c of enviablesVisibles) next.add(c.ciclo_id);
      }
      return next;
    });
  }

  function abrirMasivo() {
    setMasivoLista(seleccionadas);
    setResultadosMasivo(new Map());
    setMasivoAbierto(true);
  }

  /**
   * Envía el aviso a los seleccionados UNO A UNO (secuencial, para no saturar
   * el correo) reusando la misma action del envío individual — corre la misma
   * barrera del server (sin monto guardado no sale). Los que fallan quedan
   * seleccionados para reintentar; los enviados se destildan.
   */
  async function enviarMasivo() {
    // En el primer envío van todos los de la foto; en un reintento, solo los
    // que siguen seleccionados (los fallidos). Los resultados se acumulan.
    const pendientes = masivoLista.filter((c) => sel.has(c.ciclo_id));
    if (pendientes.length === 0) return;
    setEnviandoMasivo(true);
    setProgresoMasivo({ hecho: 0, total: pendientes.length });
    const out = new Map(resultadosMasivo);
    let okN = 0;
    for (const c of pendientes) {
      const r = await enviarCorreoF29(c.ciclo_id, null);
      if (r.ok) okN += 1;
      out.set(c.ciclo_id, r);
      setResultadosMasivo(new Map(out));
      setProgresoMasivo((p) => ({ ...p, hecho: p.hecho + 1 }));
    }
    setEnviandoMasivo(false);
    setSel((prev) => {
      const next = new Set(prev);
      for (const [id, r] of out) if (r.ok) next.delete(id);
      return next;
    });
    if (okN === pendientes.length) {
      toast.success(okN === 1 ? "Aviso enviado" : `${okN} avisos enviados`);
    } else {
      toast.error(
        `${okN} de ${pendientes.length} avisos enviados — los que fallaron siguen seleccionados para reintentar.`,
      );
    }
    router.refresh();
  }

  function cerrarMasivo() {
    if (enviandoMasivo) return;
    setMasivoAbierto(false);
    setResultadosMasivo(new Map());
    setMasivoLista([]);
  }

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
      // "Declarado" es el estado terminal (F29 OK: declarado y, si correspondía,
      // pagado). Reemplaza al antiguo conteo de "Pagados" (criterio 20-07-2026).
      label: "Declarados",
      valor: filas.filter((c) => c.estado === "Declarado").length,
    },
    {
      // Declarados sin pago (giro a Tesorería): deuda pendiente por cobrar/pagar.
      label: "Giro TGR",
      valor: filas.filter((c) => c.estado === "Giro TGR").length,
    },
    {
      // F29 que quedaron declarados/pagados pero les falta cargar el folio
      // (estados «Pagado, folio pendiente» y «Declarado, folio pendiente»).
      label: "Folio pendiente",
      valor: filas.filter(
        (c) =>
          c.estado === "Pagado, folio pendiente" ||
          c.estado === "Declarado, folio pendiente",
      ).length,
    },
    {
      label: "Plazo ≤ 5 días",
      valor: filas.filter(
        (c) =>
          !f29Cerrado(c.estado) &&
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
      // fecha_f29_armado no se gestiona a mano; fecha_f29_presentado la deriva
      // el server desde el folio (con folio → «Declarado»; sin folio → null),
      // nunca desde el envío del aviso. Se conserva el valor histórico y el
      // server decide (guardarF29).
      fechaArmado: ciclo.fecha_f29_armado,
      fechaPresentado: ciclo.fecha_f29_presentado,
      monto: get("monto"),
      ppm: get("ppm"),
      folio: get("folio"),
      // Checkbox «Declarado (folio pendiente)»: marca declarado aunque no haya
      // folio todavía. Con folio la declaración es implícita (lo resuelve el server).
      declarado: fd.get("declarado") !== null,
      // pago_por quedó fuera de la UI (se ofrecen ambas formas en el aviso); se
      // conserva el valor histórico para no perder datos.
      pagoPor: ciclo.pago_por,
      fechaPagoOficina: get("fecha_pago_oficina"),
      fechaPagoF29: get("fecha_pago_f29"),
      numeroOperacion: numOp.trim() || null,
      correoCliente: correoCli.trim() || null,
      postergarIva: postergar,
      ivaPostergado: postergado && ivaPost.trim() !== "" ? ivaPost.trim() : null,
      comentarioCorreo: get("comentario_correo"),
      montoIva: get("monto_iva"),
      impUnico: get("imp_unico"),
      montoRetenciones: get("monto_retenciones"),
      montoOtros: get("monto_otros"),
      observaciones: get("observaciones"),
      multa: get("multa"),
      condonacion: get("condonacion"),
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

      <PostergacionesPanel filas={postergaciones} />

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

        {MOSTRAR_CONCILIACION && (
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
        )}

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

        <button
          type="button"
          onClick={() => setSoloPost((v) => !v)}
          aria-pressed={soloPost}
          className={`h-9 rounded-md border px-3 text-sm shadow-sm ${
            soloPost
              ? "border-amber-300 bg-amber-100 text-amber-800"
              : "border-input bg-card text-muted-foreground hover:bg-muted"
          }`}
          title="Mostrar solo los que postergaron IVA con monto pendiente"
        >
          Postergados {postergados.length > 0 ? `(${postergados.length})` : ""}
        </button>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} clientes
        </span>
      </div>

      {postergados.length > 0 && (
        <button
          type="button"
          onClick={() => setSoloPost(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-left text-sm text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>{postergados.length}</strong>{" "}
            {postergados.length === 1 ? "cliente postergó" : "clientes postergaron"} IVA este período —{" "}
            <strong>{formatMonto(totalPostergado)}</strong> pendiente de pago. Clic para ver y hacer seguimiento de cobro.
          </span>
        </button>
      )}

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-900">
          <span>
            <strong>{sel.size}</strong>{" "}
            {sel.size === 1 ? "F29 seleccionado" : "F29 seleccionados"} para
            enviar el aviso al cliente.
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSel(new Set())}
            >
              Limpiar
            </Button>
            <Button type="button" size="sm" onClick={abrirMasivo}>
              <Send className="size-4" />
              Enviar {sel.size === 1 ? "aviso" : `${sel.size} avisos`}…
            </Button>
          </div>
        </div>
      )}

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los enviables visibles"
                  title={
                    enviablesVisibles.length === 0
                      ? "Ninguna fila visible está lista para enviar (falta guardar detalle o correo)."
                      : "Seleccionar todos los enviables visibles"
                  }
                  className="size-4 accent-sky-600"
                  checked={todasVisiblesSel}
                  disabled={enviablesVisibles.length === 0}
                  onChange={toggleTodasVisibles}
                />
              </TableHead>
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[260px]">Cliente</ThSort>
              <ThSort col="rut" orden={orden} setOrden={setOrden}>RUT</ThSort>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="sii" orden={orden} setOrden={setOrden}>SII</ThSort>
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
                  colSpan={9}
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
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${c.razon_social}`}
                      title={
                        enviableMasivo(c)
                          ? c.fecha_correo_f29_enviado
                            ? `Aviso ya enviado el ${formatFecha(c.fecha_correo_f29_enviado.slice(0, 10))} — seleccionarlo lo REENVÍA.`
                            : "Seleccionar para envío masivo del aviso"
                          : motivoNoEnviable(c)
                      }
                      className="size-4 accent-sky-600 disabled:opacity-30"
                      checked={sel.has(c.ciclo_id)}
                      disabled={!enviableMasivo(c)}
                      onChange={() => toggleSel(c.ciclo_id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {c.grupo_codigo && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                          {c.grupo_codigo}
                        </span>
                      )}
                      <span
                        className="min-w-0 truncate"
                        title={c.razon_social}
                      >
                        {c.razon_social}
                      </span>
                    </div>
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
                    <div className="flex flex-col items-start gap-0.5">
                      <Badge variant="outline" className={claseEstado(c.estado)}>
                        {c.estado}
                      </Badge>
                      {postergadoPendiente(c) > 0 && (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                          title="IVA postergado pendiente de pago"
                        >
                          Postergado {formatMonto(postergadoPendiente(c))}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <SiiCelda fila={c} />
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

            {MOSTRAR_CONCILIACION &&
              (editando.conciliacion_ok ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  Conciliación de Compras y Ventas: OK para este período.
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-700">
                  <AlertTriangle className="size-4 shrink-0" />
                  Conciliación pendiente. Verifica con Solange antes de armar
                  el F29.
                </div>
              ))}

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

              {/* Opción de postergar el IVA — sí/no. Lo postergable es el IVA
                  del desglose; no se digita ningún monto (evita errores). */}
              <div className="col-span-2 flex flex-col gap-1.5">
                <label
                  htmlFor="postergar_iva"
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <input
                    id="postergar_iva"
                    type="checkbox"
                    className="size-4 accent-sky-600"
                    checked={postergar}
                    onChange={(e) => setPostergar(e.target.checked)}
                  />
                  Ofrecer al cliente postergar el pago del IVA
                </label>
                <span className="text-xs text-muted-foreground">
                  Al activarlo, el aviso del paso 1 ofrece postergar el IVA del
                  período
                  {dg.iva && Number(dg.iva) > 0 ? ` (${formatMonto(dg.iva)})` : ""}{" "}
                  hasta 2 meses sin multas ni intereses, y explica cuánto pagaría
                  ahora. Se toma el IVA del detalle: no hay que escribir montos.
                </span>
              </div>
              {/* Recargos por atraso de la propia declaración (la postergación de
                  IVA es el check de arriba; los convenios de pago viven en su
                  módulo aparte). */}
              <div
                key={`rec-${editando.ciclo_id}`}
                className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="col-span-2 text-xs font-semibold text-muted-foreground">
                  Recargos por atraso — llena solo si el F29 se presentó/pagó
                  fuera de plazo.
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="multa">Multa e interés ($)</Label>
                  <Input
                    id="multa"
                    name="multa"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={editando.multa == null ? "" : String(editando.multa)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="condonacion">Condonación ($)</Label>
                  <Input
                    id="condonacion"
                    name="condonacion"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={editando.condonacion == null ? "" : String(editando.condonacion)}
                  />
                </div>
              </div>

              <div className="col-span-2 mt-1 rounded-lg border border-red-200 bg-red-50/50 p-3">
                <ObservadaToggle clienteId={editando.cliente_id} periodo={editando.periodo} />
              </div>
              </div>

              {/* Columna derecha — envío, declaración, transferencia, pago y notas */}
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
                      : "Guarda el formulario y envía al cliente el aviso (desglose, monto y plazo). El F29 pasa a «Guardado y enviado» —no se marca como declarado ante el SII, eso ocurre en el paso 2 (folio o casilla «Declarado»)— y el correo se guarda en su ficha."}
                </span>
              </div>

              {/* Paso 2 — declaración ante el SII: el folio queda al final del F29. */}
              <div className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                <Label htmlFor="folio" className="text-indigo-900">
                  2 · Folio F29 (declaración)
                </Label>
                <Input
                  id="folio"
                  name="folio"
                  placeholder="Folio del F29"
                  className="w-48 bg-card"
                  defaultValue={editando.folio_f29 ?? ""}
                />
                {editando.sii_folio &&
                  editando.sii_folio.trim() !==
                    (editando.folio_f29 ?? "").trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(
                          "folio",
                        ) as HTMLInputElement | null;
                        if (el) el.value = editando.sii_folio!.trim();
                      }}
                      className="w-fit text-xs text-indigo-700 underline decoration-dotted underline-offset-2 hover:text-indigo-900"
                    >
                      Usar folio del SII: {editando.sii_folio} (luego Guardar)
                    </button>
                  )}
                <label className="flex items-center gap-2 text-sm text-indigo-900">
                  <input
                    type="checkbox"
                    name="declarado"
                    defaultChecked={editando.declarado_sin_folio}
                    className="size-4 accent-indigo-600"
                  />
                  <span>Declarado (folio pendiente)</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  Al guardar con folio, el F29 pasa a «Declarado». Si ya quedó
                  declarado en el SII pero aún no tienes el folio, marca la casilla:
                  el F29 pasa a «Declarado, folio pendiente» (para no olvidar cargar
                  el folio después). No es necesario para enviar el aviso.
                </span>
                <TxtF29Sii cicloId={editando.ciclo_id} />
              </div>

              {/* Paso 3 — el cliente transfirió los fondos a la oficina. */}
              <div className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <Label htmlFor="fecha_pago_oficina" className="text-violet-900">
                  3 · Transfirieron a RS
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
                  4 · Pago del F29 y comprobante al cliente
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
                {/* Postergación EJERCIDA: el F29 se declaró con el IVA postergado
                    y se pagó solo lo no postergable. El comprobante descuenta
                    este monto e informa el nuevo plazo del IVA. */}
                <label
                  htmlFor="iva_postergado_check"
                  className="flex items-center gap-2 text-sm text-emerald-900"
                >
                  <input
                    id="iva_postergado_check"
                    type="checkbox"
                    className="size-4 accent-emerald-600"
                    checked={postergado}
                    onChange={(e) => {
                      setPostergado(e.target.checked);
                      if (e.target.checked && ivaPost.trim() === "") {
                        setIvaPost(dg.iva);
                      }
                    }}
                  />
                  <span>Se postergó el IVA (se pagó solo lo no postergable)</span>
                </label>
                {postergado && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="iva_postergado"
                        className="text-xs font-normal text-muted-foreground"
                      >
                        IVA postergado ($)
                      </Label>
                      <Input
                        id="iva_postergado"
                        type="number"
                        inputMode="numeric"
                        placeholder="—"
                        value={ivaPost}
                        onChange={(e) => setIvaPost(e.target.value)}
                        className="bg-card"
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-1.5 pb-0.5">
                      <span className="text-xs text-muted-foreground">
                        Pagado ahora
                      </span>
                      <span className="text-lg font-semibold tabular-nums text-emerald-900">
                        {detalleVacio
                          ? "—"
                          : formatMonto(
                              Math.max(0, totalPagar - num(ivaPost)),
                            )}
                      </span>
                    </div>
                    <span className="col-span-2 text-xs text-muted-foreground">
                      Se precarga con el IVA del detalle, pero copia el monto
                      postergado real del F29 declarado (el SII puede netear
                      remanentes). El comprobante sale con «pagado ahora» y el
                      IVA pendiente con su nuevo plazo (día 20 + 2 meses,
                      corrido al hábil).
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    onClick={enviarAvisoPago}
                    disabled={
                      enviandoPago ||
                      !numOp.trim() ||
                      !correoCli.trim() ||
                      (postergado && ivaPost.trim() === "")
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
                      ? `Pagado y avisado el ${formatFecha(editando.fecha_correo_pago_enviado.slice(0, 10))}. Si aún no cargas el folio queda como «Pagado, folio pendiente»; con folio pasa a «Declarado».`
                      : "Úsalo cuando el cliente transfirió a RS y ya pagamos: registra la fecha de pago y envía el comprobante (monto, fecha y N° de operación). No necesitas el folio para pagar: si falta, el F29 queda como «Pagado, folio pendiente» hasta que lo cargues (ahí pasa a «Declarado»)."}
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

      {/* Envío masivo del aviso F29: confirmación con la lista de lo que va a
          salir (destino + monto guardado) y resultado por cliente. */}
      <Dialog open={masivoAbierto} onOpenChange={soloCerrarConX(cerrarMasivo)}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-3 sm:max-w-lg md:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Enviar{" "}
              {masivoLista.length === 1
                ? "el aviso F29"
                : `${masivoLista.length} avisos F29`}
            </DialogTitle>
            <DialogDescription>
              Período {periodo}. Cada aviso sale con los datos guardados del
              ciclo al correo de la ficha del cliente (con sus copias). Los que
              fallen quedan seleccionados para reintentar.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Cliente</th>
                  <th className="px-3 py-1.5 font-medium">Correo</th>
                  <th className="px-3 py-1.5 text-right font-medium">Monto</th>
                  <th className="px-3 py-1.5 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {masivoLista.map((c) => {
                  const r = resultadosMasivo.get(c.ciclo_id);
                  return (
                    <tr key={c.ciclo_id} className="border-t border-border">
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          {c.grupo_codigo && (
                            <span className="rounded bg-muted px-1 text-[11px] font-semibold text-muted-foreground">
                              {c.grupo_codigo}
                            </span>
                          )}
                          <span className="truncate" title={c.razon_social}>
                            {c.razon_social}
                          </span>
                        </span>
                      </td>
                      <td className="max-w-48 truncate px-3 py-1.5 text-muted-foreground">
                        {(c.correo_empresa ?? "").trim() || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {c.monto_a_pagar === null || String(c.monto_a_pagar) === ""
                          ? "—"
                          : formatMonto(c.monto_a_pagar)}
                      </td>
                      <td className="px-3 py-1.5">
                        {r ? (
                          r.ok ? (
                            <span className="flex items-center gap-1 text-emerald-600">
                              <CheckCircle2 className="size-3.5 shrink-0" />
                              enviado
                            </span>
                          ) : (
                            <span
                              className="flex items-center gap-1 text-red-600"
                              title={r.error}
                            >
                              <AlertTriangle className="size-3.5 shrink-0" />
                              {r.error ?? "error"}
                            </span>
                          )
                        ) : c.fecha_correo_f29_enviado ? (
                          <span className="text-xs text-amber-600">
                            reenvío (ya salió el{" "}
                            {formatFecha(c.fecha_correo_f29_enviado.slice(0, 10))})
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            listo para enviar
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cerrarMasivo}
              disabled={enviandoMasivo}
            >
              {resultadosMasivo.size > 0 && !enviandoMasivo ? "Cerrar" : "Cancelar"}
            </Button>
            {(() => {
              const porEnviar = masivoLista.filter((c) =>
                sel.has(c.ciclo_id),
              ).length;
              return (
                <Button
                  type="button"
                  onClick={enviarMasivo}
                  disabled={enviandoMasivo || porEnviar === 0}
                >
                  <Send className="size-4" />
                  {enviandoMasivo
                    ? `Enviando ${Math.min(progresoMasivo.hecho + 1, progresoMasivo.total)} de ${progresoMasivo.total}…`
                    : resultadosMasivo.size > 0
                      ? porEnviar === 0
                        ? "Todo enviado"
                        : `Reintentar (${porEnviar})`
                      : porEnviar === 1
                        ? "Enviar el aviso"
                        : `Enviar ${porEnviar} avisos`}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
