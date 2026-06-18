/** ISO `YYYY-MM-DD` → `DD-MM-AAAA`. Vacío → "—". */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "—";
  return `${d}-${m}-${y}`;
}

/**
 * Nombre seguro para archivos descargados/adjuntos: MAYÚSCULAS, sin tildes ni
 * caracteres conflictivos. Los acentos en el header Content-Disposition se
 * percent-encodean y el archivo llega con nombre tipo "Mar%C3%ADa…".
 */
export function nombreArchivo(texto: string): string {
  // NFD separa la letra de su tilde; se filtran los diacríticos combinantes
  // (rango U+0300–U+036F) comparando code points para evitar regex unicode.
  const sinTildes = Array.from(texto.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join("");
  return sinTildes
    .replace(/[^\w\s.\-()]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Monto → CLP con separador de miles ($1.234.567). Vacío → "—". */
export function formatMonto(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return "$" + n.toLocaleString("es-CL");
}

const MESES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

/** ISO `2026-06-10` → "10 de junio de 2026" (formato de cláusulas). */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES_LARGO[m - 1]} de ${y}`;
}

/** Monto numérico → "529.000" (CLP sin símbolo; el $ va en la plantilla). */
export function montoCLP(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("es-CL");
}
