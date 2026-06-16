#!/usr/bin/env node
/**
 * Cargador generalizado de RCV (compras/ventas) al panel, desde la carpeta
 * 02-Contab de CUALQUIER empresa. Auto-detecta el RUT desde los nombres de
 * archivo del SII y resuelve el cliente en la BD; no hay nada hardcodeado.
 *
 *   node scripts/cargar-rcv.cjs "<ruta a 02-Contab>" [--insert]
 *
 * Sin --insert: dry-run (parsea y muestra totales por período, no escribe).
 * Con  --insert: hace upsert a rcv_compras / rcv_ventas (no pisa % pagado ni
 * cuenta de gasto ya asignados — usa la misma llave única del panel).
 *
 * Requiere en app/.env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 * Mismo parser que src/lib/contabilidad/rcv.ts (incluida la regla de signo NC).
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const INSERT = args.includes("--insert");
const BASE = args.find((a) => !a.startsWith("--"));
if (!BASE) {
  console.error('Uso: node scripts/cargar-rcv.cjs "<ruta a 02-Contab>" [--insert]');
  process.exit(1);
}

const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const getEnv = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
const URL = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!URL || !KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en app/.env.local");
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ---- parser (port de src/lib/contabilidad/rcv.ts) ----
const TIPOS_NC = new Set([60, 61, 112]);
const decodif = (b) => { let t = b.toString("utf8"); if (t.includes("�")) t = b.toString("latin1"); return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t; };
const norm = (h) => Array.from(h.normalize("NFD")).filter((c) => { const x = c.codePointAt(0) || 0; return x < 0x300 || x > 0x36f; }).join("").toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
function split(l) { if (!l.includes('"')) return l.split(";"); const r = []; let a = "", q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') { if (q && l[i + 1] === '"') { a += '"'; i++; } else q = !q; } else if (c === ";" && !q) { r.push(a); a = ""; } else a += c; } r.push(a); return r; }
const pEnt = (v) => { if (!v) return 0; const s = v.replace(/\./g, "").replace(/\s/g, "").replace(",", ".").trim(); if (!s || s === "-") return 0; const n = Number(s); return Number.isFinite(n) ? Math.round(n) : 0; };
const pDec = (v) => { if (!v) return null; const s = v.replace(",", ".").trim(); if (!s || s === "-") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const pTxt = (v) => { const t = (v || "").trim(); return t && t !== "-" ? t : null; };
const pFec = (v) => { const t = (v || "").trim(); if (!t) return null; const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/); if (!m) return null; const f = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; return m[4] ? `${f} ${m[4]}` : f; };
function ncSign(row, td) { if (!TIPOS_NC.has(td)) return row; for (const k of Object.keys(row)) { const v = row[k]; if (typeof v === "number" && k !== "tipo_doc" && k !== "otro_imp_tasa") row[k] = -Math.abs(v); } return row; }

function parse(texto, cid, periodo, archivo) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length < 2) return { esCompra: false, filas: [] };
  const enc = split(lineas[0]).map(norm);
  const I = new Map(); enc.forEach((h, i) => { if (!I.has(h)) I.set(h, i); });
  const idx = (...al) => { for (const a of al) { const i = I.get(a); if (i !== undefined) return i; } return -1; };
  const c = (cells, i) => (i >= 0 ? cells[i] : undefined);
  const esCompra = idx("rut proveedor") >= 0;
  const iTD = idx("tipo doc", "tipo docto"), iF = idx("folio");
  const filas = [];
  for (let n = 1; n < lineas.length; n++) {
    const x = split(lineas[n]);
    const td = pEnt(c(x, iTD)); const folio = pTxt(c(x, iF));
    if (esCompra) {
      const rut = pTxt(c(x, idx("rut proveedor")));
      if (!td || !folio || !rut) continue;
      filas.push(ncSign({ cliente_id: cid, periodo, archivo_origen: archivo, tipo_doc: td, tipo_compra: pTxt(c(x, idx("tipo compra"))), rut_proveedor: rut, razon_social: pTxt(c(x, idx("razon social"))), folio, fecha_docto: pFec(c(x, idx("fecha docto"))), fecha_recepcion: pFec(c(x, idx("fecha recepcion"))), fecha_acuse: pFec(c(x, idx("fecha acuse", "fecha acuse recibo"))), monto_exento: pEnt(c(x, idx("monto exento"))), monto_neto: pEnt(c(x, idx("monto neto"))), iva_recuperable: pEnt(c(x, idx("monto iva recuperable", "iva recuperable"))), iva_no_recuperable: pEnt(c(x, idx("monto iva no recuperable", "iva no recuperable"))), codigo_iva_no_rec: pTxt(c(x, idx("codigo iva no rec", "cod iva no rec"))), monto_total: pEnt(c(x, idx("monto total"))), neto_activo_fijo: pEnt(c(x, idx("monto neto activo fijo", "neto activo fijo"))), iva_activo_fijo: pEnt(c(x, idx("iva activo fijo"))), iva_uso_comun: pEnt(c(x, idx("iva uso comun"))), impto_sin_credito: pEnt(c(x, idx("impto sin derecho a credito", "impto sin credito"))), iva_no_retenido: pEnt(c(x, idx("iva no retenido"))), otro_imp_codigo: pTxt(c(x, idx("codigo otro impuesto", "codigo otro imp"))), otro_imp_valor: pEnt(c(x, idx("valor otro impuesto", "valor otro imp"))), otro_imp_tasa: pDec(c(x, idx("tasa otro impuesto", "tasa otro imp"))) }, td));
    } else {
      if (!td || !folio) continue;
      filas.push(ncSign({ cliente_id: cid, periodo, archivo_origen: archivo, tipo_doc: td, tipo_venta: pTxt(c(x, idx("tipo venta"))), rut_cliente: pTxt(c(x, idx("rut cliente", "rut receptor"))), razon_social: pTxt(c(x, idx("razon social"))), folio, fecha_docto: pFec(c(x, idx("fecha docto"))), fecha_recepcion: pFec(c(x, idx("fecha recepcion"))), fecha_acuse: pFec(c(x, idx("fecha acuse recibo", "fecha acuse"))), fecha_reclamo: pFec(c(x, idx("fecha reclamo"))), monto_exento: pEnt(c(x, idx("monto exento"))), monto_neto: pEnt(c(x, idx("monto neto"))), monto_iva: pEnt(c(x, idx("monto iva"))), monto_total: pEnt(c(x, idx("monto total"))), iva_retenido_total: pEnt(c(x, idx("iva retenido total"))), iva_retenido_parcial: pEnt(c(x, idx("iva retenido parcial"))), iva_no_retenido: pEnt(c(x, idx("iva no retenido"))), iva_propio: pEnt(c(x, idx("iva propio"))), iva_terceros: pEnt(c(x, idx("iva terceros"))), iva_fuera_plazo: pEnt(c(x, idx("iva fuera de plazo", "iva fuera plazo"))), credito_constructoras: pEnt(c(x, idx("credito empresa constructora", "credito constr"))), otro_imp_codigo: pTxt(c(x, idx("codigo otro imp", "codigo otro impuesto"))), otro_imp_valor: pEnt(c(x, idx("valor otro imp", "valor otro impuesto"))), otro_imp_tasa: pDec(c(x, idx("tasa otro imp", "tasa otro impuesto"))) }, td));
    }
  }
  return { esCompra, filas };
}

function csvsDe(sub) {
  const dir = path.join(BASE, sub);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".csv")).map((f) => path.join(dir, f));
}
function metaArchivo(file) {
  // ..._<rut>[-dv]_<yyyymm>.csv
  const m = path.basename(file).match(/_(\d{7,8})(?:-([\dkK]))?_(\d{4})(0[1-9]|1[0-2])\.csv$/i);
  if (!m) return null;
  return { rutDigits: m[1], periodo: `${m[3]}-${m[4]}` };
}
const fmt = (n) => n.toLocaleString("es-CL");

async function chunkUpsert(tabla, filas, conflict) {
  for (let i = 0; i < filas.length; i += 400) {
    const { error } = await sb.from(tabla).upsert(filas.slice(i, i + 400), { onConflict: conflict, ignoreDuplicates: true });
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

(async () => {
  const compraFiles = csvsDe("Compras");
  const ventaFiles = csvsDe("Ventas");
  const todos = [...compraFiles, ...ventaFiles];
  if (todos.length === 0) { console.error(`No hay CSV en ${BASE}\\Compras ni \\Ventas`); process.exit(1); }

  // RUT de la empresa: el más frecuente entre los nombres de archivo
  const cuenta = {};
  todos.forEach((f) => { const m = metaArchivo(f); if (m) cuenta[m.rutDigits] = (cuenta[m.rutDigits] || 0) + 1; });
  const rutDigits = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!rutDigits) { console.error("No pude detectar el RUT desde los nombres de archivo."); process.exit(1); }

  // Resolver cliente por RUT (dígitos sin DV)
  const { data: clientes, error: errCli } = await sb
    .from("clientes")
    .select("id, razon_social, rut_empresa, hace_contabilidad_completa");
  if (errCli) { console.error("Conexión BD falló:", errCli.message); process.exit(1); }
  const match = (clientes || []).filter((c) => (c.rut_empresa || "").replace(/[.\-\s]/g, "").replace(/[kK]$/, "").startsWith(rutDigits));
  if (match.length === 0) { console.error(`No hay cliente con RUT ${rutDigits} en la BD.`); process.exit(1); }
  if (match.length > 1) { console.error(`RUT ${rutDigits} ambiguo:`, match.map((c) => c.razon_social)); process.exit(1); }
  const cli = match[0];
  console.log(`Empresa: ${cli.razon_social} (${cli.rut_empresa}) · cliente_id ${cli.id}`);
  if (!cli.hace_contabilidad_completa) console.log("⚠ La empresa NO tiene hace_contabilidad_completa=true (igual se puede cargar el RCV).");
  console.log(`Modo: ${INSERT ? "INSERT" : "DRY-RUN (no escribe)"}\n`);

  for (const [libro, files, tabla, conflict, keyCols, ivaField] of [
    ["COMPRAS", compraFiles, "rcv_compras", "cliente_id,periodo,tipo_doc,rut_proveedor,folio", ["periodo", "tipo_doc", "rut_proveedor", "folio"], "iva_recuperable"],
    ["VENTAS", ventaFiles, "rcv_ventas", "cliente_id,periodo,tipo_doc,folio", ["periodo", "tipo_doc", "folio"], "monto_iva"],
  ]) {
    if (files.length === 0) continue;
    console.log(`===== ${libro} =====`);
    // juntar filas de todos los archivos del libro y dedup global por llave
    const seen = new Set(); const porPeriodo = {};
    for (const f of files) {
      const meta = metaArchivo(f);
      if (!meta) { console.log(`  (omito ${path.basename(f)}: nombre no reconocido)`); continue; }
      const { filas } = parse(decodif(fs.readFileSync(f)), cli.id, meta.periodo, path.basename(f));
      for (const fila of filas) {
        const k = keyCols.map((x) => fila[x]).join("|");
        if (seen.has(k)) continue;
        seen.add(k);
        (porPeriodo[meta.periodo] = porPeriodo[meta.periodo] || []).push(fila);
      }
    }
    let totDocs = 0;
    for (const periodo of Object.keys(porPeriodo).sort()) {
      const filas = porPeriodo[periodo];
      const iva = filas.reduce((a, x) => a + x[ivaField], 0);
      const neto = filas.reduce((a, x) => a + x.monto_neto, 0);
      const nc = filas.filter((x) => TIPOS_NC.has(x.tipo_doc)).length;
      console.log(`  ${periodo}: ${filas.length} docs (${nc} NC) | neto ${fmt(neto)} | IVA ${fmt(iva)}`);
      totDocs += filas.length;
      if (INSERT) { await chunkUpsert(tabla, filas, conflict); console.log(`     -> upsert OK`); }
    }
    console.log(`  TOTAL ${libro}: ${totDocs} docs\n`);
  }
  console.log(INSERT ? "Listo. Verifica en el panel → Contabilidad → Libros RCV." : "Dry-run terminado. Repite con --insert para escribir.");
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
