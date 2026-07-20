"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ExternalLink, Plus } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarioFR, LeyendaCalendario, type EventoCalendario } from "./calendario";
import { actualizarCausa, agendarEnCausa, agregarHito, crearCausa } from "./actions";
import { ESTADOS_CAUSA, MATERIAS_CAUSA, TRIBUNALES_CAUSA, type Causa } from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";
const inlineFecha =
  "h-7 w-36 rounded-md border border-input bg-white px-1.5 text-[11px] shadow-xs focus:outline-2 focus:outline-ring/50";
const inlineTexto =
  "h-7 w-full min-w-40 rounded-md border border-input bg-white px-1.5 text-[11px] shadow-xs focus:outline-2 focus:outline-ring/50";
const inlineSelect =
  "h-7 w-full rounded-md border border-input bg-white px-1.5 text-[11px] shadow-xs focus:outline-2 focus:outline-ring/50";

const TIPOS_AUDIENCIA = ["Audiencia preparatoria", "Audiencia de juicio"];

export function ModuloCausas({
  causas,
  recargar,
}: {
  causas: Causa[];
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [formCausa, setFormCausa] = useState(false);
  const [formAgenda, setFormAgenda] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [filtroMateria, setFiltroMateria] = useState<string>("Todas");

  const eventos = useMemo<EventoCalendario[]>(() => {
    const evs: EventoCalendario[] = [];
    for (const c of causas) {
      const quien = c.cliente ?? c.caratula;
      if (c.proxima_gestion_fecha)
        evs.push({ fecha: c.proxima_gestion_fecha, clase: "causa", texto: `Gestión — ${quien}` });
      if (c.proxima_audiencia_fecha)
        evs.push({
          fecha: c.proxima_audiencia_fecha,
          clase: "causa",
          texto: `${c.proxima_audiencia_tipo ?? "Audiencia"} — ${quien}`,
        });
    }
    return evs;
  }, [causas]);

  const causasFiltradas = useMemo(
    () => (filtroMateria === "Todas" ? causas : causas.filter((c) => c.materia === filtroMateria)),
    [causas, filtroMateria],
  );

  function toggleHitos(id: string) {
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

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
          proxima_gestion_detalle: v("pg_detalle"),
          carpeta_sharepoint: v("carpeta"),
        }),
      "Causa registrada.",
    );
    setFormCausa(false);
  }

  function enviarAgenda(form: HTMLFormElement) {
    const fd = new FormData(form);
    ejecutar(
      () =>
        agendarEnCausa(fd.get("causa") as string, {
          tipo: (fd.get("tipo") as "audiencia" | "gestion") ?? "gestion",
          fecha: (fd.get("fecha") as string) ?? "",
          detalle: (fd.get("detalle") as string) ?? "",
        }),
      "Agendado y registrado en la bitácora.",
    );
    setFormAgenda(false);
  }

  function enviarHito(causaId: string, form: HTMLFormElement) {
    const fd = new FormData(form);
    ejecutar(
      () => agregarHito(causaId, (fd.get("fecha") as string) ?? "", (fd.get("detalle") as string) ?? ""),
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
            { color: "bg-[var(--brand-teal,#17A2B8)]", label: "Hoy" },
          ]}
        />
        <CalendarioFR eventos={eventos} />
      </div>

      {/* ===== Registro de causas ===== */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">
            Registro de causas ({causasFiltradas.length}
            {filtroMateria !== "Todas" ? ` de ${causas.length}` : ""})
          </h3>
          <select
            value={filtroMateria}
            onChange={(e) => setFiltroMateria(e.target.value)}
            className={`${selectClase} mr-auto`}
            title="Filtrar por materia"
          >
            <option value="Todas">Todas las materias</option>
            {MATERIAS_CAUSA.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setFormAgenda((v) => !v)}>
            <CalendarPlus className="size-4" />
            Agendar audiencia / gestión
          </Button>
          <Button size="sm" onClick={() => setFormCausa((v) => !v)}>
            <Plus className="size-4" />
            Nueva causa
          </Button>
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
                <Input name="pg_fecha" type="date" />
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

        {formAgenda ? (
          <form
            className="mb-4 rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviarAgenda(e.currentTarget);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClase}>Causa</label>
                <select name="causa" className={`${selectClase} w-full`}>
                  {causas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cliente ?? c.caratula}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Tipo</label>
                <select name="tipo" className={`${selectClase} w-full`} defaultValue="audiencia">
                  <option value="audiencia">Audiencia</option>
                  <option value="gestion">Gestión / plazo</option>
                </select>
              </div>
              <div>
                <label className={labelClase}>Fecha</label>
                <Input name="fecha" type="date" required />
              </div>
              <div>
                <label className={labelClase}>Detalle</label>
                <Input name="detalle" required placeholder="Audiencia preparatoria 10:00" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                Agendar
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFormAgenda(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <div className="overflow-x-auto rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Causa</TableHead>
                <TableHead>Calidad</TableHead>
                <TableHead>Materia</TableHead>
                <TableHead>Tribunal / RIT</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Próxima gestión</TableHead>
                <TableHead>Audiencia</TableHead>
                <TableHead>Hitos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {causasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    {causas.length === 0
                      ? "Sin causas registradas."
                      : "Ninguna causa en esta materia."}
                  </TableCell>
                </TableRow>
              ) : null}
              {causasFiltradas.map((c) => {
                const abierta = abiertas.has(c.id);
                const hitosOrden = [...c.hitos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
                return [
                  <TableRow key={c.id}>
                    <TableCell className="align-top">
                      <div className="font-medium">{c.cliente ?? c.caratula}</div>
                      {c.cliente ? (
                        <div className="text-xs text-muted-foreground">{c.caratula}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant="outline"
                        className={
                          c.calidad === "Ataque"
                            ? "border-teal-200 bg-teal-50 text-teal-700"
                            : c.calidad === "Defensa"
                              ? "border-violet-200 bg-violet-50 text-violet-700"
                              : ""
                        }
                      >
                        {c.calidad ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-sm">{c.materia ?? "—"}</TableCell>
                    <TableCell className="max-w-56 align-top text-xs">
                      <div className="truncate" title={c.tribunal ?? undefined}>
                        {c.tribunal ?? "—"}
                      </div>
                      {c.rit_rol ? (
                        <div className="text-muted-foreground">{c.rit_rol}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <select
                        className={selectClase}
                        value={c.estado ?? "prospecto"}
                        disabled={pendiente}
                        onChange={(e) =>
                          guardarCampo(c.id, { estado: e.target.value }, "Estado actualizado.")
                        }
                      >
                        {ESTADOS_CAUSA.map((e) => (
                          <option key={e}>{e}</option>
                        ))}
                        {c.estado && !ESTADOS_CAUSA.includes(c.estado as never) ? (
                          <option>{c.estado}</option>
                        ) : null}
                      </select>
                    </TableCell>
                    <TableCell className="max-w-64 align-top">
                      <div className="flex flex-col gap-1">
                        <input
                          type="date"
                          value={c.proxima_gestion_fecha ?? ""}
                          disabled={pendiente}
                          onChange={(e) =>
                            guardarCampo(
                              c.id,
                              { proxima_gestion_fecha: e.target.value || null },
                              "Próxima gestión actualizada.",
                            )
                          }
                          className={inlineFecha}
                        />
                        <input
                          type="text"
                          defaultValue={c.proxima_gestion_detalle ?? ""}
                          placeholder="detalle…"
                          disabled={pendiente}
                          onBlur={(e) => {
                            const val = e.target.value.trim() || null;
                            if (val !== (c.proxima_gestion_detalle ?? null))
                              guardarCampo(
                                c.id,
                                { proxima_gestion_detalle: val },
                                "Detalle de gestión actualizado.",
                              );
                          }}
                          className={inlineTexto}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <input
                          type="date"
                          value={c.proxima_audiencia_fecha ?? ""}
                          disabled={pendiente}
                          onChange={(e) =>
                            guardarCampo(
                              c.id,
                              { proxima_audiencia_fecha: e.target.value || null },
                              "Audiencia actualizada.",
                            )
                          }
                          className={inlineFecha}
                        />
                        <select
                          value={c.proxima_audiencia_tipo ?? ""}
                          disabled={pendiente}
                          onChange={(e) =>
                            guardarCampo(
                              c.id,
                              { proxima_audiencia_tipo: e.target.value || null },
                              "Audiencia actualizada.",
                            )
                          }
                          className={inlineSelect}
                        >
                          <option value="">— tipo —</option>
                          {TIPOS_AUDIENCIA.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                          {c.proxima_audiencia_tipo &&
                          !TIPOS_AUDIENCIA.includes(c.proxima_audiencia_tipo) ? (
                            <option>{c.proxima_audiencia_tipo}</option>
                          ) : null}
                        </select>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <button
                        type="button"
                        onClick={() => toggleHitos(c.id)}
                        className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-teal-700 hover:bg-teal-100"
                      >
                        📌 {c.hitos.length} {abierta ? "▴" : "▾"}
                      </button>
                    </TableCell>
                  </TableRow>,
                  abierta ? (
                    <TableRow key={`${c.id}-hitos`} className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-muted/30">
                        <div className="my-2 ml-1 border-l-[3px] border-[var(--brand-teal,#17A2B8)] py-1 pl-4">
                          <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                            Bitácora de hitos — {c.cliente ?? c.caratula}
                          </div>
                          {hitosOrden.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              Sin hitos registrados todavía.
                            </p>
                          ) : (
                            hitosOrden.map((h) => (
                              <div key={h.id} className="flex gap-3 py-0.5 text-xs">
                                <span className="w-20 shrink-0 font-bold text-teal-700">
                                  {formatFecha(h.fecha)}
                                </span>
                                <span>{h.detalle}</span>
                              </div>
                            ))
                          )}
                          <form
                            className="mt-2 flex flex-wrap items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              enviarHito(c.id, e.currentTarget);
                            }}
                          >
                            <Input name="fecha" type="date" required className="h-8 w-36 text-xs" />
                            <Input
                              name="detalle"
                              required
                              placeholder="Demanda presentada · Notificación · Sentencia…"
                              className="h-8 min-w-56 flex-1 text-xs"
                            />
                            <Button type="submit" size="sm" disabled={pendiente}>
                              + Agregar hito
                            </Button>
                          </form>
                          {c.carpeta_sharepoint ? (
                            <a
                              href={c.carpeta_sharepoint}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--brand-teal,#17A2B8)] hover:underline"
                            >
                              <ExternalLink className="size-3.5" />
                              Carpeta SharePoint
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null,
                ];
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Estados y catálogos alineados con la vista Causas de ClickUp. La fecha de próxima gestión
          y de audiencia se editan directo en la tabla.
        </p>
      </div>
    </div>
  );
}
