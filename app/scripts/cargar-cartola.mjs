/**
 * Carga de CARTOLA BANCARIA al módulo Banco/Conciliación ("Chipax propio").
 *
 * El cliente aporta su cartola (upload manual). Este script parsea el archivo,
 * crea/ubica la cuenta (banco_cuenta) y guarda los movimientos (banco_movimiento)
 * deduplicados. La conciliación contra DTE (rcv_*, honorarios, etc.) se hace en
 * el panel; acá solo entra el "feed" del banco.
 *
 * Fuentes soportadas hoy:
 *   - mercadopago : export de MP (5 cols: Fecha de Pago, Tipo de Operación,
 *                   Número de Movimiento, Operación Relacionada, Importe).
 *   - generico    : xlsx/csv con columnas fecha/glosa/cargo/abono (mapeo por header).
 *
 * Reejecutar NO duplica (dedup por hash: MP usa el Nº de Movimiento).
 *
 * Uso:
 *   node scripts/cargar-cartola.mjs --file "C:/ruta/cartola.xlsx" --rut 78.073.973-8 \
 *        [--fuente mercadopago] [--alias "MercadoPago RS"] [--write]
 *   (sin --write = dry-run: muestra qué se cargaría, sin tocar la base)
 */
import fs from "node:fs";
import PizZip from "pizzip";
import { createClient } from "@supabase/supabase-js";

// ───────── args ─────────
const argv = process.argv.slice(2);
const getArg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const write = argv.includes("--write");
const file = getArg("--file");
const rut = getArg("--rut");
const clienteIdArg = getArg("--cliente-id");
const fuente = (getArg("--fuente") || "mercadopago").toLowerCase();
const alias = getArg("--alias");
if (!file) { console.error("Falta --file <ruta cartola>"); process.exit(1); }
if (!rut && !clienteIdArg) { console.error("Falta --rut <rut empresa> o --cliente-id <uuid>"); process.exit(1); }

// ───────── helpers ─────────
function cargarEnv() {
  const txt = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}
const rutKey = (r) => (r || "").toString().toUpperCase().replace(/[^0-9K]/g, "");
// Número en formato MÁQUINA (punto = decimal): así vienen los importes de Mercado
// Pago (ej. "4477.14"). NO tratar el punto como separador de miles.
const numMaquina = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
// Número en formato CHILENO ("1.234.567,89"): para cartolas de banco genéricas.
// Si hay coma decimal, los puntos son miles; si solo hay puntos, son miles.
const numCL = (v) => {
  let s = String(v ?? "").replace(/[^0-9.,\-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/\./g, "");
  const n = Number(s); return Number.isFinite(n) ? n : 0;
};
const fmt = (n) => Math.round(n).toLocaleString("es-CL");
function decodeEnt(s) {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}
function colIndex(ref) {
  const m = ref.match(/^([A-Z]+)\d+$/); if (!m) return -1;
  let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1;
}
// Fecha local Chile (America/Santiago) a partir de un timestamp ISO UTC.
function fechaChile(iso) {
  const d = new Date(iso);
  if (isNaN(d)) {
    const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/) || String(iso).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[0].includes("/") ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : `${m[1]}-${m[2]}-${m[3]}`;
  }
  return d.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }); // YYYY-MM-DD
}

