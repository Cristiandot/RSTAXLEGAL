/**
 * Migración inicial del archivo de Facturación 2026 al panel.
 *
 * Recorre la carpeta de OneDrive (Administración/Facturación/2026/NN. Mes/),
 * parsea "(folio) RAZÓN SOCIAL.pdf" (acepta la variante "(folio) - RAZÓN"),
 * sube cada PDF al bucket 'facturas' (path 2026/<folio>.pdf) y deja un
 * manifiesto JSON para insertar las filas en la tabla `facturas`.
 *
 * Requiere la política temporal "TEMP migracion anon sube facturas" en
 * storage.objects (se elimina al terminar la migración).
 *
 * Uso: node scripts/migrar-facturas.js "<carpeta 2026>" [salida.json]
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("../app/node_modules/@supabase/supabase-js");

const SUPABASE_URL = "https://nnwoknmbbxbjzswrkzmw.supabase.co";
const KEY = "sb_publishable_QCWRO4MqJqIzYPNQx7q6HQ_DE9g9zH6";

const base = process.argv[2];
const salida = process.argv[3] || "facturas-manifiesto.json";
if (!base) {
  console.error('Uso: node scripts/migrar-facturas.js "<carpeta 2026>"');
  process.exit(1);
}

const MES = /^(\d{2})\./; // "01. Enero" → 01
const ARCHIVO = /^\((\d+)\)\s*-?\s*(.+?)\.pdf$/i;

async function main() {
  const sb = createClient(SUPABASE_URL, KEY);
  const filas = [];
  const errores = [];
  const foliosVistos = new Map();

  // 1) Recolectar
  for (const carpeta of fs.readdirSync(base).sort()) {
    const m = carpeta.match(MES);
    if (!m) continue;
    const periodo = `2026-${m[1]}`;
    const dir = path.join(base, carpeta);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".pdf")) {
        errores.push(`no-PDF ignorado: ${carpeta}/${f}`);
        continue;
      }
      const a = f.match(ARCHIVO);
      if (!a) {
        errores.push(`nombre no parseable: ${carpeta}/${f}`);
        continue;
      }
      const folio = parseInt(a[1], 10);
      const razon = a[2].trim();
      if (foliosVistos.has(folio)) {
        errores.push(`folio DUPLICADO ${folio}: ${carpeta}/${f} (ya visto en ${foliosVistos.get(folio)}) — omitido`);
        continue;
      }
      foliosVistos.set(folio, `${carpeta}/${f}`);
      filas.push({ folio, razon, periodo, local: path.join(dir, f), archivo_path: `2026/${folio}.pdf` });
    }
  }
  console.log(`Detectadas ${filas.length} facturas. Errores de parseo: ${errores.length}`);
  errores.forEach((e) => console.log("  ⚠ " + e));

  // 2) Subir (concurrencia 5)
  let subidas = 0;
  const fallidas = [];
  const cola = [...filas];
  async function worker() {
    for (;;) {
      const item = cola.shift();
      if (!item) return;
      try {
        const buf = fs.readFileSync(item.local);
        const { error } = await sb.storage
          .from("facturas")
          .upload(item.archivo_path, buf, { contentType: "application/pdf", upsert: false });
        if (error && !/already exists|Duplicate/i.test(error.message)) throw new Error(error.message);
        subidas++;
        if (subidas % 50 === 0) console.log(`  …${subidas}/${filas.length} subidas`);
      } catch (e) {
        fallidas.push(`${item.archivo_path}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));
  console.log(`Subidas OK: ${subidas}/${filas.length}. Fallidas: ${fallidas.length}`);
  fallidas.forEach((e) => console.log("  ✗ " + e));

  // 3) Manifiesto para los INSERT
  fs.writeFileSync(
    salida,
    JSON.stringify(filas.map(({ local: _l, ...r }) => r), null, 1),
  );
  console.log(`Manifiesto: ${salida}`);
  if (fallidas.length > 0) process.exit(1);
}

main();
