"use client";

import {
  componerPeriodo,
  opcionesAnio,
  opcionesMes,
  partesPeriodo,
} from "@/lib/periodos";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Selector de RANGO de períodos: [Mes Año] a [Mes Año]. Para ver un solo mes
 * se elige el mismo mes en ambos extremos (ej.: Mayo a Mayo). Si el usuario
 * deja el rango invertido, el otro extremo se ajusta solo para mantener
 * desde ≤ hasta. Emite ambos períodos "YYYY-MM" por `onCambio`.
 */
export function SelectorRangoPeriodo({
  desde,
  hasta,
  onCambio,
  className,
}: {
  desde: string;
  hasta: string;
  onCambio: (desde: string, hasta: string) => void;
  className?: string;
}) {
  const d = partesPeriodo(desde);
  const h = partesPeriodo(hasta);

  const cambiarDesde = (p: string) => onCambio(p, p > hasta ? p : hasta);
  const cambiarHasta = (p: string) => onCambio(p < desde ? p : desde, p);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <select
        aria-label="Mes desde"
        className={selectCls}
        value={d.mes}
        onChange={(e) => cambiarDesde(componerPeriodo(d.anio, e.target.value))}
      >
        {opcionesMes().map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Año desde"
        className={selectCls}
        value={d.anio}
        onChange={(e) => cambiarDesde(componerPeriodo(e.target.value, d.mes))}
      >
        {opcionesAnio(d.anio).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground">a</span>
      <select
        aria-label="Mes hasta"
        className={selectCls}
        value={h.mes}
        onChange={(e) => cambiarHasta(componerPeriodo(h.anio, e.target.value))}
      >
        {opcionesMes().map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Año hasta"
        className={selectCls}
        value={h.anio}
        onChange={(e) => cambiarHasta(componerPeriodo(e.target.value, h.mes))}
      >
        {opcionesAnio(h.anio).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
