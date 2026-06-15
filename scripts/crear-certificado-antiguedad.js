/**
 * Construye la plantilla genérica "CERTIFICADO Antiguedad.docx" en
 * app/plantillas/GENERICO/. Formato único para toda la cartera.
 *
 * Placeholders: {CIUDAD} {FECHA_HOY} {RAZON_SOCIAL} {RUT_EMPRESA}
 * {NOMBRE_REP_LEGAL} {RUT_REP_LEGAL} {NOMBRE_EMPLEADO} {RUT_EMPLEADO}
 * {CARGO} {FECHA_INGRESO}
 *
 * Redacción estándar y factual (sin cláusulas) — venia de Felipe pendiente.
 * Uso: node scripts/crear-certificado-antiguedad.js
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function p(texto, o = {}) {
  const jc = o.center ? "center" : o.right ? "right" : o.left ? "left" : "both";
  const rPr = o.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const run = texto ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>` : "";
  return `<w:p><w:pPr><w:jc w:val="${jc}"/>${rPr ? "<w:rPr><w:b/></w:rPr>" : ""}</w:pPr>${run}</w:p>`;
}

const cuerpo = [
  p("CERTIFICADO DE ANTIGÜEDAD LABORAL", { bold: true, center: true }),
  p(""),
  p("En {CIUDAD}, a {FECHA_HOY}.", { right: true }),
  p(""),
  p(
    "{RAZON_SOCIAL}, RUT {RUT_EMPRESA}, representada legalmente por don(ña) {NOMBRE_REP_LEGAL}, RUT {RUT_REP_LEGAL}, certifica que don(ña) {NOMBRE_EMPLEADO}, cédula nacional de identidad N° {RUT_EMPLEADO}, presta servicios para esta empresa desde el {FECHA_INGRESO}, desempeñándose actualmente en el cargo de {CARGO}.",
  ),
  p(""),
  p(
    "Se extiende el presente certificado a solicitud del interesado, para los fines que estime convenientes.",
  ),
  p(""),
  p(""),
  p("________________________________", { center: true }),
  p("{NOMBRE_REP_LEGAL}", { center: true, bold: true }),
  p("Representante legal", { center: true }),
  p("{RAZON_SOCIAL}", { center: true }),
  p("RUT {RUT_EMPRESA}", { center: true }),
].join("");

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="es-CL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;

const relsRaiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

const relsDoc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const zip = new PizZip();
zip.file("[Content_Types].xml", contentTypes);
zip.file("_rels/.rels", relsRaiz);
zip.file("word/document.xml", documentXml);
zip.file("word/styles.xml", stylesXml);
zip.file("word/_rels/document.xml.rels", relsDoc);

const salida = "app/plantillas/GENERICO/CERTIFICADO Antiguedad.docx";
fs.writeFileSync(salida, zip.generate({ type: "nodebuffer" }));
console.log("✔ " + salida);
