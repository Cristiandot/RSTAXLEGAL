/**
 * Convierte datos variables que quedaron ESCRITOS FIJOS en las plantillas
 * SARGO a placeholders del motor de generación:
 *
 *   - Asignación de pérdida de caja "$ 3.000 Tres Mil" / "$XXXXX (en palabras)"
 *     / "$3.000 (tres mil pesos)"  →  {ASIGNACION_CAJA_TEXTO}
 *   - Lugar de firma "En (la ciudad de) Curauma"  →  {CIUDAD_FIRMA}
 *   - "chileno" fijo en la comparecencia del trabajador (incluso en versiones
 *     extranjero; la nacionalidad ya va en {NACIONALIDAD_EMPLEADO})  →  se quita
 *
 * Mismo mecanismo que patch-gratificacion-plantillas.js: el reemplazo opera
 * sobre el texto concatenado de los <w:t> para tolerar texto repartido en runs.
 *
 * Uso: node scripts/patch-placeholders-sargo.js   (desde la raíz del repo)
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");
const path = require("path");

const DIR = "app/plantillas/SARGO 78179175-K";

const REGLAS = [
  {
    nombre: "caja $3.000 Tres Mil",
    re: /Asignaci[oó]n de Perdida de Caja: \$ ?3\.000 ?Tres Mil\./,
    rep: "Asignación de Pérdida de Caja: {ASIGNACION_CAJA_TEXTO}.",
  },
  {
    nombre: "caja $XXXXX (en palabras)",
    re: /Asignaci[oó]n de P[ée]rdida de Caja: \$XXXXX \(en palabras\)/,
    rep: "Asignación de Pérdida de Caja: {ASIGNACION_CAJA_TEXTO}. ",
  },
  {
    nombre: "caja $3.000 (tres mil pesos) numerada",
    re: /Asignaci[oó]n de Perdida de Caja: \$3\.000 \(tres mil pesos\)/,
    rep: "Asignación de Pérdida de Caja: {ASIGNACION_CAJA_TEXTO}. ",
  },
  {
    nombre: "caja $3.000 (tres mil pesos) con tilde (anexos ASTOP)",
    re: /Asignación de Pérdida de Caja: \$3\.000 \(tres mil pesos\)/,
    rep: "Asignación de Pérdida de Caja: {ASIGNACION_CAJA_TEXTO}",
  },
  {
    nombre: "caja $3.000 redacción nueva",
    re: /Asignación de caja: \$3\.000 \(tres mil pesos\)/,
    rep: "Asignación de caja: {ASIGNACION_CAJA_TEXTO}",
  },
  {
    nombre: "lugar de firma (redacción nueva)",
    re: /En la ciudad de Curauma, a \{FECHA_INICIO_CONTRATO\}/,
    rep: "En la ciudad de {CIUDAD_FIRMA}, a {FECHA_INICIO_CONTRATO}",
  },
  {
    nombre: "lugar de firma (redacción vieja)",
    re: /En Curauma, a \{FECHA_INICIO_CONTRATO\}/,
    rep: "En {CIUDAD_FIRMA}, a {FECHA_INICIO_CONTRATO}",
  },
  {
    nombre: "'chileno' fijo en comparecencia",
    re: /\{NOMBRE_EMPLEADO\}, chileno, /,
    rep: "{NOMBRE_EMPLEADO}, ",
  },
];

/** Texto concatenado de los <w:t> + posiciones para edición quirúrgica. */
function nodosTexto(xml) {
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  const nodos = [];
  let m;
  while ((m = re.exec(xml))) {
    nodos.push({ texto: m[2], textoInicio: m.index + m[1].length });
  }
  return nodos;
}

/** Reemplaza UNA ocurrencia exacta de `objetivo` (puede cruzar runs). */
function reemplazarEnXml(xml, objetivo, reemplazo) {
  const nodos = nodosTexto(xml);
  const completo = nodos.map((n) => n.texto).join("");
  const pos = completo.indexOf(objetivo);
  if (pos === -1) return null;
  const finObj = pos + objetivo.length;

  let offset = 0;
  const nuevos = nodos.map((n) => {
    const ini = offset;
    const fin = offset + n.texto.length;
    offset = fin;
    if (fin <= pos || ini >= finObj) return n.texto;
    const antes = n.texto.slice(0, Math.max(0, pos - ini));
    const despues = n.texto.slice(Math.min(n.texto.length, finObj - ini));
    const esPrimero = ini <= pos && pos < fin;
    return antes + (esPrimero ? reemplazo : "") + despues;
  });

  let out = xml;
  for (let i = nodos.length - 1; i >= 0; i--) {
    if (nuevos[i] !== nodos[i].texto) {
      out =
        out.slice(0, nodos[i].textoInicio) +
        nuevos[i] +
        out.slice(nodos[i].textoInicio + nodos[i].texto.length);
    }
  }
  return out;
}

let totalArchivos = 0;
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith(".docx")) continue;
  const ruta = path.join(DIR, f);
  const zip = new PizZip(fs.readFileSync(ruta));
  let xml = zip.file("word/document.xml").asText();
  const aplicadas = [];
  for (const regla of REGLAS) {
    // localizar con regex sobre el texto concatenado; reemplazar la cadena exacta
    let seguir = true;
    while (seguir) {
      const completo = nodosTexto(xml).map((n) => n.texto).join("");
      const m = completo.match(regla.re);
      if (!m) { seguir = false; break; }
      const nuevo = reemplazarEnXml(xml, m[0], regla.rep);
      if (nuevo === null) { seguir = false; break; }
      xml = nuevo;
      aplicadas.push(regla.nombre);
    }
  }
  if (aplicadas.length > 0) {
    zip.file("word/document.xml", xml);
    fs.writeFileSync(ruta, zip.generate({ type: "nodebuffer" }));
    totalArchivos++;
    console.log(`✔ ${f}\n    ${aplicadas.join(" · ")}`);
  } else {
    console.log(`· ${f} — sin cambios`);
  }
}
console.log(`\n${totalArchivos} archivo(s) modificado(s).`);
