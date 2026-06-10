export type DirOrden = "asc" | "desc";
export type Orden = { col: string; dir: DirOrden } | null;

const esVacio = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Comparador para ordenar tablas: números como números, textos con collation
 * es-CL (acentos bien), y los vacíos SIEMPRE al final (en asc y desc) — así
 * "ordenar por responsable" agrupa primero a los asignados.
 */
export function comparar(a: unknown, b: unknown, dir: DirOrden): number {
  if (esVacio(a) && esVacio(b)) return 0;
  if (esVacio(a)) return 1;
  if (esVacio(b)) return -1;
  let r: number;
  if (typeof a === "number" && typeof b === "number") {
    r = a - b;
  } else {
    r = String(a).localeCompare(String(b), "es-CL", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return dir === "asc" ? r : -r;
}

/** Siguiente estado al hacer clic: asc → desc → sin orden. */
export function siguienteOrden(actual: Orden, col: string): Orden {
  if (actual?.col !== col) return { col, dir: "asc" };
  if (actual.dir === "asc") return { col, dir: "desc" };
  return null;
}
