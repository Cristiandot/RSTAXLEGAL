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
 * Opciones de período: los 11 meses anteriores + el actual + el siguiente,
 * en orden cronológico (enero → diciembre dentro de cada año, pedido de
 * Cristian 12-06-2026). Default sugerido = período actual.
 */
export function opcionesPeriodo(): { value: string; label: string }[] {
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const out: { value: string; label: string }[] = [];
  for (let i = -11; i <= 1; i++) {
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

/** Etiqueta de un rango: "Mayo 2026", "Enero a Mayo 2026", "Noviembre 2025 a Febrero 2026". */
export function etiquetaRango(desde: string, hasta: string): string {
  if (desde === hasta) return etiquetaPeriodo(desde);
  const [yd, md] = desde.split("-");
  const [yh, mh] = hasta.split("-");
  const mesD = MESES[Number(md) - 1] ?? md;
  const mesH = MESES[Number(mh) - 1] ?? mh;
  if (yd === yh) return `${mesD} a ${mesH} ${yd}`;
  return `${mesD} ${yd} a ${mesH} ${yh}`;
}

/**
 * Lista de períodos "YYYY-MM" entre `desde` y `hasta` (ambos inclusive), en
 * orden cronológico. Tope de seguridad: 36 meses.
 */
export function expandirRango(desde: string, hasta: string): string[] {
  let [y, m] = desde.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  const out: string[] = [];
  while ((y < yh || (y === yh && m <= mh)) && out.length < 36) {
    out.push(componerPeriodo(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.length > 0 ? out : [desde];
}

/**
 * Normaliza un rango desde los search params. Acepta `desde`/`hasta` (y el
 * `periodo` legado como fallback de ambos). Si falta uno, se copia del otro
 * (rango de un solo mes). Si vienen invertidos, se ordenan.
 */
export function normalizarRango(
  desde: string | undefined,
  hasta: string | undefined,
  legado?: string,
): { desde: string; hasta: string } {
  const ok = (p?: string) => (p && /^\d{4}-\d{2}$/.test(p) ? p : null);
  const base = ok(legado) ?? periodoPorDefecto();
  let d = ok(desde) ?? ok(hasta) ?? base;
  let h = ok(hasta) ?? ok(desde) ?? base;
  if (d > h) [d, h] = [h, d];
  return { desde: d, hasta: h };
}

/** Separa "2026-05" en { anio: "2026", mes: "05" }. */
export function partesPeriodo(periodo: string): { anio: string; mes: string } {
  const [anio = "", mes = ""] = periodo.split("-");
  return { anio, mes };
}

/** Arma "2026-05" desde año y mes (el mes se rellena a 2 dígitos). */
export function componerPeriodo(anio: string | number, mes: string | number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

/** Opciones de mes: value "01".."12", label "Enero".."Diciembre". */
export function opcionesMes(): { value: string; label: string }[] {
  return MESES.map((label, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label,
  }));
}

/**
 * Años seleccionables: desde 2024 hasta el año siguiente al actual. Se incluye
 * siempre `incluir` (el año del período vigente) por si quedara fuera del rango.
 */
export function opcionesAnio(incluir?: string): { value: string; label: string }[] {
  const hasta = new Date().getFullYear() + 1;
  const anios = new Set<number>();
  for (let y = 2024; y <= hasta; y++) anios.add(y);
  if (incluir && /^\d{4}$/.test(incluir)) anios.add(Number(incluir));
  return [...anios]
    .sort((a, b) => a - b)
    .map((y) => ({ value: String(y), label: String(y) }));
}
