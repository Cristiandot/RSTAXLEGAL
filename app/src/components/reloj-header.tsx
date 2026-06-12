"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock4 } from "lucide-react";

// Siempre hora de Chile, sin importar dónde corra el servidor o el navegador.
const fmtFecha = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const fmtHora = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Chip del header con fecha y reloj en hora chilena, actualizado al minuto. */
export function RelojHeader() {
  // se monta vacío para no chocar con el HTML del servidor (hidratación)
  const [ahora, setAhora] = useState<Date | null>(null);

  useEffect(() => {
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="ml-auto flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm text-muted-foreground shadow-sm">
      <CalendarDays className="size-4 text-[var(--brand-teal)]" />
      <span className="font-medium text-foreground">
        {ahora ? fmtFecha.format(ahora) : "··-··-····"}
      </span>
      <Clock4 className="size-4 text-[var(--brand-teal)]" />
      <span className="font-medium text-foreground tabular-nums">
        {ahora ? fmtHora.format(ahora) : "··:··"}
      </span>
    </div>
  );
}
