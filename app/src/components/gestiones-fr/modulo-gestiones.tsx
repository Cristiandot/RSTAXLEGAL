"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, ExternalLink, Plus, Trash2, X } from "lucide-react";
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
  actualizarGestion,
  agregarHitoGestion,
  crearGestion,
  editarHitoGestion,
  eliminarHitoGestion,
} from "./actions";
import { dtLocal, fmtFechaHora, splitDT } from "./fecha-hora";
import {
  ESTADOS_GESTION,
  ESTADO_GESTION_COLOR,
  TIPOS_GESTION,
  type GestionLegal,
} from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";
const campoInput =
  "h-8 w-full rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";

function EstadoBadge({ estado }: { estado: string | null }) {
  const color = (estado && ESTADO_GESTION_COLOR[estado]) || "#64748b";
  return (
    <span
      style={{ backgroundColor: `${color}1f`, color, borderColor: `${color}55` }}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
    >
      <span style={{ backgroundColor: color }} className="size-1.5 shrink-0 rounded-full" />
      {estado ?? "—"}
    </span>
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

export function ModuloGestiones({
  gestiones,
  recargar,
}: {
  gestiones: GestionLegal[];
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [formNueva, setFormNueva] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);

  const nTerminadas = useMemo(
    () => gestiones.filter((g) => g.estado === "Terminada").length,
    [gestiones],
  );

  const filtradas = useMemo(
    () => gestiones.filter((g) => (verHistorico ? g.estado === "Terminada" : g.estado !== "Terminada")),
    [gestiones, verHistorico],
  );

  const grupos = useMemo(() => {
    const map = new Map<string, GestionLegal[]>();
    for (const g of filtradas) {
      const e = g.estado ?? "En análisis";
      const arr = map.get(e);
      if (arr) arr.push(g);
      else map.set(e, [g]);
    }
    const pos = (e: string) => {
      const i = ESTADOS_GESTION.indexOf(e as never);
      return i === -1 ? 999 : i;
    };
    return [...map.entries()]
      .sort((a, b) => pos(a[0]) - pos(b[0]))
      .map(([estado, items]) => ({
        estado,
        items: items.sort((x, y) => {
          const fx = x.proxima_gestion_fecha ?? "";
          const fy = y.proxima_gestion_fecha ?? "";
          if (fx && fy && fx !== fy) return fx < fy ? -1 : 1;
          if (fx && !fy) return -1;
          if (!fx && fy) return 1;
          return x.titulo.localeCompare(y.titulo);
        }),
      }));
  }, [filtradas]);

  const ficha = fichaId ? (gestiones.find((g) => g.id === fichaId) ?? null) : null;
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

  function guardarCampo(id: string, patch: Parameters<typeof actualizarGestion>[1], exito: string) {
    ejecutar(() => actualizarGestion(id, patch), exito);
  }

  function enviarNueva(form: HTMLFormElement) {
    const fd = new FormData(form);
    const v = (k: string) => (fd.get(k) as string)?.trim() || null;
    ejecutar(
      () =>
        crearGestion({
          titulo: (fd.get("titulo") as string) ?? "",
          tipo: v("tipo"),
          cliente: v("cliente"),
          contraparte: v("contraparte"),
          estado: (fd.get("estado") as string) || "En análisis",
          proxima_gestion_fecha: v("pg_fecha"),
          proxima_gestion_hora: v("pg_hora"),
          proxima_gestion_detalle: v("pg_detalle"),
          carpeta_sharepoint: v("carpeta"),
          notas: v("notas"),
        }),
      "Gestión registrada.",
    );
    setFormNueva(false);
  }

  function enviarHito(gestionId: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    ejecutar(
      () =>
        agregarHitoGestion(
          gestionId,
          (fd.get("fecha") as string) ?? "",
          (fd.get("detalle") as string) ?? "",
          (fd.get("hora") as string) || null,
        ),
      "Hito agregado.",
    );
    form.reset();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">
          {verHistorico ? "Histórico — gestiones terminadas" : "Gestiones"} ({filtradas.length})
        </h3>
        <Button
          variant={verHistorico ? "default" : "outline"}
          size="sm"
          onClick={() => setVerHistorico((v) => !v)}
        >
          <Archive className="size-4" />
          {verHistorico ? "Ver activas" : `Histórico (${nTerminadas})`}
        </Button>
        <Button size="sm" onClick={() => setFormNueva((v) => !v)}>
          <Plus className="size-4" />
          Nueva gestión
        </Button>
      </div>

      {formNueva ? (
        <form
          className="rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            enviarNueva(e.currentTarget);
          }}
        >
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <label className={labelClase}>Título *</label>
              <Input name="titulo" required placeholder="Compraventa inmueble Rol 123-4, Concón" />
            </div>
            <div>
              <label className={labelClase}>Tipo</label>
              <select name="tipo" className={`${selectClase} w-full`} defaultValue="Compraventa">
                {TIPOS_GESTION.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClase}>Cliente</label>
              <Input name="cliente" placeholder="Nombre del cliente" />
            </div>
            <div>
              <label className={labelClase}>Contraparte</label>
              <Input name="contraparte" placeholder="Otra parte (si aplica)" />
            </div>
            <div>
              <label className={labelClase}>Estado</label>
              <select name="estado" className={`${selectClase} w-full`} defaultValue="En análisis">
                {ESTADOS_GESTION.map((e) => (
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
              <Input name="pg_detalle" placeholder="Firma, inscripción CBR…" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClase}>Notas</label>
              <Input name="notas" placeholder="Detalle libre" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClase}>Carpeta SharePoint</label>
              <Input name="carpeta" placeholder="https://rstaxlegalcl.sharepoint.com/…" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendiente}>
              Guardar gestión
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFormNueva(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {filtradas.length === 0 ? (
        <div className="rounded-xl border bg-white py-10 text-center text-sm text-muted-foreground">
          {gestiones.length === 0
            ? "Sin gestiones registradas."
            : verHistorico
              ? "Sin gestiones terminadas."
              : "Ninguna gestión activa."}
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(({ estado, items }) => {
            const color = ESTADO_GESTION_COLOR[estado] ?? "#64748b";
            return (
              <div key={estado}>
                <div
                  style={{ borderColor: color, backgroundColor: `${color}12` }}
                  className="mb-2 flex items-center gap-2 rounded-lg border-l-4 px-3 py-1.5"
                >
                  <span style={{ backgroundColor: color }} className="size-2 shrink-0 rounded-full" />
                  <span className="text-sm font-semibold">{estado}</span>
                  <span className="text-xs text-muted-foreground">· {items.length}</span>
                </div>
                <div className="overflow-hidden rounded-xl border bg-white">
                  {items.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setFichaId(g.id)}
                      className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{g.titulo}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {[g.tipo, g.cliente].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      {g.proxima_gestion_fecha ? (
                        <span className="hidden shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium sm:inline-flex">
                          📅 {fmtFechaHora(g.proxima_gestion_fecha, g.proxima_gestion_hora)}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        📌 {g.hitos.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== Ficha de gestión ===== */}
      <Sheet open={!!fichaId} onOpenChange={(o) => !o && setFichaId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:!max-w-lg">
          {ficha ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="text-base leading-snug">{ficha.titulo}</SheetTitle>
                  <button
                    type="button"
                    onClick={() => setFichaId(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Cerrar"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <SheetDescription className="sr-only">Ficha de la gestión</SheetDescription>
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={ficha.estado} />
                  {ficha.tipo ? (
                    <span className="text-xs text-muted-foreground">{ficha.tipo}</span>
                  ) : null}
                </div>
              </SheetHeader>

              <div className="space-y-6 p-4">
                <section className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Campo label="Tipo" value={ficha.tipo} />
                  <div>
                    <label className={labelClase}>Estado</label>
                    <select
                      value={ficha.estado ?? "En análisis"}
                      onChange={(e) =>
                        guardarCampo(ficha.id, { estado: e.target.value }, "Estado actualizado.")
                      }
                      className={campoInput}
                    >
                      {ESTADOS_GESTION.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                      {ficha.estado && !ESTADOS_GESTION.includes(ficha.estado as never) ? (
                        <option>{ficha.estado}</option>
                      ) : null}
                    </select>
                  </div>
                  <Campo label="Cliente" value={ficha.cliente} />
                  <Campo label="Contraparte" value={ficha.contraparte} />
                </section>

                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Próxima gestión
                  </h4>
                  <div className="grid gap-3 sm:grid-cols-2">
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
                      placeholder="detalle…"
                      onBlur={(e) => {
                        const val = e.target.value.trim() || null;
                        if (val !== (ficha.proxima_gestion_detalle ?? null))
                          guardarCampo(ficha.id, { proxima_gestion_detalle: val }, "Detalle actualizado.");
                      }}
                      className={campoInput}
                    />
                  </div>
                </section>

                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Notas
                  </h4>
                  <textarea
                    key={`notas-${ficha.id}`}
                    defaultValue={ficha.notas ?? ""}
                    placeholder="Notas de la gestión…"
                    rows={3}
                    onBlur={(e) => {
                      const val = e.target.value.trim() || null;
                      if (val !== (ficha.notas ?? null))
                        guardarCampo(ficha.id, { notas: val }, "Notas actualizadas.");
                    }}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                  />
                </section>

                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Bitácora de hitos
                  </h4>
                  <div className="border-l-[3px] border-[var(--brand-teal,#17A2B8)] pl-3">
                    {hitosFicha.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Sin hitos todavía.</p>
                    ) : (
                      hitosFicha.map((h) => (
                        <div key={h.id} className="group flex items-center gap-2 py-0.5">
                          <input
                            key={`hf-${h.id}-${h.fecha}`}
                            type="date"
                            defaultValue={h.fecha}
                            onBlur={(e) => {
                              const val = e.target.value;
                              if (val && val !== h.fecha)
                                ejecutar(() => editarHitoGestion(h.id, { fecha: val }), "Hito actualizado.");
                            }}
                            className="h-7 w-32 shrink-0 rounded-md border border-input bg-white px-1.5 text-[11px] font-semibold text-teal-700 shadow-xs focus:outline-2 focus:outline-ring/50"
                          />
                          <input
                            key={`hh-${h.id}-${h.hora ?? ""}`}
                            type="time"
                            defaultValue={h.hora ?? ""}
                            onBlur={(e) => {
                              const val = e.target.value || null;
                              if (val !== (h.hora ?? null))
                                ejecutar(() => editarHitoGestion(h.id, { hora: val }), "Hito actualizado.");
                            }}
                            className="h-7 w-20 shrink-0 rounded-md border border-input bg-white px-1.5 text-[11px] shadow-xs focus:outline-2 focus:outline-ring/50"
                          />
                          <input
                            key={`hd-${h.id}-${h.detalle}`}
                            type="text"
                            defaultValue={h.detalle}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== h.detalle)
                                ejecutar(() => editarHitoGestion(h.id, { detalle: val }), "Hito actualizado.");
                            }}
                            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-white px-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                          />
                          <button
                            type="button"
                            onClick={() => ejecutar(() => eliminarHitoGestion(h.id), "Hito eliminado.")}
                            disabled={pendiente}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600"
                            title="Eliminar hito"
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
                        enviarHito(ficha.id, e.currentTarget);
                      }}
                    >
                      <Input name="fecha" type="date" required className="h-8 w-36 text-xs" />
                      <Input name="hora" type="time" className="h-8 w-24 text-xs" />
                      <Input
                        name="detalle"
                        required
                        placeholder="Escritura firmada · Inscripción CBR…"
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
