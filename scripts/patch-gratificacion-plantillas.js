/**
 * Reemplaza la redacción fija de la gratificación en las plantillas .docx por
 * el placeholder {GRATIFICACION_TEXTO}, que el motor (contrato-generacion.ts)
 * rellena según la opción elegida en la solicitud (sin / 25% / tope / manual).
 *
 * El texto en Word puede venir repartido en varios runs (<w:t>), por eso el
 * reemplazo se hace sobre el texto concatenado del document.xml, editando
 * cada nodo afectado sin tocar el formato.
 *
 * Uso: node scripts/patch-gratificacion-plantillas.js   (desde la raíz del repo)
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");
const path = require("path");

const DIRS = ["app/plantillas/GENERICO", "app/plantillas/SARGO 78179175-K"];

// Variante larga primero: contiene a la corta como subcadena NO (son distintas),
// pero por orden de especificidad igual va primero.
const OBJETIVOS = [
  "Adicionalmente, el Empleador pagará la gratificación legal mensual conforme al Artículo 50 del Código del Trabajo, equivalente al 25% de la remuneración mensual con el tope legal de 4,75 Ingresos Mínimos Mensuales (prorrateados)",
  "Artículo 50 del Código del Trabajo (con tope de 4,75 Ingresos Mínimos Remuneracionales)",
];
const REEMPLAZO = "{GRATIFICACION_TEXTO}";

/** Reemplaza UNA ocurrencia de `objetivo` en el texto concatenado de los <w:t>. */
function reemplazarEnXml(xml, objetivo, reemplazo) {
  const re = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
  const nodos = [];
  let m;
  while ((m = re.exec(xml))) {
    nodos.push({ texto: m[2], textoInicio: m.index + m[1].length });
  }
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
for (const dir of DIRS) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".docx")) continue;
    const ruta = path.join(dir, f);
    const zip = new PizZip(fs.readFileSync(ruta));
    let xml = zip.file("word/document.xml").asText();
    let reemplazos = 0;
    for (const objetivo of OBJETIVOS) {
      let r;
      while ((r = reemplazarEnXml(xml, objetivo, REEMPLAZO)) !== null) {
        xml = r;
        reemplazos++;
      }
    }
    if (reemplazos > 0) {
      zip.file("word/document.xml", xml);
      fs.writeFileSync(ruta, zip.generate({ type: "nodebuffer" }));
      totalArchivos++;
      console.log(`✔ ${f} — ${reemplazos} reemplazo(s)`);
    } else {
      console.log(`· ${f} — sin texto de gratificación (sin cambios)`);
    }
  }
}
console.log(`\n${totalArchivos} archivo(s) modificado(s).`);
