/**
 * Variante puntual de scripts/importar-liquidaciones-lre.mjs:
 * baja el LRE desde el bucket `libros` (en vez de OneDrive) e importa
 * las liquidaciones de UN período para UNA empresa. Mismo mapeo que el oficial.
 *
 * Uso: node importar-lre-storage.mjs <rutEmpresa> <AAAA-MM>
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APP_DIR = "C:/Proyectos/RSTAXLEGAL/app";
const rutNorm = (r) => (r || "").toUpperCase().replace(/[^0-9K]/g, "");
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };

function cargarEnv() {
  const txt = fs.readFileSync(path.join(APP_DIR, ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

function parseLre(buf) {
  const lines = buf.toString("latin1").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !lines[0].includes("(1101)")) throw new Error("no es LRE (falta 1101)");
  const H = lines[0].split(";");
  const codeIdx = {};
  H.forEach((h, i) => { const m = h.match(/\((\d+)\)/); if (m) codeIdx[m[1]] = i; });
  const filas = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(";");
    const g = (code) => num(c[codeIdx[code]]);
    const gs = (code) => (c[codeIdx[code]] ?? "").trim();
    const rut = gs("1101");
    if (!rut) continue;
    filas.push({ rut, g, gs });
  }
  return filas;
}

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
  const [rutArg, periodo] = process.argv.slice(2);
  if (!rutArg || !/^\d{4}-\d{2}$/.test(periodo || "")) { console.error("Uso: node importar-lre-storage.mjs <rutEmpresa> <AAAA-MM>"); process.exit(1); }

  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const rn = rutNorm(rutArg);
  const { data: clientes, error: e1 } = await supa.from("clientes").select("id, razon_social, rut_empresa, previred_rut");
  if (e1) throw e1;
  const cli = clientes.find((c) => rutNorm(c.rut_empresa) === rn || rutNorm(c.previred_rut) === rn);
  if (!cli) throw new Error(`No encontré empresa con RUT ${rutArg}.`);

  const { data: lr, error: e2 } = await supa.from("libro_remuneraciones")
    .select("archivo_path, n_trabajadores, total_liquido").eq("cliente_id", cli.id).eq("periodo", periodo).single();
  if (e2) throw e2;
  if (!lr.archivo_path) throw new Error(`${cli.razon_social} ${periodo}: sin archivo_path en libro_remuneraciones.`);

  const { data: blob, error: e3 } = await supa.storage.from("libros").download(lr.archivo_path);
  if (e3) throw e3;
  const filas = parseLre(Buffer.from(await blob.arrayBuffer()));

  const { data: trabs, error: e4 } = await supa.from("trabajadores").select("id, rut").eq("cliente_id", cli.id);
  if (e4) throw e4;
  const porRut = new Map(trabs.map((t) => [rutNorm(t.rut), t]));

  const upserts = []; const sinFicha = [];
  for (const f of filas) {
    const t = porRut.get(rutNorm(f.rut));
    if (!t) { sinFicha.push(f.rut); continue; }
    upserts.push({ cliente_id: cli.id, trabajador_id: t.id, periodo, ...aLiquidacion(f),
      calculado_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  if (upserts.length) {
    const { error } = await supa.from("liquidacion").upsert(upserts, { onConflict: "cliente_id,trabajador_id,periodo" });
    if (error) throw error;
  }
  const totLiq = upserts.reduce((s, u) => s + u.liquido, 0);
  console.log(`${cli.razon_social} ${periodo}: ${upserts.length} liquidaciones importadas (líquido $${totLiq}) — LRE decía ${lr.n_trabajadores} trab / $${lr.total_liquido}.`);
  if (sinFicha.length) console.log(`  Sin ficha (omitidos): ${sinFicha.join(", ")}`);
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });
