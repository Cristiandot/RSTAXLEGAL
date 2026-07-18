/**
 * Importa liquidaciones históricas al panel desde el LRE (uso interno, local).
 *
 * El LRE trae el cálculo completo por trabajador (días, imponible, líquido, AFP,
 * salud, AFC, impuesto, asig. familiar y costos del empleador). Este script lo
 * mapea a filas de `liquidacion`, matcheando cada RUT del LRE con un trabajador
 * YA existente en el sistema (el LRE no trae nombre). Los trabajadores sin ficha
 * se reportan como "sin ficha" y se omiten (se cargarán al armar fichas de junio).
 *
 * Por decisión (16-07-2026): se importan ene–may 2026; JUNIO se excluye (junio se
 * arma desde las boletas para sacar los datos de las personas vigentes).
 *
 * Uso:
 *   node scripts/importar-liquidaciones-lre.mjs <rutEmpresa> [AAAA-MM,AAAA-MM,...]
 *   (sin períodos = 2026-01..2026-05)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { RSTL_DIR } from "./lre-onedrive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutNorm = (r) => (r || "").toUpperCase().replace(/[^0-9K]/g, "");
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

function cargarEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

/** Parsea un LRE (ANSI, ';') y devuelve un array de {rut, campos por código}. */
function parseLre(buf) {
  const lines = buf.toString("latin1").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !lines[0].includes("(1101)")) throw new Error("no es LRE (falta 1101)");
  const H = lines[0].split(";");
  const codeIdx = {}; // code -> índice de columna
  H.forEach((h, i) => { const m = h.match(/\((\d+)\)/); if (m) codeIdx[m[1]] = i; });
  const filas = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(";");
    const g = (code) => num(c[codeIdx[code]]);
    const gs = (code) => (c[codeIdx[code]] ?? "").trim();
    const rut = gs("1101");
    if (!rut) continue;
    filas.push({ rut, g, gs, raw: c });
  }
  return { filas, codeIdx, H };
}

/** Mapea una fila LRE a los campos de la tabla `liquidacion`. */
function aLiquidacion(f) {
  const imponible = f.g("5210") + f.g("5220");
  const noImponible = f.g("5230") + f.g("5240");
  const liquido = f.g("5501");
  const afp = f.g("3141"), salud = f.g("3143"), afc = f.g("3151"), imp = f.g("3161"), asigFam = f.g("2311");
  return {
    dias_trabajados: f.g("1115"),
    dias_licencia: f.g("1116"),
    dias_vacaciones: f.g("1117"),
    total_imponible: imponible,
    total_no_imponible: noImponible,
    total_haberes: f.g("5201"),
    total_descuentos: f.g("5301"),
    liquido,
    afp_monto: afp,
    salud_monto: salud,
    afc_trabajador: afc,
    impuesto_unico: imp,
    asignacion_familiar: asigFam,
    sis_empleador: f.g("4155"),
    afc_empleador: f.g("4151"),
    mutual_empleador: f.g("4152"),
    // detalle: claves estándar (para anclaje Previred) + LRE crudo (trazabilidad).
    detalle: {
      origen: "lre",
      baseImponible: imponible,
      baseImponibleAfc: imponible,
      totalImponible: imponible,
      totalNoImponible: noImponible,
      totalHaberes: f.g("5201"),
      totalDescuentos: f.g("5301"),
      liquido,
      afpMonto: afp,
      saludLegal: salud,
      saludMonto: salud,
      afcTrabajador: afc,
      impuestoUnico: imp,
      asignacionFamiliar: asigFam,
      sisEmpleador: f.g("4155"),
      afcEmpleador: f.g("4151"),
      mutualEmpleador: f.g("4152"),
    },
    kame_liquido: liquido,
    kame_cuadra: true,
    estado: "confirmada",
  };
}

async function main() {
  const [rutArg, periodosArg] = process.argv.slice(2);
  if (!rutArg) { console.error('Uso: node scripts/importar-liquidaciones-lre.mjs <rutEmpresa> [AAAA-MM,...]'); process.exit(1); }
  const periodos = periodosArg ? periodosArg.split(",").map((s) => s.trim())
    : ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  // Junio solo se importa si se pasa EXPLÍCITAMENTE (ej. para finiquitados/empresas nuevas
  // sin liquidación de junio); nunca entra por el default ene-may.
  if (!periodosArg && periodos.some((p) => p === "2026-06")) { console.error("JUNIO no entra por default."); process.exit(1); }

  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const rn = rutNorm(rutArg);
  const { data: clientes, error: e1 } = await supa.from("clientes").select("id, razon_social, rut_empresa, previred_rut, carpeta_onedrive");
  if (e1) throw e1;
  const cli = clientes.find((c) => rutNorm(c.rut_empresa) === rn || rutNorm(c.previred_rut) === rn);
  if (!cli) throw new Error(`No encontré empresa con RUT ${rutArg}.`);
  if (!cli.carpeta_onedrive) throw new Error(`${cli.razon_social} sin carpeta_onedrive.`);

  const { data: trabs, error: e2 } = await supa.from("trabajadores").select("id, rut, apellidos, nombres").eq("cliente_id", cli.id);
  if (e2) throw e2;
  const porRut = new Map(trabs.map((t) => [rutNorm(t.rut), t]));
  if (porRut.size === 0) { console.log(`${cli.razon_social}: SIN fichas de trabajadores → se omite (crear fichas primero).`); return; }

  const baseDir = path.join(RSTL_DIR, cli.carpeta_onedrive.replace(/\\/g, "/"), "01-RRHH", "LRE 2026");
  let okTot = 0; const sinFicha = new Set(); const faltaArchivo = [];

  for (const periodo of periodos) {
    const yyyymm = periodo.replace("-", "");
    const file = path.join(baseDir, `${rn}_${yyyymm}.csv`);
    if (!fs.existsSync(file)) { faltaArchivo.push(periodo); continue; }
    const { filas } = parseLre(fs.readFileSync(file));
    const upserts = [];
    for (const f of filas) {
      const t = porRut.get(rutNorm(f.rut));
      if (!t) { sinFicha.add(f.rut); continue; }
      upserts.push({ cliente_id: cli.id, trabajador_id: t.id, periodo, ...aLiquidacion(f),
        calculado_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    if (upserts.length) {
      const { error } = await supa.from("liquidacion").upsert(upserts, { onConflict: "cliente_id,trabajador_id,periodo" });
      if (error) { console.error(`  ${periodo}: ERROR ${error.message}`); continue; }
    }
    okTot += upserts.length;
    console.log(`  ${periodo}: ${upserts.length} liquidaciones importadas` + (filas.length - upserts.length ? ` (${filas.length - upserts.length} sin ficha)` : ""));
  }

  console.log(`\n${cli.razon_social}: ${okTot} liquidaciones importadas (ene-may).`);
  if (sinFicha.size) console.log(`  RUT en LRE sin ficha en el sistema (omitidos): ${[...sinFicha].join(", ")}`);
  if (faltaArchivo.length) console.log(`  Sin archivo LRE: ${faltaArchivo.join(", ")}`);
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });
