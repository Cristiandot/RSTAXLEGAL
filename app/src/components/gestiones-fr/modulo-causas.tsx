"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ExternalLink, Plus, X } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CalendarioFR, LeyendaCalendario, type EventoCalendario } from "./calendario";
import { dtLocal, fmtFechaHora, splitDT } from "./fecha-hora";
import { actualizarCausa, agregarHito, crearCausa } from "./actions";
import {
  ESTADOS_CAUSA,
  ESTADO_COLOR,
  MATERIAS_CAUSA,
  TRIBUNALES_CAUSA,
  type AgendaEvento,
  type Causa,
} from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";
const campoInput =
  "h-8 w-full rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";

const TIPOS_AUDIENCIA = ["Audiencia preparatoria", "Audiencia de juicio"];

/** Pestañas de materia: "Todas" + el catálogo de materias. */
const TABS_MATERIA = ["Todas", ...MATERIAS_CAUSA] as const;

/** Separa la carátula "Demandante / Demandado" (o "… con …") en sus partes. */
function parsearPartes(caratula: string): { demandante: string; demandado: string } | null {
  if (caratula.includes("/")) {
    const i = caratula.indexOf("/");
    return { demandante: caratula.slice(0, i).trim(), demandado: caratula.slice(i + 1).trim() };
  }
  const con = caratula.match(/^(.*?)\s+con\s+(.*)$/i);
  if (con) return { demandante: con[1].trim(), demandado: con[2].trim() };
  return null;
}

/** Fecha más próxima entre gestión y audiencia (para ordenar dentro del grupo). */
function proximaClave(c: Causa): string {
  const fs = [c.proxima_audiencia_fecha, c.proxima_gestion_fecha].filter(Boolean) as string[];
  return fs.length ? fs.sort()[0] : "";
}

function EstadoBadge({ estado, className = "" }: { estado: string | null; className?: string }) {
  const color = (estado && ESTADO_COLOR[estado]) || "#64748b";
  return (
    <span
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}55` }}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${className}`}
    >
      <span style={{ backgroundColor: color }} className="size-1.5 shrink-0 rounded-full" />
      {estado ?? "—"}
    </span>
  );
}

function CalidadBadge({ calidad }: { calidad: string | null }) {
  if (!calidad) return null;
  return (
    <Badge
      variant="outline"
      className={
        calidad === "Ataque"
          ? "border-teal-200 bg-teal-50 text-teal-700"
          : calidad === "Defensa"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : ""
      }
    >
      {calidad}
    </Badge>
  );
}

