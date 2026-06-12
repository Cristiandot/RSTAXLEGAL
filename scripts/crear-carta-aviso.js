/**
 * Construye la plantilla genérica "CARTA Aviso Termino.docx" (carta de aviso
 * de término de contrato, Art. 162 CT) en app/plantillas/GENERICO/.
 *
 * Placeholders: {CIUDAD_FIRMA} {FECHA_CARTA} {NOMBRE_EMPLEADO} {RUT_EMPLEADO}
 * {DOMICILIO_EMPLEADO} {RAZON_SOCIAL} {RUT_EMPRESA} {NOMBRE_REP_LEGAL}
 * {CAUSAL_TEXTO} {FECHA_TERMINO} {HECHOS_TEXTO} {AVISO_TEXTO}
 * {INDEM_ANIOS} {INDEM_AVISO} {VACACIONES_TEXTO} {REM_PENDIENTE}
 * {TOTAL_FINIQUITO} {COTIZACIONES_TEXTO} {ENTREGA_TEXTO}
 *
 * Redacción propia estándar — venia de Felipe pendiente (igual que la carta
 * de amonestación). Uso: node scripts/crear-carta-aviso.js
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
  p("CARTA DE AVISO DE TÉRMINO DE CONTRATO DE TRABAJO", { bold: true, center: true }),
  p("(Artículo 162 del Código del Trabajo)", { center: true }),
  p(""),
  p("En {CIUDAD_FIRMA}, a {FECHA_CARTA}.", { right: true }),
  p("Señor(a)", { left: true }),
  p("{NOMBRE_EMPLEADO}", { left: true, bold: true }),
  p("RUT: {RUT_EMPLEADO}", { left: true }),
  p("Domicilio: {DOMICILIO_EMPLEADO}", { left: true }),
  p("Presente", { left: true }),
  p("REF.: Comunica término de contrato de trabajo.", { bold: true }),
  p("De nuestra consideración:"),
  p(
    "Por medio de la presente, {RAZON_SOCIAL}, RUT {RUT_EMPRESA}, representada por don(ña) {NOMBRE_REP_LEGAL}, comunica a usted que se ha resuelto poner término a su contrato de trabajo a contar del día {FECHA_TERMINO}, invocando la causal contemplada en {CAUSAL_TEXTO}.",
  ),
  p("Los hechos en que se funda la causal invocada son los siguientes:"),
  p("{HECHOS_TEXTO}"),
  p("{AVISO_TEXTO}"),
  p(
    "Conforme a lo dispuesto en el artículo 162 del Código del Trabajo, se informa a usted que los montos que se pagarán con ocasión del término de su contrato, sin perjuicio de su liquidación definitiva en el respectivo finiquito, son los siguientes:",
  ),
  p("— Indemnización por años de servicio: {INDEM_ANIOS}", { left: true }),
  p("— Indemnización sustitutiva del aviso previo: {INDEM_AVISO}", { left: true }),
  p("— Feriado legal y proporcional: {VACACIONES_TEXTO}", { left: true }),
  p("— Remuneraciones pendientes (líquido): {REM_PENDIENTE}", { left: true }),
  p("— TOTAL A PAGAR: {TOTAL_FINIQUITO}", { left: true, bold: true }),
  p("{COTIZACIONES_TEXTO}"),
  p(
    "El finiquito correspondiente será puesto a su disposición, para su revisión, firma y pago, dentro del plazo de diez días hábiles contado desde la separación, conforme al artículo 177 del Código del Trabajo, en las oficinas de la empresa o ante el ministro de fe que se le indicará.",
  ),
  p("{ENTREGA_TEXTO} Se remite copia de la presente comunicación a la Inspección del Trabajo respectiva, dentro del plazo legal."),
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
    "Declaro haber recibido en este acto copia de la presente comunicación de término de contrato de trabajo.",
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

const salida = "app/plantillas/GENERICO/CARTA Aviso Termino.docx";
fs.writeFileSync(salida, zip.generate({ type: "nodebuffer" }));
console.log("✔ " + salida);
