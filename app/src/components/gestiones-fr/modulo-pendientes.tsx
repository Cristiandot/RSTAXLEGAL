"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearPendiente, eliminarPendiente, terminarRequerimiento, togglePendiente } from "./actions";
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

  const manualesPend = useMemo(() => pendientes.filter((p) => !p.hecho), [pendientes]);
  const manualesHechos = useMemo(() => pendientes.filter((p) => p.hecho), [pendientes]);

  /** Vencimientos derivados de causas, gestiones y prospección (solo lectura). */
  const derivados = useMemo(() => {
    const items: { key: string; fecha: string; titulo: string; area: string; detalle: string }[] = [];
    for (const c of causas) {
      if (c.estado === "cerrada") continue;
      const quien = c.cliente ?? c.caratula;
      if (c.proxima_gestion_fecha)
        items.push({ key: `c-g-${c.id}`, fecha: c.proxima_gestion_fecha, titulo: quien, area: "causas", detalle: c.proxima_gestion_detalle ?? "Próxima gestión" });
      if (c.proxima_audiencia_fecha)
        items.push({ key: `c-a-${c.id}`, fecha: c.proxima_audiencia_fecha, titulo: quien, area: "causas", detalle: c.proxima_audiencia_tipo ?? "Audiencia" });
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
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.titulo}</div>
                  {p.detalle ? (
                    <div className="truncate text-[11px] text-muted-foreground">{p.detalle}</div>
                  ) : null}
                </div>
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
          Muestra los próximos {VENTANA_DIAS} días (y lo vencido); el resto queda oculto. Se arma solo
          con las próximas fechas de cada área; edítalas en su pestaña.
        </p>
      </section>
    </div>
  );
}
