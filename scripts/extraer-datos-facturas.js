/**
 * Extrae de cada PDF de facturación el MONTO TOTAL y el RUT del receptor
 * (texto de la factura electrónica SII). Sirve para el backfill de montos y
 * la vinculación por RUT de los documentos ya migrados.
 *
 * Uso: node scripts/extraer-datos-facturas.js "<carpeta 2026>" [salida.json]
 */
const fs = require("fs");
const path = require("path");
const { extractText, getDocumentProxy } = require("../app/node_modules/unpdf");

const base = process.argv[2];
const salida = process.argv[3] || "facturas-datos.json";

const MES = /^(\d{2})\./;
const FACTURA = /^\((\d+)\)\s*-?\s*(.+?)\.pdf$/i;
const NC = [/^NC \((\d+)\)/i, /^\(NC (\d+)\)/i];

/** RUT receptor: el primero después de "SEÑOR(ES)" (tolera espacios). */
function parsearRut(texto) {
  const desde = texto.search(/SE[ÑN]OR\(ES\)/i);
  const zona = desde >= 0 ? texto.slice(desde) : texto;
  const m = zona.match(/R\.?U\.?T\.?\s*:?\s*([\d.]{7,12})\s*-\s*([\dkK])/);
  if (!m) return null;
  return m[1].replace(/\./g, "") + "-" + m[2].toUpperCase();
}

/** Monto: el último "TOTAL $ X" del documento. */
function parsearTotal(texto) {
  const ms = [...texto.matchAll(/TOTAL\s*\$\s*([\d.]+)/gi)];
  if (ms.length === 0) return null;
  return parseInt(ms[ms.length - 1][1].replace(/\./g, ""), 10);
}

async function main() {
  const items = [];
  for (const carpeta of fs.readdirSync(base).sort()) {
    if (!MES.test(carpeta)) continue;
    const dir = path.join(base, carpeta);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      let tipo = "factura";
      let folio = null;
      let m;
      if ((m = f.match(NC[0])) || (m = f.match(NC[1]))) {
        tipo = "nota_credito";
        folio = +m[1];
      } else if ((m = f.match(FACTURA))) {
        folio = +m[1];
      } else continue;
      items.push({ tipo, folio, archivoLocal: path.join(dir, f), nombre: `${carpeta}/${f}` });
    }
  }
  // NC sin extensión (caso Ojo de Pescado)
  console.log(`${items.length} archivos a procesar…`);

  const out = [];
  let hechos = 0;
  const cola = [...items];
  async function worker() {
    for (;;) {
      const it = cola.shift();
      if (!it) return;
      try {
        const buf = new Uint8Array(fs.readFileSync(it.archivoLocal));
        const pdf = await getDocumentProxy(buf);
        const { text } = await extractText(pdf, { mergePages: true });
        out.push({
          tipo: it.tipo,
          folio: it.folio,
          monto: parsearTotal(text),
          rut: parsearRut(text),
        });
      } catch (e) {
        out.push({ tipo: it.tipo, folio: it.folio, monto: null, rut: null, error: e.message });
      }
      hechos++;
      if (hechos % 100 === 0) console.log(`  …${hechos}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  const sinMonto = out.filter((o) => o.monto === null);
  const sinRut = out.filter((o) => !o.rut);
  console.log(`Listo: ${out.length} · sin monto: ${sinMonto.length} · sin RUT: ${sinRut.length}`);
  sinMonto.slice(0, 10).forEach((o) => console.log(`  ⚠ sin monto: ${o.tipo} ${o.folio} ${o.error ?? ""}`));
  fs.writeFileSync(salida, JSON.stringify(out));
  console.log(`Manifiesto: ${salida}`);
}

main();
