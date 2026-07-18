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

/**
 * Orden por defecto de la cartera: prioridad del código de grupo (A.1 → D.45,
 * natural gracias a la collation numérica: C.2 antes que C.10), con la razón
 * social como desempate. Los clientes sin grupo quedan al final. Devuelve una
 * copia; no muta el arreglo original.
 */
export function ordenarPorGrupo<T>(
  filas: readonly T[],
  grupoDe: (f: T) => unknown,
  nombreDe?: (f: T) => unknown,
): T[] {
  return [...filas].sort(
    (a, b) =>
      comparar(grupoDe(a), grupoDe(b), "asc") ||
      (nombreDe ? comparar(nombreDe(a), nombreDe(b), "asc") : 0),
  );
}

/** Siguiente estado al hacer clic: asc → desc → sin orden. */
export function siguienteOrden(actual: Orden, col: string): Orden {
  if (actual?.col !== col) return { col, dir: "asc" };
  if (actual.dir === "asc") return { col, dir: "desc" };
  return null;
}
