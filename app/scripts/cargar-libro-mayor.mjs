/**
 * Carga masiva del LIBRO MAYOR anual exportado desde KAME (XLSX) al panel.
 *
 * Lee todos los .xlsx de una carpeta, detecta la empresa por el RUT que viene
 * DENTRO del archivo (fila "RUT: ..."), y guarda:
 *   - libro_mayor              (cabecera: año, totales, cuadratura, archivo)
 *   - libro_mayor_cuenta       (resumen por cuenta: debe/haber/saldo)
 *   - libro_mayor_movimiento   (detalle completo, línea a línea)
 * Además sube el XLSX original al bucket `contabilidad`.
 *
 * Reejecutar sobre la misma empresa/año REEMPLAZA el contenido (no duplica).
 *
 * Uso:
 *   node scripts/cargar-libro-mayor.mjs --dir "C:/ruta/carpeta" [--anio 2025] [--write]
 *   (sin --write = dry-run; muestra qué se cargaría, empresa por empresa)
 */
import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { createClient } from "@supabase/supabase-js";

// ---------- args ----------
const argv = process.argv.slice(2);
const getArg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const write = argv.includes("--write");
const dir = getArg("--dir");
const anioForzado = getArg("--anio") ? parseInt(getArg("--anio"), 10) : null;
if (!dir) { console.error("Falta --dir <carpeta con los .xlsx>"); process.exit(1); }

// ---------- helpers ----------
function cargarEnv() {
  const txt = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}
// RUT sin puntos ni guión, en mayúscula, para comparar sin ambigüedad de formato
const rutKey = (r) => (r || "").toString().toUpperCase().replace(/[^0-9K]/g, "");
function decodeEnt(s) {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}
const num = (v) => { if (v === null || v === undefined || v === "") return 0; const n = Number(v); return Number.isFinite(n) ? n : 0; };
function fechaISO(d) {
  const m = (d || "").toString().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
function colIndex(ref) {
  const m = ref.match(/^([A-Z]+)\d+$/); if (!m) return -1;
  let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1;
}

// ---------- parse xlsx (KAME: strings inline t="str", puede no traer sharedStrings) ----------
function parseXlsxBuffer(buf) {
  const zip = new PizZip(buf);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const strs = ssFile
    ? [...ssFile.asText().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeEnt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const sh = zip.file("xl/worksheets/sheet1.xml").asText();
  return [...sh.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const arr = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(c[1]);
      const tipo = (c[2].match(/t="([^"]+)"/) || [])[1];
      const vm = (c[3] || "").match(/<v>([\s\S]*?)<\/v>/);
      if (!vm) { arr[idx] = null; continue; }
      arr[idx] = tipo === "s" ? strs[+vm[1]] : decodeEnt(vm[1]);
    }
    return arr;
  });
}

