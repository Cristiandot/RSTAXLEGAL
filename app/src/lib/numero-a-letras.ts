/**
 * Monto entero en palabras (español de Chile) para documentos legales.
 * Ej.: 43000000 → "cuarenta y tres millones de pesos"; 1500000 → "un millón
 * quinientos mil pesos". Soporta hasta miles de millones.
 */

const UNIDADES = [
  "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho",
  "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis",
  "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
  "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete",
  "veintiocho", "veintinueve",
];
const DECENAS = [
  "", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta",
  "ochenta", "noventa",
];
const CENTENAS = [
  "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
  "seiscientos", "setecientos", "ochocientos", "novecientos",
];

/** 1..999 en palabras. */
function menorMil(n: number): string {
  if (n === 100) return "cien";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centena = c > 0 ? CENTENAS[c] : "";
  let resto = "";
  if (r < 30) {
    resto = r > 0 ? UNIDADES[r] : "";
  } else {
    const d = Math.floor(r / 10);
    const u = r % 10;
    resto = DECENAS[d] + (u > 0 ? ` y ${UNIDADES[u]}` : "");
  }
  return [centena, resto].filter(Boolean).join(" ");
}

/** Apócope de "uno" → "un" / "veintiuno" → "veintiún" (antes de sustantivo). */
function apocope(s: string): string {
  if (s.endsWith("veintiuno")) return s.slice(0, -9) + "veintiún";
  if (s.endsWith("uno")) return s.slice(0, -3) + "un";
  return s;
}

export function enteroEnPalabras(n: number): string {
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const u = n % 1000;
  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? "un millón" : `${apocope(menorMil(millones))} millones`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? "mil" : `${apocope(menorMil(miles))} mil`);
  }
  if (u > 0) partes.push(apocope(menorMil(u)));
  return partes.join(" ");
}

/** Monto en pesos: agrega "de pesos" solo a múltiplos exactos de millón. */
export function montoEnPalabras(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const ent = Math.round(n);
  const exactoMillon = ent >= 1_000_000 && ent % 1_000_000 === 0;
  return enteroEnPalabras(ent) + (exactoMillon ? " de pesos" : " pesos");
}
