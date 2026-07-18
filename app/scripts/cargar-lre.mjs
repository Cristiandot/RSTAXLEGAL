/**
 * Cargador del Libro de Remuneraciones (uso interno del equipo, local).
 *
 * Toma un CSV LRE exportado de KAME, lo corrige al formato DT y lo sube al
 * sistema (bucket `libros` + tabla `libro_remuneraciones`). Los LRE NO se
 * suben desde el panel: se dejan en la carpeta compartida y se cargan con esto.
 *
 * Uso:
 *   node scripts/cargar-lre.mjs <rutEmpresa> <periodo AAAA-MM> "<ruta csv>"
 * Ej:
 *   node scripts/cargar-lre.mjs 77902189-0 2026-01 "C:/.../779021890_202601.csv"
 *
 * Lee credenciales de .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardarEnOneDrive } from "./lre-onedrive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const txt = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// --- corrector DT (mismo criterio que src/lib/lre-dt.ts) ---
const CODES = { ini:"1102", ter:"1103", cau:"1104", reg:"1105", com:"1106", imp:"1170", jor:"1107", joven:"1118", iate:"1131", apvc:"1157", liq:"5501" };
const vacio = (v) => !v || !v.trim();

function corregir(buf, opts = {}) {
  const { region, comuna } = opts; // defaults provisionales para región/comuna vacías
  const lines = buf.toString("latin1").split(/\r?\n/);
  if (lines.length < 2 || !lines[0].includes("(1101)")) throw new Error("No parece un LRE (falta encabezado 1101).");
  const H = lines[0].split(";");
  const nCols = H.length;
  const idx = (c) => H.findIndex((h) => h.includes(`(${c})`));
  const I = {}; for (const [k,c] of Object.entries(CODES)) I[k] = idx(c);
  const out = [lines[0]];
  let n=0, liq=0, jorP=0, cauP=0, rcProv=0, faltaRC=0, neg=0;
  for (let i=1;i<lines.length;i++){
    if (!lines[i].trim()) continue;
    const c = lines[i].split(";");
    if (c.length !== nCols) throw new Error(`Fila ${i+1}: ${c.length} columnas (esperaba ${nCols}).`);
    if (/-/.test(c[I.ini]||"")) c[I.ini]=c[I.ini].replace(/-/g,"/");
    if (!vacio(c[I.ter]) && /-/.test(c[I.ter])) c[I.ter]=c[I.ter].replace(/-/g,"/");
    if (vacio(c[I.imp])) c[I.imp]="1";
    if (vacio(c[I.jor])) { c[I.jor]="101"; jorP++; }
    if (vacio(c[I.joven])) c[I.joven]="0";
    if (vacio(c[I.iate])) c[I.iate]="0";
    if (vacio(c[I.apvc])) c[I.apvc]="0";
    if (!vacio(c[I.ter]) && vacio(c[I.cau])) { c[I.cau]="6"; cauP++; }
    if (I.reg>=0 && (vacio(c[I.reg])||vacio(c[I.com]))) {
      if (region && comuna) { if (vacio(c[I.reg])) c[I.reg]=region; if (vacio(c[I.com])) c[I.com]=comuna; rcProv++; }
      else faltaRC++;
    }
    if ((Number(c[I.liq])||0) < 0) neg++;
    // La DT no acepta montos negativos: todo monto negativo se lleva a 0.
    for (let j=0;j<c.length;j++) if (/^-\d/.test(c[j])) c[j]="0";
    n++; liq += Number(c[I.liq])||0;
    out.push(c.join(";"));
  }
  return { output: Buffer.from(out.join("\r\n"),"latin1"), n, liq, jorP, cauP, rcProv, faltaRC, neg, nCols };
}

const rutNorm = (r) => (r||"").toUpperCase().replace(/[^0-9K]/g,"");

async function main() {
  const [rutArg, periodo, csvPath, region, comuna] = process.argv.slice(2);
  if (!rutArg || !/^\d{4}-\d{2}$/.test(periodo||"") || !csvPath) {
    console.error('Uso: node scripts/cargar-lre.mjs <rutEmpresa> <AAAA-MM> "<ruta csv>" [region] [comuna]');
    process.exit(1);
  }
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

  const rn = rutNorm(rutArg);
  const { data: clientes, error: e1 } = await supa.from("clientes").select("id, razon_social, rut_empresa, previred_rut, carpeta_onedrive");
  if (e1) throw e1;
  const cli = clientes.find((c) => rutNorm(c.previred_rut)===rn || rutNorm(c.rut_empresa)===rn);
  if (!cli) throw new Error(`No encontré empresa con RUT ${rutArg} en la cartera.`);

  const { output, n, liq, jorP, cauP, rcProv, faltaRC, neg, nCols } = corregir(fs.readFileSync(csvPath), { region, comuna });
  const yyyymm = periodo.replace("-","");
  const archivoPath = `${cli.id}/${rn}_${yyyymm}.csv`;

  const obs = [];
  if (rcProv) obs.push(`región/comuna provisional ${region}/${comuna} en ${rcProv} fila(s)`);
  if (neg) obs.push(`${neg} trabajador(es) con líquido negativo llevado a 0`);
  if (faltaRC) obs.push(`${faltaRC} fila(s) SIN región/comuna (rechazo DT)`);

  const { error: eUp } = await supa.storage.from("libros").upload(archivoPath, output, { contentType:"text/csv", upsert:true });
  if (eUp) throw eUp;

  const { error: eIns } = await supa.from("libro_remuneraciones").upsert({
    cliente_id: cli.id, periodo, rut_empleador: rn, archivo_path: archivoPath,
    n_trabajadores: n, total_liquido: liq,
    jornada_provisional: jorP>0, causal_provisional: cauP>0,
    observaciones: obs.length ? obs.join("; ") : null,
    estado: "cargado", updated_at: new Date().toISOString(),
  }, { onConflict: "cliente_id,periodo" });
  if (eIns) throw eIns;

  // Deja el archivo también en la carpeta OneDrive de la empresa (cierre del proceso).
  const od = guardarEnOneDrive(cli.carpeta_onedrive, rn, yyyymm, output);

  console.log(`OK · ${cli.razon_social} · ${periodo} · ${n} trab · líquido $${liq.toLocaleString("es-CL")} · cols ${nCols}` +
    ` · jorn prov ${jorP} · caus prov ${cauP}` + (rcProv?` · reg/com prov ${rcProv}`:"") +
    (faltaRC?` · SIN reg/com ${faltaRC}`:"") + (neg?` · líq negativo ${neg}`:"") +
    (od.ok?` · OneDrive ✓`:` · OneDrive ✗ (${od.motivo})`));
}

main().catch((e) => { console.error("ERROR:", e.message||e); process.exit(1); });