function Campo({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}

export function ModuloCausas({
  causas,
  agenda,
  recargar,
}: {
  causas: Causa[];
  agenda: AgendaEvento[];
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [formCausa, setFormCausa] = useState(false);
  const [filtroMateria, setFiltroMateria] = useState<string>("Todas");
  const [verHistorico, setVerHistorico] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);

  const nCerradas = useMemo(() => causas.filter((c) => c.estado === "cerrada").length, [causas]);

  /** Conteo por materia dentro de la vista actual (activas u histórico), para las pestañas. */
  const conteoPorMateria = useMemo(() => {
    const base = causas.filter((c) =>
      verHistorico ? c.estado === "cerrada" : c.estado !== "cerrada",
    );
    const conteo: Record<string, number> = { Todas: base.length, Laboral: 0, Familia: 0, Civil: 0 };
    for (const c of base) if (c.materia && c.materia in conteo) conteo[c.materia] += 1;
    return conteo;
  }, [causas, verHistorico]);

  const eventos = useMemo<EventoCalendario[]>(() => {
    const evs: EventoCalendario[] = [];
    for (const c of causas) {
      if (c.estado === "cerrada") continue; // el histórico no ensucia el calendario
      const quien = c.cliente ?? c.caratula;
      if (c.proxima_gestion_fecha)
        evs.push({
          fecha: c.proxima_gestion_fecha,
          clase: "causa",
          texto: `${c.proxima_gestion_hora ? c.proxima_gestion_hora + " " : ""}Gestión — ${quien}`,
          id: c.id,
        });
      if (c.proxima_audiencia_fecha)
        evs.push({
          fecha: c.proxima_audiencia_fecha,
          clase: "causa",
          texto: `${c.proxima_audiencia_hora ? c.proxima_audiencia_hora + " " : ""}${c.proxima_audiencia_tipo ?? "Audiencia"} — ${quien}`,
          id: c.id,
        });
    }
    for (const a of agenda) {
      evs.push({
        fecha: a.fecha,
        clase: "agenda",
        texto: `${a.hora ? a.hora + " " : ""}${a.titulo}`,
      });
    }
    return evs;
  }, [causas, agenda]);

  const causasFiltradas = useMemo(() => {
    const porMateria =
      filtroMateria === "Todas" ? causas : causas.filter((c) => c.materia === filtroMateria);
    return porMateria.filter((c) =>
      verHistorico ? c.estado === "cerrada" : c.estado !== "cerrada",
    );
  }, [causas, filtroMateria, verHistorico]);

  /** Causas agrupadas por estado, en orden del ciclo procesal. */
  const grupos = useMemo(() => {
    const map = new Map<string, Causa[]>();
    for (const c of causasFiltradas) {
      const e = c.estado ?? "prospecto";
      const arr = map.get(e);
      if (arr) arr.push(c);
      else map.set(e, [c]);
    }
    const posicion = (e: string) => {
      const i = ESTADOS_CAUSA.indexOf(e as never);
      return i === -1 ? 999 : i;
    };
    return [...map.entries()]
      .sort((a, b) => posicion(a[0]) - posicion(b[0]))
      .map(([estado, items]) => ({
        estado,
        items: items.sort((x, y) => {
          const fx = proximaClave(x);
          const fy = proximaClave(y);
          if (fx && fy && fx !== fy) return fx < fy ? -1 : 1;
          if (fx && !fy) return -1;
          if (!fx && fy) return 1;
          return (x.cliente ?? x.caratula).localeCompare(y.cliente ?? y.caratula);
        }),
      }));
  }, [causasFiltradas]);

  const ficha = fichaId ? (causas.find((c) => c.id === fichaId) ?? null) : null;
  const partes = ficha ? parsearPartes(ficha.caratula) : null;
  const hitosFicha = ficha ? [...ficha.hitos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : [];

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

  function guardarCampo(id: string, patch: Parameters<typeof actualizarCausa>[1], exito: string) {
    ejecutar(() => actualizarCausa(id, patch), exito);
  }

  function enviarNuevaCausa(form: HTMLFormElement) {
    const fd = new FormData(form);
    const v = (k: string) => (fd.get(k) as string)?.trim() || null;
    ejecutar(
      () =>
        crearCausa({
          caratula: (fd.get("caratula") as string) ?? "",
          cliente: v("cliente"),
          calidad: v("calidad"),
          materia: v("materia"),
          tribunal: v("tribunal"),
          rit_rol: v("rit_rol"),
          estado: (fd.get("estado") as string) || "prospecto",
          proxima_gestion_fecha: v("pg_fecha"),
          proxima_gestion_hora: v("pg_hora"),
          proxima_gestion_detalle: v("pg_detalle"),
          carpeta_sharepoint: v("carpeta"),
        }),
      "Causa registrada.",
    );
    setFormCausa(false);
  }

  function enviarHito(causaId: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    ejecutar(
      () =>
        agregarHito(
          causaId,
          (fd.get("fecha") as string) ?? "",
          (fd.get("detalle") as string) ?? "",
          (fd.get("hora") as string) || null,
        ),
      "Hito agregado.",
    );
    form.reset();
  }

  return (
    <div className="space-y-6">
      {/* ===== Calendario judicial ===== */}
      <div>
        <LeyendaCalendario
          items={[
            { color: "bg-red-500", label: "Audiencia / gestión" },
            { color: "bg-indigo-400", label: "Mi calendario" },
            { color: "bg-rose-300", label: "Feriado" },
            { color: "bg-[var(--brand-teal,#17A2B8)]", label: "Hoy" },
          ]}
        />
        <CalendarioFR eventos={eventos} onEventoClick={(ev) => ev.id && setFichaId(ev.id)} />
      </div>

      {/* ===== Causas agrupadas por estado ===== */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            {verHistorico ? "Histórico — causas cerradas" : "Causas"} ({causasFiltradas.length})
          </h3>
          <Button
            variant={verHistorico ? "default" : "outline"}
            size="sm"
            onClick={() => setVerHistorico((v) => !v)}
          >
            <Archive className="size-4" />
            {verHistorico ? "Ver activas" : `Histórico (${nCerradas})`}
          </Button>
          <Button size="sm" onClick={() => setFormCausa((v) => !v)}>
            <Plus className="size-4" />
            Nueva causa
          </Button>
        </div>

        {/* Pestañas por materia */}
        <div className="mb-4 flex flex-wrap gap-1 border-b">
          {TABS_MATERIA.map((t) => {
            const activo = filtroMateria === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFiltroMateria(t)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  activo
                    ? "border-[var(--brand-teal,#17A2B8)] text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({conteoPorMateria[t] ?? 0})
                </span>
              </button>
            );
          })}
        </div>

        {formCausa ? (
          <form
            className="mb-4 rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviarNuevaCausa(e.currentTarget);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClase}>Carátula *</label>
                <Input name="caratula" required placeholder="Pérez / Constructora XYZ" />
              </div>
              <div>
                <label className={labelClase}>Cliente</label>
                <Input name="cliente" placeholder="Nombre del cliente" />
              </div>
              <div>
                <label className={labelClase}>Calidad</label>
                <select name="calidad" className={`${selectClase} w-full`} defaultValue="Ataque">
                  <option>Ataque</option>
                  <option>Defensa</option>
                </select>
              </div>
              <div>
                <label className={labelClase}>Materia</label>
                <select name="materia" className={`${selectClase} w-full`} defaultValue="Laboral">
                  {MATERIAS_CAUSA.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Tribunal / instancia</label>
                <Input
                  name="tribunal"
                  list="tribunales-causa"
                  placeholder="JL Trabajo Valpo (o texto libre / pre-judicial IdT)"
                />
                <datalist id="tribunales-causa">
                  {TRIBUNALES_CAUSA.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelClase}>RIT / ROL</label>
                <Input name="rit_rol" placeholder="O-123-2026 (vacío si pre-judicial)" />
              </div>
              <div>
                <label className={labelClase}>Estado</label>
                <select name="estado" className={`${selectClase} w-full`} defaultValue="prospecto">
                  {ESTADOS_CAUSA.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Próxima gestión — fecha</label>
                <div className="flex gap-2">
                  <Input name="pg_fecha" type="date" />
                  <Input name="pg_hora" type="time" className="w-28" />
                </div>
              </div>
              <div>
                <label className={labelClase}>Próxima gestión — detalle</label>
                <Input name="pg_detalle" placeholder="Comparendo, contestación…" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClase}>Carpeta SharePoint</label>
                <Input name="carpeta" placeholder="https://rstaxlegalcl.sharepoint.com/…" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                Guardar causa
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFormCausa(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        {causasFiltradas.length === 0 ? (
          <div className="rounded-xl border bg-white py-10 text-center text-sm text-muted-foreground">
            {causas.length === 0
              ? "Sin causas registradas."
              : verHistorico
                ? "Sin causas cerradas en el histórico."
                : "Ninguna causa activa en esta vista."}
          </div>
        ) : (
          <div className="space-y-5">
            {grupos.map(({ estado, items }) => {
              const color = ESTADO_COLOR[estado] ?? "#64748b";
              return (
                <div key={estado}>
                  <div
                    style={{ borderColor: color, backgroundColor: `${color}12` }}
                    className="mb-2 flex items-center gap-2 rounded-lg border-l-4 px-3 py-1.5"
                  >
                    <span style={{ backgroundColor: color }} className="size-2 shrink-0 rounded-full" />
                    <span className="text-sm font-semibold capitalize">{estado}</span>
                    <span className="text-xs text-muted-foreground">· {items.length}</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border bg-white">
                    {items.map((c) => {
                      const prox = proximaClave(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setFichaId(c.id)}
                          className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{c.cliente ?? c.caratula}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {[c.rit_rol, c.tribunal].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          <CalidadBadge calidad={c.calidad} />
                          <span className="hidden w-14 shrink-0 text-xs text-muted-foreground sm:block">
                            {c.materia ?? ""}
                          </span>
                          {prox ? (
                            <span className="hidden shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium sm:inline-flex">
                              📅 {formatFecha(prox)}
                            </span>
                          ) : null}
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            📌 {c.hitos.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Haz clic en una causa para abrir su ficha; las causas se agrupan por estado.
        </p>
      </div>

      {/* ===== Ficha de causa ===== */}
      <Sheet open={!!fichaId} onOpenChange={(o) => !o && setFichaId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:!max-w-lg">
          {ficha ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="text-base leading-snug">
                    {ficha.cliente ?? ficha.caratula}
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
                <SheetDescription className="sr-only">Ficha de la causa</SheetDescription>
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={ficha.estado} />
                  <CalidadBadge calidad={ficha.calidad} />
                  {ficha.materia ? (
                    <span className="text-xs text-muted-foreground">{ficha.materia}</span>
                  ) : null}
                </div>
              </SheetHeader>

              <div className="space-y-6 p-4">
                {/* Intervinientes */}
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Intervinientes
                  </h4>
                  {partes ? (
                    <div className="grid grid-cols-1 gap-2">
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          Demandante {ficha.calidad === "Ataque" ? "· cliente" : ""}
                        </div>
                        <div className="text-sm">{partes.demandante}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/30 px-3 py-2">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          Demandado {ficha.calidad === "Defensa" ? "· cliente" : ""}
                        </div>
                        <div className="text-sm">{partes.demandado}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      {ficha.caratula}
                    </div>
                  )}
                </section>

                {/* Datos */}
                <section className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Campo label="Materia" value={ficha.materia} />
                  <Campo label="Calidad" value={ficha.calidad} />
                  <div className="col-span-2">
                    <Campo label="Tribunal" value={ficha.tribunal} />
                  </div>
                  <Campo label="RIT / ROL" value={ficha.rit_rol} />
                  <div>
                    <label className={labelClase}>Estado</label>
                    <select
                      value={ficha.estado ?? "prospecto"}
                      onChange={(e) =>
                        guardarCampo(ficha.id, { estado: e.target.value }, "Estado actualizado.")
                      }
                      className={campoInput}
                    >
                      {ESTADOS_CAUSA.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                      {ficha.estado && !ESTADOS_CAUSA.includes(ficha.estado as never) ? (
                        <option>{ficha.estado}</option>
                      ) : null}
                    </select>
                  </div>
                </section>

                {/* Agenda editable */}
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Agenda
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClase}>Próxima gestión</label>
                      <input
                        key={`pgf-${ficha.id}-${ficha.proxima_gestion_fecha ?? ""}-${ficha.proxima_gestion_hora ?? ""}`}
                        type="datetime-local"
                        defaultValue={dtLocal(ficha.proxima_gestion_fecha, ficha.proxima_gestion_hora)}
                        onBlur={(e) => {
                          const { fecha, hora } = splitDT(e.target.value);
                          if (
                            fecha !== (ficha.proxima_gestion_fecha ?? null) ||
                            hora !== (ficha.proxima_gestion_hora ?? null)
                          )
                            guardarCampo(
                              ficha.id,
                              { proxima_gestion_fecha: fecha, proxima_gestion_hora: hora },
                              "Próxima gestión actualizada.",
                            );
                        }}
                        className={campoInput}
                      />
                      <input
                        key={`pgd-${ficha.id}-${ficha.proxima_gestion_detalle ?? ""}`}
                        type="text"
                        defaultValue={ficha.proxima_gestion_detalle ?? ""}
                        placeholder="detalle (comparendo, contestación…)"
                        onBlur={(e) => {
                          const val = e.target.value.trim() || null;
                          if (val !== (ficha.proxima_gestion_detalle ?? null))
                            guardarCampo(
                              ficha.id,
                              { proxima_gestion_detalle: val },
                              "Detalle de gestión actualizado.",
                            );
                        }}
                        className={`${campoInput} mt-1`}
                      />
                    </div>
                    <div>
                      <label className={labelClase}>Próxima audiencia</label>
                      <input
                        key={`paf-${ficha.id}-${ficha.proxima_audiencia_fecha ?? ""}-${ficha.proxima_audiencia_hora ?? ""}`}
                        type="datetime-local"
                        defaultValue={dtLocal(ficha.proxima_audiencia_fecha, ficha.proxima_audiencia_hora)}
                        onBlur={(e) => {
                          const { fecha, hora } = splitDT(e.target.value);
                          if (
                            fecha !== (ficha.proxima_audiencia_fecha ?? null) ||
                            hora !== (ficha.proxima_audiencia_hora ?? null)
                          )
                            guardarCampo(
                              ficha.id,
                              { proxima_audiencia_fecha: fecha, proxima_audiencia_hora: hora },
                              "Audiencia actualizada.",
                            );
                        }}
                        className={campoInput}
                      />
                      <select
                        value={ficha.proxima_audiencia_tipo ?? ""}
                        onChange={(e) =>
                          guardarCampo(
                            ficha.id,
                            { proxima_audiencia_tipo: e.target.value || null },
                            "Audiencia actualizada.",
                          )
                        }
                        className={`${campoInput} mt-1`}
                      >
                        <option value="">— tipo —</option>
                        {TIPOS_AUDIENCIA.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                        {ficha.proxima_audiencia_tipo &&
                        !TIPOS_AUDIENCIA.includes(ficha.proxima_audiencia_tipo) ? (
                          <option>{ficha.proxima_audiencia_tipo}</option>
                        ) : null}
                      </select>
                    </div>
                  </div>
                </section>

                {/* Bitácora de hitos */}
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Bitácora de hitos
                  </h4>
                  <div className="border-l-[3px] border-[var(--brand-teal,#17A2B8)] pl-3">
                    {hitosFicha.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Sin hitos registrados todavía.
                      </p>
                    ) : (
                      hitosFicha.map((h) => (
                        <div key={h.id} className="flex gap-3 py-0.5 text-xs">
                          <span className="w-28 shrink-0 font-bold text-teal-700">
                            {fmtFechaHora(h.fecha, h.hora)}
                          </span>
                          <span>{h.detalle}</span>
                        </div>
                      ))
                    )}
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        enviarHito(ficha.id, e.currentTarget);
                      }}
                    >
                      <Input name="fecha" type="date" required className="h-8 w-36 text-xs" />
                      <Input name="hora" type="time" className="h-8 w-24 text-xs" />
                      <Input
                        name="detalle"
                        required
                        placeholder="Demanda presentada · Notificación…"
                        className="h-8 min-w-48 flex-1 text-xs"
                      />
                      <Button type="submit" size="sm" disabled={pendiente}>
                        + Hito
                      </Button>
                    </form>
                  </div>
                </section>

                {ficha.carpeta_sharepoint ? (
                  <a
                    href={ficha.carpeta_sharepoint}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[var(--brand-teal,#17A2B8)] hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Carpeta SharePoint
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
