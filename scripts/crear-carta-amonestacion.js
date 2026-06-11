/**
 * Construye la plantilla genérica "CARTA Amonestacion.docx" (válida para
 * cualquier empresa de la cartera) en app/plantillas/GENERICO/.
 *
 * Placeholders: {CIUDAD_FIRMA} {FECHA_CARTA} {NOMBRE_EMPLEADO} {RUT_EMPLEADO}
 * {RAZON_SOCIAL} {RUT_EMPRESA} {NOMBRE_REP_LEGAL} {FECHA_HECHOS}
 * {MOTIVO_TEXTO} {DESCRIPCION_HECHOS}
 *
 * El texto del motivo ({MOTIVO_TEXTO}) lo redacta el motor según el catálogo
 * de lib/amonestaciones.ts (mismo mecanismo que {GRATIFICACION_TEXTO}).
 *
 * Uso: node scripts/crear-carta-amonestacion.js
 */
const PizZip = require("../app/node_modules/pizzip");
const fs = require("fs");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Párrafo simple. o: bold, center, right, left (default: justificado). */
function p(texto, o = {}) {
  const jc = o.center ? "center" : o.right ? "right" : o.left ? "left" : "both";
  const rPr = o.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  const run = texto
    ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(texto)}</w:t></w:r>`
    : "";
  return `<w:p><w:pPr><w:jc w:val="${jc}"/>${rPr ? `<w:rPr><w:b/></w:rPr>` : ""}</w:pPr>${run}</w:p>`;
}

const cuerpo = [
  p("CARTA DE AMONESTACIÓN", { bold: true, center: true }),
  p(""),
  p("En {CIUDAD_FIRMA}, a {FECHA_CARTA}.", { right: true }),
  p("Señor(a)", { left: true }),
  p("{NOMBRE_EMPLEADO}", { left: true, bold: true }),
  p("RUT: {RUT_EMPLEADO}", { left: true }),
  p("Presente", { left: true }),
  p("REF.: Amonestación escrita por incumplimiento de obligaciones laborales.", { bold: true }),
  p("De nuestra consideración:"),
  p(
    "Por medio de la presente, {RAZON_SOCIAL}, RUT {RUT_EMPRESA}, representada por don(ña) {NOMBRE_REP_LEGAL}, en su calidad de empleador, viene en amonestarlo(a) formalmente por escrito, en virtud de los hechos que a continuación se indican.",
  ),
  p("Con fecha {FECHA_HECHOS}, {MOTIVO_TEXTO}."),
  p("Detalle de los hechos informados: {DESCRIPCION_HECHOS}"),
  p(
    "Los hechos descritos constituyen una infracción a las obligaciones que emanan de su contrato de trabajo y del Reglamento Interno de Orden, Higiene y Seguridad de la empresa. En consecuencia, se le aplica la sanción de AMONESTACIÓN ESCRITA, contemplada en el artículo 154 N°10 del Código del Trabajo y en el referido Reglamento Interno.",
  ),
  p(
    "Le manifestamos que esta conducta no debe repetirse. Su reiteración podrá ser calificada como incumplimiento grave de las obligaciones que impone el contrato de trabajo, facultando al empleador para adoptar las medidas que en derecho correspondan, incluido el término del contrato de trabajo conforme al artículo 160 N°7 del Código del Trabajo.",
  ),
  p(
    "La presente carta se incorporará a su carpeta personal, remitiéndose copia a la Inspección del Trabajo.",
  ),
  p("Sin otro particular, le saluda atentamente,"),
  p(""),
  p(""),
  p("________________________________", { center: true }),
  p("{NOMBRE_REP_LEGAL}", { center: true, bold: true }),
  p("p.p. {RAZON_SOCIAL}", { center: true }),
  p("RUT {RUT_EMPRESA}", { center: true }),
  p(""),
  p("RECEPCIÓN DE LA CARTA POR EL TRABAJADOR", { bold: true }),
  p(
    "Declaro haber recibido en este acto copia de la presente carta de amonestación.",
  ),
  p("Nombre: {NOMBRE_EMPLEADO}          RUT: {RUT_EMPLEADO}", { left: true }),
  p("Firma: ______________________          Fecha: ______________________", { left: true }),
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

const salida = "app/plantillas/GENERICO/CARTA Amonestacion.docx";
fs.writeFileSync(salida, zip.generate({ type: "nodebuffer" }));
console.log("✔ " + salida);
