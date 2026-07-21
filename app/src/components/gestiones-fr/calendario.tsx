"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type EventoCalendario = {
  /** ISO YYYY-MM-DD */
  fecha: string;
  clase: "causa" | "fatal" | "prosp" | "cotiz" | "agenda";
  texto: string;
  /** Id de la entidad de origen (causa, cotización…) para navegar al detalle. */
  id?: string;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const CLASE_CHIP: Record<EventoCalendario["clase"], string> = {
  causa: "border-l-red-500 bg-red-50 text-red-800",
  fatal: "border-l-red-900 bg-red-600 font-semibold text-white",
  prosp: "border-l-violet-500 bg-violet-50 text-violet-800",
  cotiz: "border-l-sky-600 bg-sky-50 text-sky-800",
  agenda: "border-l-indigo-500 bg-indigo-50 text-indigo-800",
};

/** Feriados legales NACIONALES de Chile (no incluye regionales). Viernes/Sábado
 *  Santo, San Pedro y Encuentro de Dos Mundos ya vienen con su fecha trasladada. */
const FERIADOS: Record<string, string> = {
  "2026-01-01": "Año Nuevo",
  "2026-04-03": "Viernes Santo",
  "2026-04-04": "Sábado Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-21": "Glorias Navales",
  "2026-06-21": "Pueblos Indígenas",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-16": "Virgen del Carmen",
  "2026-08-15": "Asunción de la Virgen",
  "2026-09-18": "Independencia",
  "2026-09-19": "Glorias del Ejército",
  "2026-10-12": "Encuentro de Dos Mundos",
  "2026-10-31": "Iglesias Evangélicas",
  "2026-11-01": "Todos los Santos",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
  "2027-01-01": "Año Nuevo",
  "2027-03-26": "Viernes Santo",
  "2027-03-27": "Sábado Santo",
  "2027-05-01": "Día del Trabajo",
  "2027-05-21": "Glorias Navales",
  "2027-06-21": "Pueblos Indígenas",
  "2027-06-28": "San Pedro y San Pablo",
  "2027-07-16": "Virgen del Carmen",
  "2027-08-15": "Asunción de la Virgen",
  "2027-09-18": "Independencia",
  "2027-09-19": "Glorias del Ejército",
  "2027-10-11": "Encuentro de Dos Mundos",
  "2027-10-31": "Iglesias Evangélicas",
  "2027-11-01": "Todos los Santos",
  "2027-12-08": "Inmaculada Concepción",
  "2027-12-25": "Navidad",
};

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function CalendarioFR({
  eventos,
  onEventoClick,
}: {
  eventos: EventoCalendario[];
  onEventoClick?: (ev: EventoCalendario) => void;
}) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth());

  const porDia = new Map<string, EventoCalendario[]>();
  for (const ev of eventos) {
    if (!ev.fecha) continue;
    const lista = porDia.get(ev.fecha) ?? [];
    lista.push(ev);
    porDia.set(ev.fecha, lista);
  }

  function mover(dir: number) {
    const d = new Date(anio, mes + dir, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
  }

  const offset = (new Date(anio, mes, 1).getDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const diasPrev = new Date(anio, mes, 0).getDate();
  const celdas = Math.ceil((offset + diasMes) / 7) * 7;
  const isoHoy = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between bg-[var(--brand-navy,#0B2545)] px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => mover(-1)}
          className="flex size-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/30"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <strong className="text-sm font-semibold capitalize tracking-wide">
          {MESES[mes]} {anio}
        </strong>
        <button
          type="button"
          onClick={() => mover(1)}
          className="flex size-7 items-center justify-center rounded-lg bg-white/15 hover:bg-white/30"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/60">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span
            key={d}
            className="px-2 py-1.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
          >
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: celdas }, (_, i) => {
          const d = i - offset + 1;
          const fuera = d < 1 || d > diasMes;
          const dnum = d < 1 ? diasPrev + d : d > diasMes ? d - diasMes : d;
          const key = fuera ? null : iso(anio, mes, d);
          const esHoy = key === isoHoy;
          const feriado = key ? FERIADOS[key] : undefined;
          const delDia = key ? (porDia.get(key) ?? []) : [];
          return (
            <div
              key={i}
              className={`min-h-[84px] border-r border-b p-1.5 text-xs last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                fuera ? "bg-muted/40 text-muted-foreground/50" : feriado ? "bg-rose-50/70" : ""
              } ${esHoy ? "bg-accent" : ""}`}
            >
              <span
                className={`mb-1 inline-block text-[11px] font-bold ${
                  esHoy
                    ? "rounded-md bg-[var(--brand-teal,#17A2B8)] px-1.5 py-0.5 text-white"
                    : feriado
                      ? "text-rose-600"
                      : ""
                }`}
              >
                {dnum}
              </span>
              {feriado ? (
                <span
                  title={feriado}
                  className="mb-0.5 block truncate rounded bg-rose-100 px-1 text-[9.5px] leading-tight text-rose-700"
                >
                  {feriado}
                </span>
              ) : null}
              {delDia.map((ev, j) => {
                const chip = `mb-0.5 block w-full truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[10.5px] leading-tight ${CLASE_CHIP[ev.clase]}`;
                return onEventoClick && ev.id ? (
                  <button
                    key={j}
                    type="button"
                    title={ev.texto}
                    onClick={() => onEventoClick(ev)}
                    className={`${chip} cursor-pointer hover:brightness-95 focus:outline-2 focus:outline-ring/50`}
                  >
                    {ev.texto}
                  </button>
                ) : (
                  <span key={j} title={ev.texto} className={chip}>
                    {ev.texto}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LeyendaCalendario({
  items,
}: {
  items: { color: string; label: string }[];
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <i className={`inline-block size-2.5 rounded-sm ${it.color}`} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
