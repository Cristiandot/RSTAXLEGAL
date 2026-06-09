const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Período actual en formato YYYY-MM. */
export function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Período por defecto al abrir los módulos = mes ANTERIOR al actual.
 * Razón operativa: lo que se trabaja/paga en un mes (Previred, F29) corresponde
 * al período del mes anterior (ej.: en junio se trabaja el período mayo).
 */
export function periodoPorDefecto(): string {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
}

/** Etiqueta legible "Junio 2026" a partir de "2026-06". */
export function etiquetaPeriodo(periodo: string): string {
  const [y, m] = periodo.split("-");
  const idx = Number(m) - 1;
  return `${MESES[idx] ?? m} ${y}`;
}

/**
 * Opciones de período: mes siguiente + el actual + los 11 anteriores,
 * ordenadas de más reciente a más antigua. Default sugerido = período actual.
 */
export function opcionesPeriodo(): { value: string; label: string }[] {
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const out: { value: string; label: string }[] = [];
  for (let i = 1; i >= -11; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: etiquetaPeriodo(value) });
  }
  return out;
}

/**
 * Valida que `p` tenga formato YYYY-MM; si no (o si no viene), devuelve el
 * período por defecto (mes anterior al actual).
 */
export function normalizarPeriodo(p: string | undefined): string {
  return p && /^\d{4}-\d{2}$/.test(p) ? p : periodoPorDefecto();
}
