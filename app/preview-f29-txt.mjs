// Prueba manual del generador UPLOAD F29 con los datos reales de
// Panaderías Paula Limitada, junio 2026 (v_f29_upload_rcv + ciclo_f29).
// Ejecutar: node --experimental-strip-types preview-f29-txt.mjs
import { generarUploadF29 } from "./src/lib/f29-txt.ts";
import { writeFileSync } from "node:fs";

const rcv = [
  { libro: "compra", tipo_doc: 33, docs: 211, docs_incompletos: false, neto: 42529923, exento: 27822, iva: 8080683, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
  { libro: "compra", tipo_doc: 34, docs: 3, docs_incompletos: false, neto: 0, exento: 82038321, iva: 0, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
  { libro: "compra", tipo_doc: 61, docs: 13, docs_incompletos: false, neto: -1064258, exento: -81225552, iva: -202209, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
  { libro: "venta", tipo_doc: 33, docs: 179, docs_incompletos: false, neto: 28598709, exento: 0, iva: 5433752, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
  { libro: "venta", tipo_doc: 39, docs: 1, docs_incompletos: true, neto: 34266471, exento: 0, iva: 6510600, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
  { libro: "venta", tipo_doc: 61, docs: 29, docs_incompletos: false, neto: -644921, exento: 0, iva: -122535, iva_activo_fijo: 0, docs_activo_fijo: 0, iva_no_recuperable: 0, iva_uso_comun: 0 },
];

const archivo = generarUploadF29({
  rut: "76.020.032-8",
  razonSocial: "Panaderías Paula Limitada",
  periodo: "2026-06",
  rcv,
  impUnico: 27607,
  retenciones: 150518,
  ppm: 77775,
  montoIva: 3943343,
  montoOtros: -307440,
  ivaPostergado: null,
  retencionHonorariosBd: 150518,
});

console.log("ARCHIVO:", archivo.nombreArchivo);
console.log("--- CONTENIDO ---");
for (const linea of archivo.contenido.split("\r\n")) {
  if (linea) console.log(`[${linea.length}] ${linea}`);
}
console.log("--- CODIGOS ---");
for (const c of archivo.codigos) {
  console.log(String(c.codigo).padStart(4), "=", String(c.valor).padStart(12), "·", c.glosa);
}
console.log("--- ADVERTENCIAS ---");
archivo.advertencias.forEach((a) => console.log("⚠", a));

writeFileSync("76020032.txt", archivo.contenido, { encoding: "ascii" });
console.log("Escrito 76020032.txt");