// ---------- estructura del Libro Mayor ----------
function parseLibroMayor(buf) {
  const rows = parseXlsxBuffer(buf);
  const meta = { rut: null, empresa: null, desde: null, hasta: null, anio: null };
  const cuentas = [];        // { codigo, nombre, debe, haber, saldo }
  const movimientos = [];    // { cuenta_codigo, cuenta_nombre, comprobante, tipo, fecha, concepto, debe, haber, saldo, ficha, documento, vencimiento, unidad_negocio }
  const advertencias = [];
  let cuentaActual = null;

  for (const r of rows) {
    const a = (r[0] ?? "").toString().trim();
    const d = (r[3] ?? "").toString().trim();

    if (/^RUT:/i.test(a)) { meta.rut = a.replace(/^RUT:\s*/i, "").trim(); continue; }
    if (/^EMPRESA:/i.test(a)) { meta.empresa = a.replace(/^EMPRESA:\s*/i, "").trim(); continue; }
    if (/^PER[ÍI]ODO/i.test(a)) {
      const f = a.match(/(\d{1,2}\/\d{1,2}\/\d{4})[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (f) { meta.desde = fechaISO(f[1]); meta.hasta = fechaISO(f[2]); }
      continue;
    }
    if (a === "" && d === "") continue;
    if (a === "Comprobante") continue; // fila de encabezados de columna

    // Encabezado de cuenta: "1.01.05.01 Deudores por venta"
    const mc = a.match(/^(\d+(?:\.\d+)+)\s+(.*)$/);
    if (mc) { cuentaActual = { codigo: mc[1], nombre: mc[2].trim(), debe: 0, haber: 0, saldo: 0 }; cuentas.push(cuentaActual); continue; }

    // Cierre de cuenta: "Sumas Totales de la Cuenta"
    if (/Sumas Totales/i.test(d)) {
      if (cuentaActual) { cuentaActual.debe = num(r[4]); cuentaActual.haber = num(r[5]); cuentaActual.saldo = num(r[6]); }
      continue;
    }

    // Movimiento (dentro de una cuenta, con Tipo o Fecha)
    if (cuentaActual && (r[1] || r[2])) {
      movimientos.push({
        cuenta_codigo: cuentaActual.codigo,
        cuenta_nombre: cuentaActual.nombre,
        comprobante: (r[0] ?? "").toString().trim() || null,
        tipo: (r[1] ?? "").toString().trim() || null,
        fecha: fechaISO(r[2]),
        concepto: (r[3] ?? "").toString().trim() || null,
        debe: num(r[4]), haber: num(r[5]), saldo: r[6] == null || r[6] === "" ? null : num(r[6]),
        ficha: (r[7] ?? "").toString().trim() || null,
        documento: (r[8] ?? "").toString().trim() || null,
        vencimiento: fechaISO(r[9]),
        unidad_negocio: (r[10] ?? "").toString().trim() || null,
      });
    }
  }

  meta.anio = anioForzado || (meta.desde ? +meta.desde.slice(0, 4) : (meta.hasta ? +meta.hasta.slice(0, 4) : null));
  const totalDebe = cuentas.reduce((s, c) => s + c.debe, 0);
  const totalHaber = cuentas.reduce((s, c) => s + c.haber, 0);
  const cuadra = Math.abs(totalDebe - totalHaber) < 1;
  if (!cuentas.length) advertencias.push("No se detectaron cuentas");
  if (!cuadra) advertencias.push(`Descuadre: Debe ${totalDebe} ≠ Haber ${totalHaber}`);

  return { meta, cuentas, movimientos, totalDebe, totalHaber, cuadra, advertencias };
}

const fmt = (n) => Math.round(n).toLocaleString("es-CL");

async function main() {
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // índice RUT -> cliente
  const { data: clientes, error: eCli } = await supa.from("clientes").select("id, razon_social, rut_empresa");
  if (eCli) { console.error(eCli); process.exit(1); }
  const porRut = new Map();
  for (const c of clientes) if (c.rut_empresa) porRut.set(rutKey(c.rut_empresa), c);

  const archivos = fs.readdirSync(dir).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"));
  if (!archivos.length) { console.error(`No hay .xlsx en ${dir}`); process.exit(1); }
  console.log(`\n${archivos.length} archivo(s) en ${dir}  ·  modo: ${write ? "ESCRITURA" : "DRY-RUN"}\n`);

  let ok = 0, sinMatch = 0, descuadrados = 0;
  for (const f of archivos) {
    const buf = fs.readFileSync(path.join(dir, f));
    let L;
    try { L = parseLibroMayor(buf); } catch (e) { console.log(`  ✗ ${f}: no se pudo parsear (${e.message})`); continue; }
    const cli = L.meta.rut ? porRut.get(rutKey(L.meta.rut)) : null;
    const etiqueta = `${L.meta.empresa || "?"} · RUT ${L.meta.rut || "?"} · ${L.meta.anio || "?"}`;

    if (!cli) { sinMatch++; console.log(`  ✗ ${f}: ${etiqueta} — RUT no calza con ningún cliente del panel`); continue; }
    if (!L.meta.anio) { console.log(`  ✗ ${f}: ${etiqueta} — sin año detectable`); continue; }

    const cuadraTxt = L.cuadra ? "✓ cuadra" : "≠ DESCUADRE";
    if (!L.cuadra) descuadrados++;
    console.log(`  ${L.cuadra ? "●" : "⚠"} ${cli.razon_social}  [${L.meta.anio}]  ${cuadraTxt}`);
    console.log(`      cuentas=${L.cuentas.length}  movs=${L.movimientos.length}  Debe=${fmt(L.totalDebe)}  Haber=${fmt(L.totalHaber)}`);
    if (L.advertencias.length) console.log(`      ⚠ ${L.advertencias.join(" · ")}`);

    if (!write) { ok++; continue; }

    // cabecera (upsert por cliente+año)
    const { data: cab, error: e1 } = await supa.from("libro_mayor").upsert({
      cliente_id: cli.id, anio: L.meta.anio,
      periodo_desde: L.meta.desde, periodo_hasta: L.meta.hasta,
      rut_archivo: L.meta.rut, empresa_archivo: L.meta.empresa,
      total_debe: L.totalDebe, total_haber: L.totalHaber,
      n_cuentas: L.cuentas.length, n_movimientos: L.movimientos.length,
      cuadra: L.cuadra, nombre_original: f, tamano_bytes: buf.length,
      updated_at: new Date().toISOString(),
    }, { onConflict: "cliente_id,anio" }).select("id").single();
    if (e1) { console.log(`      ⚠ ERROR cabecera: ${e1.message}`); continue; }
    const libroId = cab.id;

    // reemplazo limpio del detalle
    await supa.from("libro_mayor_cuenta").delete().eq("libro_id", libroId);
    await supa.from("libro_mayor_movimiento").delete().eq("libro_id", libroId);

    const cuentasRows = L.cuentas.map((c, i) => ({ libro_id: libroId, codigo: c.codigo, nombre: c.nombre, debe: c.debe, haber: c.haber, saldo: c.saldo, orden: i }));
    const { error: e2 } = await supa.from("libro_mayor_cuenta").insert(cuentasRows);
    if (e2) { console.log(`      ⚠ ERROR cuentas: ${e2.message}`); }

    const movsRows = L.movimientos.map((m, i) => ({ libro_id: libroId, ...m, orden: i }));
    for (let i = 0; i < movsRows.length; i += 500) {
      const { error: e3 } = await supa.from("libro_mayor_movimiento").insert(movsRows.slice(i, i + 500));
      if (e3) { console.log(`      ⚠ ERROR movimientos [${i}]: ${e3.message}`); break; }
    }

    // subir XLSX original (best-effort)
    const sano = f.replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/g, "_");
    const archivoPath = `${cli.id}/libro-mayor/${L.meta.anio}-${sano}`;
    const { error: eUp } = await supa.storage.from("contabilidad").upload(archivoPath, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true,
    });
    if (!eUp) await supa.from("libro_mayor").update({ archivo_path: archivoPath }).eq("id", libroId);
    else console.log(`      ⚠ no se pudo subir el archivo: ${eUp.message}`);

    ok++;
  }

  console.log(`\n──────── ${write ? "ESCRITO" : "DRY-RUN"} ────────`);
  console.log(`Procesados OK: ${ok}  ·  sin match de RUT: ${sinMatch}  ·  con descuadre: ${descuadrados}`);
  if (!write) console.log(`(dry-run — agregá --write para aplicar)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
