/** ISO `YYYY-MM-DD` → `DD-MM-AAAA`. Vacío → "—". */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}-${m}-${y}`;
}

/** Monto → CLP con separador de miles ($1.234.567). Vacío → "—". */
export function formatMonto(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return "$" + n.toLocaleString("es-CL");
}
