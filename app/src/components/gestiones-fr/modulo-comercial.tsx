"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
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
import {
  actualizarContacto,
  actualizarCotizacion,
  crearContacto,
  crearCotizacion,
} from "./actions";
import {
  ESTADOS_CONTACTO,
  ESTADOS_COTIZACION,
  MEDIOS_CONTACTO,
  SEGMENTOS_CONTACTO,
  SEGMENTO_LABEL,
  type Contacto,
  type Cotizacion,
} from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

const SEGMENTO_BADGE: Record<string, string> = {
  A: "border-sky-200 bg-sky-50 text-sky-700",
  B: "border-gray-200 bg-gray-100 text-gray-600",
  C: "border-teal-200 bg-teal-50 text-teal-700",
  D: "border-violet-200 bg-violet-50 text-violet-700",
};

export function ModuloComercial({
  contactos,
  cotizaciones,
  recargar,
}: {
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
  recargar: () => Promise<void>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [formContacto, setFormContacto] = useState(false);
  const [formCotiz, setFormCotiz] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const conteos = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contactos) m.set(c.estado, (m.get(c.estado) ?? 0) + 1);
    return m;
  }, [contactos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return contactos.filter((c) => {
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (!q) return true;
      return `${c.nombre} ${c.empresa_rubro ?? ""} ${c.referido_por ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [contactos, busqueda, filtroEstado]);

  const eventos = useMemo<EventoCalendario[]>(() => {
    const evs: EventoCalendario[] = [];
    for (const c of contactos) {
      if (c.fecha_proxima_accion && !["Sin interés", "Referido entregado"].includes(c.estado))
        evs.push({ fecha: c.fecha_proxima_accion, clase: "prosp", texto: c.nombre });
    }
    for (const q of cotizaciones) {
      if (q.proxima_accion_fecha)
        evs.push({
          fecha: q.proxima_accion_fecha,
          clase: "cotiz",
          texto: `${q.numero} — ${q.destinatario}`,
        });
    }
    return evs;
  }, [contactos, cotizaciones]);

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

  function enviarContacto(form: HTMLFormElement) {
    const fd = new FormData(form);
    const v = (k: string) => (fd.get(k) as string)?.trim() || null;
    ejecutar(
      () =>
        crearContacto({
          nombre: (fd.get("nombre") as string) ?? "",
          segmento: (fd.get("segmento") as string) || "C",
          empresa_rubro: v("empresa"),
          medio_preferido: v("medio"),
          contacto: v("dato"),
          referido_por: v("referido_por"),
          estado: (fd.get("estado") as string) || "Por contactar",
          fecha_proxima_accion: v("fecha"),
          notas: v("notas"),
        }),
      "Contacto agregado a la base.",
    );
    setFormContacto(false);
  }

  function enviarCotizacion(form: HTMLFormElement) {
    const fd = new FormData(form);
    const v = (k: string) => (fd.get(k) as string)?.trim() || null;
    startTransition(async () => {
      const res = await crearCotizacion({
        destinatario: (fd.get("destinatario") as string) ?? "",
        tier: v("tier"),
        monto: v("monto"),
        proxima_accion_fecha: v("fecha"),
        proxima_accion_detalle: v("accion"),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Error al guardar.");
        return;
      }
      toast.success(`Cotización ${res.numero} registrada.`);
      await recargar();
    });
    setFormCotiz(false);
  }

  return (
    <div className="space-y-6">
      {/* ===== Calendario comercial ===== */}
      <div>
        <LeyendaCalendario
          items={[
            { color: "bg-violet-500", label: "Prospección (próxima acción)" },
            { color: "bg-sky-600", label: "Cotizaciones" },
            { color: "bg-[var(--brand-teal,#17A2B8)]", label: "Hoy" },
          ]}
        />
        <CalendarioFR eventos={eventos} />
      </div>

      {/* ===== Pipeline de prospección ===== */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            Pipeline de prospección ({contactos.length} contactos)
          </h3>
          <Button size="sm" onClick={() => setFormContacto((v) => !v)}>
            <Plus className="size-4" />
            Nuevo prospecto / contacto
          </Button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {ESTADOS_CONTACTO.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setFiltroEstado((prev) => (prev === e ? "" : e))}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                filtroEstado === e
                  ? "border-[var(--brand-teal,#17A2B8)] bg-accent font-semibold"
                  : "bg-white text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <b className="mr-1 text-sm text-foreground">{conteos.get(e) ?? 0}</b>
              {e}
            </button>
          ))}
        </div>

        {formContacto ? (
          <form
            className="mb-4 rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviarContacto(e.currentTarget);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClase}>Nombre *</label>
                <Input name="nombre" required placeholder="Juan Soto" />
              </div>
              <div>
                <label className={labelClase}>Segmento</label>
                <select name="segmento" className={`${selectClase} w-full`} defaultValue="C">
                  {SEGMENTOS_CONTACTO.map((s) => (
                    <option key={s} value={s}>
                      {SEGMENTO_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Empresa / rubro</label>
                <Input name="empresa" placeholder="Ferretería El Clavo" />
              </div>
              <div>
                <label className={labelClase}>Medio preferido</label>
                <select name="medio" className={`${selectClase} w-full`} defaultValue="WhatsApp">
                  {MEDIOS_CONTACTO.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Dato de contacto</label>
                <Input name="dato" placeholder="+56 9 …" />
              </div>
              <div>
                <label className={labelClase}>Referido por (solo segmento D)</label>
                <Input name="referido_por" placeholder="Diego Segovia" />
              </div>
              <div>
                <label className={labelClase}>Estado</label>
                <select name="estado" className={`${selectClase} w-full`} defaultValue="Por contactar">
                  {ESTADOS_CONTACTO.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClase}>Próxima acción — fecha</label>
                <Input name="fecha" type="date" />
              </div>
              <div>
                <label className={labelClase}>Notas</label>
                <Input name="notas" placeholder="Contexto, gancho, cercanía…" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                Guardar contacto
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFormContacto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <div className="relative mb-2 max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, empresa o referente…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[480px] overflow-auto rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contacto</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Empresa / rubro</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Próxima acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sin contactos que calcen con el filtro.
                  </TableCell>
                </TableRow>
              ) : null}
              {filtrados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{c.nombre}</div>
                    {c.referido_por ? (
                      <div className="text-xs text-muted-foreground">
                        referido por {c.referido_por}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={SEGMENTO_BADGE[c.segmento] ?? ""}>
                      {c.segmento}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-sm" title={c.empresa_rubro ?? undefined}>
                    {c.empresa_rubro ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.medio_preferido ?? "—"}
                  </TableCell>
                  <TableCell>
                    <select
                      className={selectClase}
                      value={c.estado}
                      disabled={pendiente}
                      onChange={(e) =>
                        ejecutar(
                          () => actualizarContacto(c.id, { estado: e.target.value }),
                          "Estado actualizado.",
                        )
                      }
                    >
                      {ESTADOS_CONTACTO.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <input
                      type="date"
                      className={selectClase}
                      value={c.fecha_proxima_accion ?? ""}
                      disabled={pendiente}
                      onChange={(e) =>
                        ejecutar(
                          () =>
                            actualizarContacto(c.id, {
                              fecha_proxima_accion: e.target.value || null,
                            }),
                          "Próxima acción actualizada.",
                        )
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ===== Cotizaciones ===== */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-sm font-semibold">
            Seguimiento de cotizaciones ({cotizaciones.length})
          </h3>
          <Button size="sm" onClick={() => setFormCotiz((v) => !v)}>
            <Plus className="size-4" />
            Nueva cotización
          </Button>
        </div>

        {formCotiz ? (
          <form
            className="mb-4 rounded-xl border border-dashed border-[var(--brand-teal,#17A2B8)] bg-muted/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              enviarCotizacion(e.currentTarget);
            }}
          >
            <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelClase}>Destinatario *</label>
                <Input name="destinatario" required placeholder="Empresa — contacto" />
              </div>
              <div>
                <label className={labelClase}>Tier</label>
                <select name="tier" className={`${selectClase} w-full`} defaultValue="TERCERA">
                  <option>OPEN</option>
                  <option>SEGUNDA</option>
                  <option>TERCERA</option>
                  <option>PUBA</option>
                  <option>Gestion puntual</option>
                </select>
              </div>
              <div>
                <label className={labelClase}>Monto</label>
                <Input name="monto" placeholder="UF 7 / mes · UF 15 fijo" />
              </div>
              <div>
                <label className={labelClase}>Próxima acción — fecha</label>
                <Input name="fecha" type="date" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClase}>Próxima acción — detalle</label>
                <Input name="accion" placeholder="Enviar propuesta, agendar reunión…" />
              </div>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              El correlativo AAAA-NNN se asigna automáticamente al guardar.
            </p>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pendiente}>
                Guardar cotización
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setFormCotiz(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : null}

        <div className="overflow-x-auto rounded-xl border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Próxima acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cotizaciones.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Sin cotizaciones registradas.
                  </TableCell>
                </TableRow>
              ) : null}
              {cotizaciones.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-semibold whitespace-nowrap">
                    {q.numero}
                    {q.fecha_emision ? (
                      <div className="text-xs font-normal text-muted-foreground">
                        {formatFecha(q.fecha_emision)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-72 text-sm">{q.destinatario}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        q.tier === "OPEN"
                          ? "border-violet-200 bg-violet-50 text-violet-700"
                          : q.tier === "Gestion puntual"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-teal-200 bg-teal-50 text-teal-700"
                      }
                    >
                      {q.tier ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{q.monto ?? "—"}</TableCell>
                  <TableCell>
                    <select
                      className={selectClase}
                      value={q.estado}
                      disabled={pendiente}
                      onChange={(e) =>
                        ejecutar(
                          () => actualizarCotizacion(q.id, { estado: e.target.value }),
                          "Estado actualizado.",
                        )
                      }
                    >
                      {ESTADOS_COTIZACION.map((e) => (
                        <option key={e}>{e}</option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="max-w-72 text-xs">
                    {q.proxima_accion_fecha ? (
                      <span className="font-semibold">{formatFecha(q.proxima_accion_fecha)} · </span>
                    ) : null}
                    <span className="line-clamp-2" title={q.proxima_accion_detalle ?? undefined}>
                      {q.proxima_accion_detalle ?? "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
