"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  actualizarPendiente,
  agregarHitoPendiente,
  crearPendiente,
  editarHitoPendiente,
  eliminarHitoPendiente,
  eliminarPendiente,
  terminarRequerimiento,
  togglePendiente,
} from "./actions";
import {
  AREAS_PENDIENTE,
  AREA_PENDIENTE_LABEL,
  type Causa,
  type Contacto,
  type Cotizacion,
  type GestionLegal,
  type Pendiente,
  type Requerimiento,
} from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";
const campoInput =
  "h-8 w-full rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";

const AREA_COLOR: Record<string, string> = {
  causas: "#3b82f6",
  gestiones: "#10b981",
  prospeccion: "#a855f7",
  gerencia: "#f59e0b",
  requerimiento: "#ef4444",
  otro: "#64748b",
};

function isoMasDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const hoyIso = () => isoMasDias(0);
const VENTANA_DIAS = 10;

function AreaTag({ area }: { area: string }) {
  const color = AREA_COLOR[area] ?? "#64748b";
  return (
    <span
      style={{ backgroundColor: `${color}1f`, color }}
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
    >
      {AREA_PENDIENTE_LABEL[area] ?? area}
    </span>
  );
}

function Fecha({ fecha }: { fecha: string | null }) {
  if (!fecha) return <span className="text-[11px] text-muted-foreground">—</span>;
  const vencido = fecha < hoyIso();
  return (
    <span className={`shrink-0 text-[11px] font-medium ${vencido ? "text-red-600" : "text-muted-foreground"}`}>
      {vencido ? "⚠ " : "📅 "}
      {formatFecha(fecha)}
    </span>
  );
}

