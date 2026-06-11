/**
 * Normaliza la negrita de una plantilla .docx que quedó TODA en negrita:
 * deja en negrita solo (a) los títulos del documento (primeros 2 párrafos),
 * (b) los enunciados de cláusula ("PRIMERO:", "QUINTO: REMUNERACIÓN Y
 * ASIGNACIONES.", etc. — el ordinal y la frase EN MAYÚSCULAS que lo sigue,
 * hasta su punto), y (c) el bloque de firmas. Todo lo demás queda regular.
 *
 * La negrita se fija EXPLÍCITA en cada run (<w:b/> o <w:b w:val="0"/>) para
 * ganar a cualquier herencia de estilos. Si el límite del enunciado cae al
 * medio de un run, el run se divide en dos conservando el resto del formato.
 *
 * Uso: node scripts/formato-negrita-enunciados.js "<ruta del .docx>"
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");

const ORD =
  "(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO(?:\\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO))?|UND[ÉE]CIMO|DUOD[ÉE]CIMO|VIG[ÉE]SIMO(?:\\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO))?)";
const RE_CLAUSULA = new RegExp("^\\s*" + ORD + "\\s*:");
// Frase en mayúsculas que sigue al ordinal (el resto del enunciado), ej.
// " REMUNERACIÓN Y ASIGNACIONES." — hasta 90 caracteres terminados en punto.
const RE_FRASE_CAPS = /^\s*[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,;()\/\-]{0,90}?\./;

const RE_FIRMAS =
  /^\s*(\{RAZON_SOCIAL\}|\{NOMBRE_EMPLEADO\}|RUT \{RUT_EMPRESA\}|RUT \{RUT_EMPLEADO\}|EMPLEADOR|TRABAJADOR)\s*$/;

/** Quita marcas de negrita existentes y fija la deseada en un run. */
function fijarNegrita(runXml, negrita) {
  const marca = negrita
    ? '<w:b/><w:bCs/>'
    : '<w:b w:val="0"/><w:bCs w:val="0"/>';
  let out = runXml.replace(/<w:b(?:Cs)?(?:\s[^>]*)?\/>/g, "");
  if (/<w:rPr(?:\s[^>]*)?>/.test(out)) {
    out = out.replace(/(<w:rPr(?:\s[^>]*)?>)/, "$1" + marca);
  } else {
    out = out.replace(/(<w:r(?:\s[^>]*)?>)/, "$1<w:rPr>" + marca + "</w:rPr>");
  }
  return out;
}

/** Divide un run con un solo <w:t> en dos por el índice `corte` de su texto. */
function dividirRun(runXml, corte) {
  const m = runXml.match(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/);
  if (!m) return null;
  const texto = m[2];
  const conPreserve = '<w:t xml:space="preserve">';
  const hacer = (t) =>
    runXml.replace(
      /(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)/,
      () => conPreserve + t + "</w:t>",
    );
  return [hacer(texto.slice(0, corte)), hacer(texto.slice(corte))];
}

function procesarParrafo(pXml, categoria, limite) {
  // categoria: 'bold' (todo negrita), 'normal' (sin negrita), 'clausula'
  // limite: índice en el texto del párrafo hasta donde llega el enunciado
  const runs = [];
  const reRun = /<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g;
  let m;
  while ((m = reRun.exec(pXml))) runs.push({ xml: m[0], inicio: m.index });

  let offset = 0;
  let out = pXml;
  // de atrás hacia adelante para no invalidar índices
  const cambios = [];
  let pos = 0;
  for (const r of runs) {
    const tM = r.xml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
    const len = tM ? tM[1].length : 0;
    const ini = pos;
    const fin = pos + len;
    pos = fin;
    if (!tM) continue;
    let nuevo;
    if (categoria === "bold") nuevo = fijarNegrita(r.xml, true);
    else if (categoria === "normal") nuevo = fijarNegrita(r.xml, false);
    else {
      // cláusula: negrita hasta `limite`
      if (fin <= limite) nuevo = fijarNegrita(r.xml, true);
      else if (ini >= limite) nuevo = fijarNegrita(r.xml, false);
      else {
        const partes = dividirRun(r.xml, limite - ini);
        nuevo = partes
          ? fijarNegrita(partes[0], true) + fijarNegrita(partes[1], false)
          : fijarNegrita(r.xml, true); // sin <w:t> divisible: dejar negrita
      }
    }
    cambios.push({ inicio: r.inicio, largo: r.xml.length, nuevo });
  }
  for (let i = cambios.length - 1; i >= 0; i--) {
    const c = cambios[i];
    out = out.slice(0, c.inicio) + c.nuevo + out.slice(c.inicio + c.largo);
  }
  return out;
}

const ruta = process.argv[2];
if (!ruta) { console.error("Falta la ruta del .docx"); process.exit(1); }

const zip = new PizZip(fs.readFileSync(ruta));
let xml = zip.file("word/document.xml").asText();

const partes = xml.split(/(<w:p\b[\s\S]*?<\/w:p>)/);
let vistosConTexto = 0;
let resumen = { bold: 0, normal: 0, clausula: 0 };
for (let i = 0; i < partes.length; i++) {
  if (!/^<w:p\b/.test(partes[i])) continue;
  const texto = (partes[i].match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map((t) => t.replace(/<[^>]+>/g, ""))
    .join("");
  if (!texto.trim()) continue;
  vistosConTexto++;

  let categoria = "normal";
  let limite = 0;
  if (vistosConTexto <= 2 || RE_FIRMAS.test(texto)) {
    categoria = "bold";
  } else {
    const mC = texto.match(RE_CLAUSULA);
    if (mC) {
      categoria = "clausula";
      limite = mC[0].length;
      const resto = texto.slice(limite);
      const mF = resto.match(RE_FRASE_CAPS);
      if (mF) limite += mF[0].length;
    }
  }
  resumen[categoria]++;
  partes[i] = procesarParrafo(partes[i], categoria, limite);
}

zip.file("word/document.xml", partes.join(""));
fs.writeFileSync(ruta, zip.generate({ type: "nodebuffer" }));
console.log(
  `✔ ${ruta}\n  títulos/firmas en negrita: ${resumen.bold} · cláusulas (enunciado en negrita): ${resumen.clausula} · párrafos regulares: ${resumen.normal}`,
);
