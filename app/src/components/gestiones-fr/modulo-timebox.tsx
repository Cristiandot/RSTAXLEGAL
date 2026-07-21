"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Causa, Contacto, Cotizacion, GestionLegal, Pendiente } from "./tipos";

const AREA_COLOR: Record<string, string> = {
  audiencia: "#3b82f6",
  causas: "#0ea5e9",
  gestiones: "#10b981",
  prospeccion: "#a855f7",
  pendiente: "#64748b",
};
const AREA_LABEL: Record<string, string> = {
  audiencia: "Audiencia",
  causas: "Gestión (causa)",
  gestiones: "Gestión",
  prospeccion: "Prospección",
  pendiente: "Pendiente",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDias(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Bloque = { key: string; hora: string | null; titulo: string; area: string; detalle: string };

function Chip({ b }: { b: Bloque }) {
  const color = AREA_COLOR[b.area] ?? "#64748b";
  return (
    <div
      style={{ borderColor: color, backgroundColor: `${color}12` }}
      className="rounded-lg border-l-4 px-2.5 py-1.5"
    >
      <div className="flex items-center gap-2">
        {b.hora ? (
          <span className="text-[11px] font-bold" style={{ color }}>
            {b.hora}
          </span>
        ) : null}
        <span className="truncate text-sm font-medium">{b.titulo}</span>
      </div>
      <div className="truncate text-[11px] text-muted-foreground">
        {AREA_LABEL[b.area] ?? b.area}
        {b.detalle ? ` · ${b.detalle}` : ""}
      </div>
    </div>
  );
}

export function ModuloTimeBox({
  causas,
  gestiones,
  contactos,
  cotizaciones,
  pendientes,
}: {
  causas: Causa[];
  gestiones: GestionLegal[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
  pendientes: Pendiente[];
}) {
  const [dia, setDia] = useState<string>(hoyIso());

  const bloques = useMemo(() => {
    const items: Bloque[] = [];
    for (const c of causas) {
      if (c.estado === "cerrada") continue;
      const quien = c.cliente ?? c.caratula;
      if (c.proxima_audiencia_fecha === dia)
        items.push({ key: `ca-${c.id}`, hora: c.proxima_audiencia_hora, titulo: quien, area: "audiencia", detalle: c.proxima_audiencia_tipo ?? "Audiencia" });
      if (c.proxima_gestion_fecha === dia)
        items.push({ key: `cg-${c.id}`, hora: c.proxima_gestion_hora, titulo: quien, area: "causas", detalle: c.proxima_gestion_detalle ?? "Próxima gestión" });
    }
    for (const g of gestiones) {
      if (g.estado === "Terminada") continue;
      if (g.proxima_gestion_fecha === dia)
        items.push({ key: `g-${g.id}`, hora: g.proxima_gestion_hora, titulo: g.titulo, area: "gestiones", detalle: g.proxima_gestion_detalle ?? "Próxima gestión" });
    }
    for (const p of pendientes) {
      if (p.hecho) continue;
      if (p.fecha === dia)
        items.push({ key: `p-${p.id}`, hora: p.hora, titulo: p.titulo, area: "pendiente", detalle: p.detalle ?? "" });
    }
    for (const ct of contactos) {
      if (ct.fecha_proxima_accion === dia)
        items.push({ key: `pc-${ct.id}`, hora: null, titulo: ct.nombre, area: "prospeccion", detalle: "Próxima acción" });
    }
    for (const q of cotizaciones) {
      if (q.proxima_accion_fecha === dia)
        items.push({ key: `pq-${q.id}`, hora: null, titulo: q.destinatario, area: "prospeccion", detalle: q.proxima_accion_detalle ?? "Próxima acción" });
    }
    return items;
  }, [causas, gestiones, contactos, cotizaciones, pendientes, dia]);

  const sinHora = bloques.filter((b) => !b.hora).sort((a, b) => a.titulo.localeCompare(b.titulo));
  const conHora = bloques.filter((b) => b.hora).sort((a, b) => (a.hora! < b.hora! ? -1 : 1));

  // Rango de horas a mostrar: 08–19 por defecto, ampliado si hay bloques fuera.
  const horasBloques = conHora.map((b) => parseInt(b.hora!.slice(0, 2), 10));
  const inicio = Math.min(8, ...(horasBloques.length ? horasBloques : [8]));
  const fin = Math.max(19, ...(horasBloques.length ? horasBloques : [19]));
  const horas: number[] = [];
  for (let h = inicio; h <= fin; h++) horas.push(h);

  const esHoy = dia === hoyIso();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold capitalize">
          {fechaLarga(dia)}
          {esHoy ? <span className="ml-2 rounded bg-[var(--brand-teal,#17A2B8)] px-1.5 py-0.5 text-[10px] font-semibold text-white">hoy</span> : null}
        </h3>
        <Button variant="outline" size="sm" onClick={() => setDia((d) => addDias(d, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDia(hoyIso())} disabled={esHoy}>
          Hoy
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDia((d) => addDias(d, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {bloques.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-muted-foreground">
          Sin bloques para este día. 🎉
        </div>
      ) : (
        <>
          {sinHora.length > 0 ? (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sin hora / todo el día
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {sinHora.map((b) => (
                  <Chip key={b.key} b={b} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border bg-white">
            {horas.map((h) => {
              const enHora = conHora.filter((b) => parseInt(b.hora!.slice(0, 2), 10) === h);
              return (
                <div key={h} className="flex gap-3 border-b px-3 py-2 last:border-b-0">
                  <span className="w-12 shrink-0 pt-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {pad(h)}:00
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {enHora.length === 0 ? (
                      <div className="h-6" />
                    ) : (
                      enHora.map((b) => <Chip key={b.key} b={b} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Agenda del día con audiencias, gestiones, pendientes y prospección que tienen fecha hoy.
        Las horas se editan en cada pestaña; lo sin hora aparece arriba.
      </p>
    </div>
  );
}
