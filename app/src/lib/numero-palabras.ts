/** Montos en palabras (español de Chile), para cláusulas de contratos. */

const UNIDADES = [
  "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve",
];
const DECENAS = [
  "", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta",
  "ochenta", "noventa",
];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

function tresDigitos(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let s = CENTENAS[c];
  if (resto > 0) {
    if (s) s += " ";
    if (resto < 30) {
      s += UNIDADES[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      s += DECENAS[d] + (u > 0 ? " y " + UNIDADES[u] : "");
    }
  }
  return s;
}

/** 529000 → "quinientos veintinueve mil". */
export function numeroEnPalabras(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(
      millones === 1 ? "un millón" : `${tresDigitos(millones)} millones`,
    );
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${tresDigitos(miles)} mil`);
  }
  if (resto > 0) partes.push(tresDigitos(resto));
  return partes.join(" ").replace("uno mil", "un mil");
}

/** 529000 → "Quinientos veintinueve mil pesos". */
export function montoEnPalabras(n: number): string {
  const palabras = numeroEnPalabras(n);
  if (!palabras) return "";
  const conPesos = `${palabras} peso${n === 1 ? "" : "s"}`;
  return conPesos.charAt(0).toUpperCase() + conPesos.slice(1);
}