// Lee un xlsx a matriz de filas. Soporta inlineStr (<is><t>), sharedStrings (t="s") y <v> plano.
function parseXlsx(buf) {
  const zip = new PizZip(buf);
  const ssFile = zip.file("xl/sharedStrings.xml");
  const strs = ssFile
    ? [...ssFile.asText().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        decodeEnt([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const shName = zip.file("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml"
    : Object.keys(zip.files).find((k) => /^xl\/worksheets\/.*\.xml$/.test(k));
  const sh = zip.file(shName).asText();
  return [...sh.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const arr = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(c[1]);
      const tipo = (c[2].match(/t="([^"]+)"/) || [])[1];
      const inner = c[3] || "";
      if (tipo === "inlineStr") {
        const t = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("");
        arr[idx] = decodeEnt(t);
      } else {
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
        if (!vm) { arr[idx] = null; continue; }
        arr[idx] = tipo === "s" ? strs[+vm[1]] : decodeEnt(vm[1]);
      }
    }
    return arr;
  });
}

// ───────── parser Mercado Pago ─────────
function parseMercadoPago(rows) {
  const movs = [];
  for (const r of rows) {
    const a = (r[0] ?? "").toString().trim();
    if (!a || /^fecha de pago$/i.test(a)) continue;          // header / vacías
    const tipo = (r[1] ?? "").toString().trim();
    const nroMov = (r[2] ?? "").toString().trim();
    const opRel = (r[3] ?? "").toString().trim();
    const importe = Math.round(numMaquina(r[4]));
    const fecha = fechaChile(a);
    if (!fecha) continue;
    // categoría automática
    let categoria = null;
    if (/costo de mercado pago|anulaci[oó]n parcial de costo/i.test(tipo)) categoria = "comision";
    else if (/conversi[oó]n por pago en moneda/i.test(tipo)) categoria = "cambio_moneda";
    // ruido: "Movimiento General" en $0 no mueve caja
    const estado = importe === 0 ? "ignorado" : "pendiente";
    movs.push({
      fecha,
      fecha_hora: /\dT\d/.test(a) ? new Date(a).toISOString() : null,
      glosa: tipo || null,
      descripcion: null,
      rut_contraparte: null,          // MP no trae contraparte
      nombre_contraparte: null,
      referencia: nroMov || null,
      referencia_grupo: opRel || null,
      abono: importe > 0 ? importe : 0,
      cargo: importe < 0 ? -importe : 0,
      saldo: null,                     // MP no trae saldo corrido
      categoria,
      estado,
      hash: nroMov ? `mp:${nroMov}` : `mp:${fecha}:${importe}:${opRel}`,
    });
  }
  return movs;
}

async function main() {
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // cliente
  let cliente;
  if (clienteIdArg) {
    const { data } = await supa.from("clientes").select("id, razon_social, rut_empresa").eq("id", clienteIdArg).maybeSingle();
    cliente = data;
  } else {
    const { data } = await supa.from("clientes").select("id, razon_social, rut_empresa");
    cliente = (data || []).find((c) => rutKey(c.rut_empresa) === rutKey(rut));
  }
  if (!cliente) { console.error(`No se encontró la empresa (${rut || clienteIdArg}) en clientes.`); process.exit(1); }

  const buf = fs.readFileSync(file);
  const rows = parseXlsx(buf);
  let movs;
  if (fuente === "mercadopago") movs = parseMercadoPago(rows);
  else { console.error(`Fuente "${fuente}" aún no implementada (hoy: mercadopago).`); process.exit(1); }

  // resumen
  const abonos = movs.filter((m) => m.abono > 0);
  const cargos = movs.filter((m) => m.cargo > 0);
  const sumA = abonos.reduce((s, m) => s + m.abono, 0);
  const sumC = cargos.reduce((s, m) => s + m.cargo, 0);
  const comis = movs.filter((m) => m.categoria === "comision");
  const fechas = movs.map((m) => m.fecha).sort();
  console.log(`\nEmpresa:  ${cliente.razon_social}  (${cliente.rut_empresa})`);
  console.log(`Fuente:   ${fuente}   ·   archivo: ${file.split(/[\\/]/).pop()}`);
  console.log(`Modo:     ${write ? "ESCRITURA" : "DRY-RUN"}\n`);
  console.log(`Movimientos:  ${movs.length}   (${fechas[0]} → ${fechas[fechas.length - 1]})`);
  console.log(`  Abonos:     ${abonos.length}  →  $${fmt(sumA)}`);
  console.log(`  Cargos:     ${cargos.length}  →  -$${fmt(sumC)}`);
  console.log(`  Neto:       $${fmt(sumA - sumC)}`);
  console.log(`  Comisiones (auto-categoría): ${comis.length}  →  -$${fmt(comis.reduce((s, m) => s + m.cargo, 0))}`);
  console.log(`  Ignorados ($0): ${movs.filter((m) => m.estado === "ignorado").length}`);
  console.log(`\n  Muestra (primeros 5):`);
  for (const m of movs.slice(0, 5)) {
    const signo = m.abono > 0 ? `+${fmt(m.abono)}` : `-${fmt(m.cargo)}`;
    console.log(`   ${m.fecha}  ${(m.glosa || "").padEnd(28).slice(0, 28)}  ${signo.padStart(12)}  ${m.categoria || ""}`);
  }

  if (!write) { console.log(`\n(dry-run — agregá --write para crear la cuenta e insertar)\n`); return; }

  // cuenta (upsert lógico por cliente+fuente+alias)
  const q = supa.from("banco_cuenta").select("id").eq("cliente_id", cliente.id).eq("fuente", fuente);
  const { data: existentes } = await (alias ? q.eq("alias", alias) : q);
  let cuentaId = existentes?.[0]?.id;
  if (!cuentaId) {
    const nombreFuente = { mercadopago: "Mercado Pago" }[fuente] || fuente;
    const { data: nueva, error } = await supa.from("banco_cuenta").insert({
      cliente_id: cliente.id, fuente, banco_nombre: nombreFuente,
      alias: alias || nombreFuente, moneda: "CLP", activo: true,
    }).select("id").single();
    if (error) { console.error("Error creando cuenta:", error.message); process.exit(1); }
    cuentaId = nueva.id;
    console.log(`\n  ✓ Cuenta creada: ${cuentaId}`);
  } else {
    console.log(`\n  · Cuenta existente: ${cuentaId}`);
  }

  const filas = movs.map((m) => ({
    cuenta_id: cuentaId, cliente_id: cliente.id, fuente,
    archivo_origen: file.split(/[\\/]/).pop(), ...m,
  }));
  let insertados = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error, count } = await supa.from("banco_movimiento")
      .upsert(lote, { onConflict: "cuenta_id,hash", ignoreDuplicates: true, count: "exact" });
    if (error) { console.error(`Error insertando [${i}]:`, error.message); break; }
    insertados += count ?? 0;
  }
  console.log(`  ✓ Movimientos nuevos insertados: ${insertados} (de ${filas.length}; el resto ya existía)\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
