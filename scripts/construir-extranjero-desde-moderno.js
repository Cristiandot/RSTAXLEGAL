/**
 * Construye la versión EXTRANJERO de un contrato moderno: toma la plantilla
 * base (chileno) y le inserta el bloque "CLÁUSULAS ESPECIALES PARA TRABAJADOR
 * EXTRANJERO" copiado tal cual (XML de párrafos, conserva formato) desde una
 * plantilla extranjera moderna existente. El bloque se inserta inmediatamente
 * después de la cláusula ancla (la que contiene "EJEMPLARES").
 *
 * Uso:
 *   node scripts/construir-extranjero-desde-moderno.js "<base chileno.docx>" "<fuente con bloque extranjero.docx>" "<salida.docx>"
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");

const [base, fuente, salida] = process.argv.slice(2);
if (!base || !fuente || !salida) {
  console.error("Uso: node construir-extranjero-desde-moderno.js <base> <fuente> <salida>");
  process.exit(1);
}

function piezas(ruta) {
  const zip = new PizZip(fs.readFileSync(ruta));
  const xml = zip.file("word/document.xml").asText();
  return { zip, xml, partes: xml.split(/(<w:p\b[\s\S]*?<\/w:p>)/) };
}
const textoDe = (p) =>
  (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");

// 1) Extraer de la fuente el bloque extranjero: desde el párrafo cuyo texto
//    contiene "CLÁUSULAS ESPECIALES PARA TRABAJADOR EXTRANJERO" hasta (incl.)
//    el párrafo de "impuesto a la renta".
const f = piezas(fuente);
const bloques = [];
let dentro = false;
for (const p of f.partes) {
  if (!/^<w:p\b/.test(p)) continue;
  const t = textoDe(p);
  if (/CL[ÁA]USULAS ESPECIALES PARA TRABAJADOR EXTRANJERO/i.test(t)) dentro = true;
  if (dentro) {
    bloques.push(p);
    if (/impuesto a la renta/i.test(t)) break;
  }
}
if (bloques.length < 2) {
  console.error("No se encontró el bloque extranjero en la fuente.");
  process.exit(1);
}

// 2) Insertar el bloque en la base, después del ancla "EJEMPLARES".
const b = piezas(base);
let idxAncla = -1;
b.partes.forEach((p, i) => {
  if (/^<w:p\b/.test(p) && /EJEMPLARES/.test(textoDe(p))) idxAncla = i;
});
if (idxAncla === -1) {
  console.error("No se encontró la cláusula ancla (EJEMPLARES) en la base.");
  process.exit(1);
}
b.partes.splice(idxAncla + 1, 0, bloques.join(""));

b.zip.file("word/document.xml", b.partes.join(""));
fs.writeFileSync(salida, b.zip.generate({ type: "nodebuffer" }));
console.log(`✔ ${salida}\n  bloque extranjero insertado (${bloques.length} párrafos) tras la cláusula EJEMPLARES`);