export function ModuloPendientes({
  causas,
  gestiones,
  contactos,
  cotizaciones,
  requerimientos,
  pendientes,
  recargar,
}: {
  causas: Causa[];
  gestiones: GestionLegal[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
  requerimientos: Requerimiento[];
  pendientes: Pendiente[];
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [form, setForm] = useState(false);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);

  const ficha = fichaId ? (pendientes.find((p) => p.id === fichaId) ?? null) : null;
  const hitosFicha = ficha ? [...ficha.hitos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : [];

  const manualesPend = useMemo(() => pendientes.filter((p) => !p.hecho), [pendientes]);
  const manualesHechos = useMemo(() => pendientes.filter((p) => p.hecho), [pendientes]);

  /** Vencimientos derivados de causas, gestiones y prospección (solo lectura). */
  const derivados = useMemo(() => {
    const items: { key: string; fecha: string; titulo: string; area: string; detalle: string }[] = [];
    for (const c of causas) {
      if (c.estado === "cerrada") continue;
      const quien = c.cliente ?? c.caratula;
      // Solo la próxima gestión de la causa es pendiente; las audiencias no.
      if (c.proxima_gestion_fecha)
        items.push({ key: `c-g-${c.id}`, fecha: c.proxima_gestion_fecha, titulo: quien, area: "causas", detalle: c.proxima_gestion_detalle ?? "Próxima gestión" });
    }
    for (const g of gestiones) {
      if (g.estado === "Terminada") continue;
      if (g.proxima_gestion_fecha)
        items.push({ key: `g-${g.id}`, fecha: g.proxima_gestion_fecha, titulo: g.titulo, area: "gestiones", detalle: g.proxima_gestion_detalle ?? "Próxima gestión" });
    }
    for (const ct of contactos) {
      if (ct.fecha_proxima_accion)
        items.push({ key: `pc-${ct.id}`, fecha: ct.fecha_proxima_accion, titulo: ct.nombre, area: "prospeccion", detalle: "Próxima acción (contacto)" });
    }
    for (const q of cotizaciones) {
      if (q.proxima_accion_fecha)
        items.push({ key: `pq-${q.id}`, fecha: q.proxima_accion_fecha, titulo: q.destinatario, area: "prospeccion", detalle: q.proxima_accion_detalle ?? "Próxima acción (cotización)" });
    }
    return items.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  }, [causas, gestiones, contactos, cotizaciones]);

  /** Por defecto solo lo que vence en los próximos 10 días (incluye vencidos); el resto se oculta. */
  const limite = isoMasDias(VENTANA_DIAS);
  const derivadosVentana = useMemo(
    () => derivados.filter((d) => d.fecha <= limite),
    [derivados, limite],
  );
  const derivadosVisibles = mostrarTodos ? derivados : derivadosVentana;
  const ocultos = derivados.length - derivadosVentana.length;

  function ejecutar(fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Error al guardar.");
        return;
      }
      toast.success(exito);
      await recargar();
    });
  }

  function guardarPendiente(id: string, patch: Parameters<typeof actualizarPendiente>[1], exito: string) {
    ejecutar(() => actualizarPendiente(id, patch), exito);
  }

  function enviarHitoPendiente(pid: string, f: HTMLFormElement) {
    const fd = new FormData(f);
    ejecutar(
      () => agregarHitoPendiente(pid, (fd.get("fecha") as string) ?? "", (fd.get("detalle") as string) ?? ""),
      "Anotación agregada.",
    );
    f.reset();
  }

  function enviarPendiente(f: HTMLFormElement) {
    const fd = new FormData(f);
    const v = (k: string) => (fd.get(k) as string)?.trim() || null;
    ejecutar(
      () =>
        crearPendiente({
          titulo: (fd.get("titulo") as string) ?? "",
          detalle: v("detalle"),
          area: (fd.get("area") as string) || "otro",
          fecha: v("fecha"),
        }),
      "Pendiente agregado.",
    );
    setForm(false);
  }

  return (
    <div className="space-y-6">
      {/* ===== Mis pendientes (manuales) ===== */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">Mis pendientes ({manualesPend.length})</h3>
          <Button size="sm" onClick={() => setForm((v) => !v)}>
            <Plus className="size-4" />
            Nuevo pendiente
          </Button>
        </div>

        {form ? (
          <form
            className="mb-3 rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviarPendiente(e.currentTarget);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className={labelClase}>Título *</label>
                <Input name="titulo" required placeholder="Llamar al CBR por inscripción" />
              </div>
              <div>
                <label className={labelClase}>Área</label>
                <select name="area" className={`${selectClase} w-full`} defaultValue="otro">
                  {AREAS_PENDIENTE.map((a) => (
                    <option key={a} value={a}>
                      {AREA_PENDIENTE_LABEL[a] ?? a}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Fecha</label>
                <Input name="fecha" type="date" />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <label className={labelClase}>Detalle</label>
                <Input name="detalle" placeholder="Opcional" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                Guardar
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <div className="overflow-hidden rounded-xl border bg-white">
          {manualesPend.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin pendientes propios. Agrega uno o revisa los de abajo.
            </p>
          ) : (
            manualesPend.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                <span className="w-6 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {p.numero}
                </span>
                <button
                  type="button"
                  onClick={() => ejecutar(() => togglePendiente(p.id, true), "Marcado como hecho.")}
                  disabled={pendiente}
                  className="group flex size-5 shrink-0 items-center justify-center rounded border border-input hover:border-teal-500 hover:bg-muted"
                  title="Dar por terminado"
                >
                  <Check className="size-3.5 text-muted-foreground/25 group-hover:text-teal-600" />
                </button>
                <button
                  type="button"
                  onClick={() => setFichaId(p.id)}
                  className="min-w-0 flex-1 text-left"
                  title="Abrir ficha"
                >
                  <div className="truncate text-sm font-medium hover:underline">{p.titulo}</div>
                  {p.detalle ? (
                    <div className="truncate text-[11px] text-muted-foreground">{p.detalle}</div>
                  ) : null}
                </button>
                {p.hitos.length > 0 ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">📌 {p.hitos.length}</span>
                ) : null}
                <AreaTag area={p.area} />
                <Fecha fecha={p.fecha} />
                <button
                  type="button"
                  onClick={() => ejecutar(() => eliminarPendiente(p.id), "Pendiente eliminado.")}
                  disabled={pendiente}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {manualesHechos.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Hechos ({manualesHechos.length})
            </summary>
            <div className="mt-1 overflow-hidden rounded-xl border bg-white">
              {manualesHechos.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b px-3 py-1.5 last:border-b-0">
                  <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
                    {p.numero}
                  </span>
                  <button
                    type="button"
                    onClick={() => ejecutar(() => togglePendiente(p.id, false), "Reabierto.")}
                    disabled={pendiente}
                    className="flex size-5 shrink-0 items-center justify-center rounded border border-teal-500 bg-teal-500"
                    title="Reabrir"
                  >
                    <Check className="size-3.5 text-white" />
                  </button>
                  <span className="flex-1 truncate text-sm text-muted-foreground line-through">
                    {p.titulo}
                  </span>
                  <button
                    type="button"
                    onClick={() => ejecutar(() => eliminarPendiente(p.id), "Pendiente eliminado.")}
                    disabled={pendiente}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      {/* ===== Requerimientos del equipo asignados a mí ===== */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">
          Requerimientos del equipo asignados a mí ({requerimientos.length})
        </h3>
        <div className="overflow-hidden rounded-xl border bg-white">
          {requerimientos.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Sin requerimientos pendientes asignados a ti.
            </p>
          ) : (
            requerimientos.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                <button
                  type="button"
                  onClick={() =>
                    ejecutar(
                      () => terminarRequerimiento(r.id),
                      "Requerimiento cerrado (también en la bandeja).",
                    )
                  }
                  disabled={pendiente}
                  className="group flex size-5 shrink-0 items-center justify-center rounded border border-input hover:border-teal-500 hover:bg-muted"
                  title="Dar por terminado (cierra también en la bandeja común)"
                >
                  <Check className="size-3.5 text-muted-foreground/25 group-hover:text-teal-600" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.titulo}</div>
                  {r.detalle ? (
                    <div className="truncate text-[11px] text-muted-foreground">{r.detalle}</div>
                  ) : null}
                </div>
                {r.canal ? (
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{r.canal}</span>
                ) : null}
                <AreaTag area="requerimiento" />
                <Fecha fecha={r.plazo} />
              </div>
            ))
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Espejo de la bandeja de requerimientos del equipo (se gestionan en su módulo).
        </p>
      </section>

      {/* ===== Vencimientos derivados de mis áreas ===== */}
      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            Vencimientos de mis áreas ({derivadosVisibles.length}
            {!mostrarTodos && ocultos > 0 ? ` de ${derivados.length}` : ""})
          </h3>
          {ocultos > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setMostrarTodos((v) => !v)}>
              {mostrarTodos ? `Próximos ${VENTANA_DIAS} días` : `Ver todos (+${ocultos})`}
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-xl border bg-white">
          {derivadosVisibles.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {derivados.length === 0
                ? "Nada agendado en causas, gestiones ni prospección."
                : `Nada vence en los próximos ${VENTANA_DIAS} días.`}
            </p>
          ) : (
            derivadosVisibles.map((d) => (
              <div key={d.key} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                <span style={{ backgroundColor: AREA_COLOR[d.area] }} className="size-2 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.titulo}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{d.detalle}</div>
                </div>
                <AreaTag area={d.area} />
                <Fecha fecha={d.fecha} />
              </div>
            ))
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Próximas gestiones de causas, gestiones y prospección (las audiencias no son pendientes).
          Muestra los próximos {VENTANA_DIAS} días y lo vencido; edítalas en su pestaña.
        </p>
      </section>

      {/* ===== Ficha del pendiente ===== */}
      <Sheet open={!!fichaId} onOpenChange={(o) => !o && setFichaId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:!max-w-lg">
          {ficha ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="text-base leading-snug">
                    Pendiente N° {ficha.numero}
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => setFichaId(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Cerrar"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <SheetDescription className="sr-only">Ficha del pendiente</SheetDescription>
              </SheetHeader>

              <div className="space-y-5 p-4">
                <div>
                  <label className={labelClase}>Título</label>
                  <input
                    key={`t-${ficha.id}-${ficha.titulo}`}
                    type="text"
                    defaultValue={ficha.titulo}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val && val !== ficha.titulo)
                        guardarPendiente(ficha.id, { titulo: val }, "Título actualizado.");
                    }}
                    className={campoInput}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClase}>Área</label>
                    <select
                      value={ficha.area}
                      onChange={(e) => guardarPendiente(ficha.id, { area: e.target.value }, "Área actualizada.")}
                      className={campoInput}
                    >
                      {AREAS_PENDIENTE.map((a) => (
                        <option key={a} value={a}>
                          {AREA_PENDIENTE_LABEL[a] ?? a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClase}>Vencimiento</label>
                    <input
                      key={`f-${ficha.id}-${ficha.fecha ?? ""}`}
                      type="date"
                      defaultValue={ficha.fecha ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value || null;
                        if (val !== (ficha.fecha ?? null))
                          guardarPendiente(ficha.id, { fecha: val }, "Vencimiento actualizado.");
                      }}
                      className={campoInput}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClase}>Detalle</label>
                  <textarea
                    key={`d-${ficha.id}`}
                    defaultValue={ficha.detalle ?? ""}
                    rows={2}
                    placeholder="Detalle…"
                    onBlur={(e) => {
                      const val = e.target.value.trim() || null;
                      if (val !== (ficha.detalle ?? null))
                        guardarPendiente(ficha.id, { detalle: val }, "Detalle actualizado.");
                    }}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                  />
                </div>

                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Bitácora
                  </h4>
                  <div className="border-l-[3px] border-[var(--brand-teal,#17A2B8)] pl-3">
                    {hitosFicha.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin anotaciones todavía.</p>
                    ) : (
                      hitosFicha.map((h) => (
                        <div key={h.id} className="flex items-center gap-2 py-0.5">
                          <input
                            key={`hf-${h.id}-${h.fecha}`}
                            type="date"
                            defaultValue={h.fecha}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val && val !== h.fecha)
                                ejecutar(() => editarHitoPendiente(h.id, { fecha: val }), "Anotación actualizada.");
                            }}
                            className="h-7 w-32 shrink-0 rounded-md border border-input bg-white px-1.5 text-[11px] font-semibold text-teal-700 shadow-xs focus:outline-2 focus:outline-ring/50"
                          />
                          <input
                            key={`hd-${h.id}-${h.detalle}`}
                            type="text"
                            defaultValue={h.detalle}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== h.detalle)
                                ejecutar(() => editarHitoPendiente(h.id, { detalle: val }), "Anotación actualizada.");
                            }}
                            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-white px-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                          />
                          <button
                            type="button"
                            onClick={() => ejecutar(() => eliminarHitoPendiente(h.id), "Anotación eliminada.")}
                            disabled={pendiente}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                            title="Eliminar anotación"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        enviarHitoPendiente(ficha.id, e.currentTarget);
                      }}
                    >
                      <Input name="fecha" type="date" required className="h-8 w-36 text-xs" />
                      <Input
                        name="detalle"
                        required
                        placeholder="Anotación…"
                        className="h-8 min-w-48 flex-1 text-xs"
                      />
                      <Button type="submit" size="sm" disabled={pendiente}>
                        + Anotar
                      </Button>
                    </form>
                  </div>
                </section>

                <div className="flex gap-2 border-t pt-4">
                  <Button
                    size="sm"
                    onClick={() =>
                      ejecutar(() => togglePendiente(ficha.id, true), "Marcado como hecho.")
                    }
                    disabled={pendiente}
                  >
                    <Check className="size-4" />
                    Dar por terminado
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
