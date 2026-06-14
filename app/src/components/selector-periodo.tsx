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
 * Selector de período en dos combos: Mes + Año. Reemplaza al combo único de
 * ventana móvil (`opcionesPeriodo`) para poder elegir cualquier mes de
 * cualquier año. Emite el período compuesto "YYYY-MM" por `onCambio`.
 */
export function SelectorPeriodo({
  periodo,
  onCambio,
  className,
}: {
  periodo: string;
  onCambio: (periodo: string) => void;
  className?: string;
}) {
  const { anio, mes } = partesPeriodo(periodo);
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <select
        aria-label="Mes"
        className={selectCls}
        value={mes}
        onChange={(e) => onCambio(componerPeriodo(anio, e.target.value))}
      >
        {opcionesMes().map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Año"
        className={selectCls}
        value={anio}
        onChange={(e) => onCambio(componerPeriodo(e.target.value, mes))}
      >
        {opcionesAnio(anio).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
