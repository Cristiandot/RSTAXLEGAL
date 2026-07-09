"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, ExternalLink, Plus } from "lucide-react";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ESTADOS_CAUSA, type Causa } from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

function diasHasta(fechaIso: string): number {
  const [y, m, d] = fechaIso.split("-").map(Number);
  const hoy = new Date();
  const objetivo = new Date(y, m - 1, d);
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((objetivo.getTime() - base.getTime()) / 86400000);
}

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
      if (c.plazo_fatal)
        evs.push({ fecha: c.plazo_fatal, clase: "fatal", texto: `🚨 Plazo fatal — ${quien}` });
    }
    return evs;
  }, [causas]);

  const fatales = useMemo(
    () =>
      causas
        .filter((c) => c.plazo_fatal && !["Terminada", "Archivada"].includes(c.estado ?? ""))
        .sort((a, b) => (a.plazo_fatal! < b.plazo_fatal! ? -1 : 1)),
    [causas],
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
          estado: (fd.get("estado") as string) || "En preparacion",
          proxima_gestion_fecha: v("pg_fecha"),
          proxima_gestion_detalle: v("pg_detalle"),
          plazo_fatal: v("plazo_fatal"),
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
      {/* ===== Calendario judicial + plazos fatales ===== */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <LeyendaCalendario
            items={[
              { color: "bg-red-500", label: "Audiencia / gestión" },
              { color: "bg-red-800", label: "Plazo fatal" },
              { color: "bg-[var(--brand-teal,#17A2B8)]", label: "Hoy" },
            ]}
          />
          <CalendarioFR eventos={eventos} />
        </div>
        <div className="w-full shrink-0 space-y-3 lg:w-72">
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="text-xs tracking-wide text-muted-foreground uppercase">
                ⏳ Plazos fatales
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {fatales.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin plazos fatales registrados.</p>
              ) : (
                fatales.map((c) => {
                  const dias = diasHasta(c.plazo_fatal!);
                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"
                      title={c.plazo_fatal_detalle ?? undefined}
                    >
                      <div className={`text-lg leading-none font-bold ${dias <= 14 ? "text-red-700" : "text-red-600"}`}>
                        {dias} días
                      </div>
                      <div className="mt-1 text-xs font-semibold">
                        {c.cliente ?? c.caratula} — {formatFecha(c.plazo_fatal)}
                      </div>
                      {c.plazo_fatal_detalle ? (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {c.plazo_fatal_detalle}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Registro de causas ===== */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            Registro de causas ({causas.length})
          </h3>
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
                <Input name="materia" placeholder="Laboral, Civil, Familia…" />
              </div>
              <div>
                <label className={labelClase}>Tribunal / instancia</label>
                <Input name="tribunal" placeholder="1° JLT Valparaíso (o pre-judicial IdT)" />
              </div>
              <div>
                <label className={labelClase}>RIT / ROL</label>
                <Input name="rit_rol" placeholder="O-123-2026 (vacío si pre-judicial)" />
              </div>
              <div>
                <label className={labelClase}>Estado</label>
                <select name="estado" className={`${selectClase} w-full`} defaultValue="En preparacion">
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
              <div>
                <label className={labelClase}>Plazo fatal</label>
                <Input name="plazo_fatal" type="date" />
              </div>
              <div className="sm:col-span-2">
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
                <TableHead>Plazo fatal</TableHead>
                <TableHead>Hitos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {causas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    Sin causas registradas.
                  </TableCell>
                </TableRow>
              ) : null}
              {causas.map((c) => {
                const abierta = abiertas.has(c.id);
                const hitosOrden = [...c.hitos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
                return [
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.cliente ?? c.caratula}</div>
                      <div className="text-xs text-muted-foreground">{c.caratula}</div>
                    </TableCell>
                    <TableCell>
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
                    <TableCell className="text-sm">{c.materia ?? "—"}</TableCell>
                    <TableCell className="max-w-56 text-xs">
                      <div className="truncate" title={c.tribunal ?? undefined}>
                        {c.tribunal ?? "—"}
                      </div>
                      {c.rit_rol ? (
                        <div className="text-muted-foreground">{c.rit_rol}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <select
                        className={selectClase}
                        value={c.estado ?? "En preparacion"}
                        disabled={pendiente}
                        onChange={(e) =>
                          ejecutar(
                            () => actualizarCausa(c.id, { estado: e.target.value }),
                            "Estado actualizado.",
                          )
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
                    <TableCell className="max-w-64 text-xs">
                      {c.proxima_gestion_fecha ? (
                        <span className="font-semibold">{formatFecha(c.proxima_gestion_fecha)} · </span>
                      ) : null}
                      <span className="line-clamp-2" title={c.proxima_gestion_detalle ?? undefined}>
                        {c.proxima_gestion_detalle ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.proxima_audiencia_fecha ? (
                        <>
                          <span className="font-semibold">{formatFecha(c.proxima_audiencia_fecha)}</span>
                          <div className="text-muted-foreground">{c.proxima_audiencia_tipo}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-bold whitespace-nowrap text-red-600">
                      {c.plazo_fatal ? `⚠ ${formatFecha(c.plazo_fatal)}` : "—"}
                    </TableCell>
                    <TableCell>
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
                      <TableCell colSpan={9} className="bg-muted/30">
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
          Quedan ~34 causas por migrar desde ClickUp a la tabla <code>gestion_causas_rs</code>.
        </p>
      </div>
    </div>
  );
}
