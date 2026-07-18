/**
 * Cargador MASIVO del Libro de Remuneraciones (uso interno, local).
 *
 * Procesa TODOS los CSV de una carpeta de una sola pasada: por cada archivo
 * `RUTempresa_AAAAMM.csv` (nombre que da KAME) detecta empresa + período,
 * corrige el formato DT y sube al sistema (bucket `libros` + tabla).
 *
 * Uso:
 *   node scripts/cargar-lre-carpeta.mjs "C:/ruta/a/carpeta" [region] [comuna]
 *   - region/comuna (opcional): default provisional para filas con esos campos vacíos.
 *
 * Al final imprime un reporte agrupado por empresa y una lista de "requiere atención".
 * Meses con archivo vacío se informan (no se cargan; márcalos "sin movimiento" en el panel).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardarEnOneDrive } from "./lre-onedrive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cargarEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

const CODES = { ini:"1102", ter:"1103", cau:"1104", reg:"1105", com:"1106", imp:"1170", jor:"1107", joven:"1118", iate:"1131", apvc:"1157", liq:"5501" };
const vacio = (v) => !v || !v.trim();
const rutNorm = (r) => (r||"").toUpperCase().replace(/[^0-9K]/g,"");

function corregir(buf, opts = {}) {
  const { region, comuna } = opts;
  const lines = buf.toString("latin1").split(/\r?\n/);
  if (lines.length < 1 || !lines[0].includes("(1101)")) throw new Error("no es LRE (falta 1101)");
  const H = lines[0].split(";"); const nCols = H.length;
  const idx = (c) => H.findIndex((h) => h.includes(`(${c})`));
  const I = {}; for (const [k,c] of Object.entries(CODES)) I[k] = idx(c);
  const out = [lines[0]]; let n=0, liq=0, jorP=0, cauP=0, rcProv=0, faltaRC=0, neg=0, term=0;
  for (let i=1;i<lines.length;i++){
    if (!lines[i].trim()) continue;
    const c = lines[i].split(";");
    if (c.length !== nCols) throw new Error(`fila ${i+1}: ${c.length} cols (esperaba ${nCols})`);
    if (/-/.test(c[I.ini]||"")) c[I.ini]=c[I.ini].replace(/-/g,"/");
    if (!vacio(c[I.ter]) && /-/.test(c[I.ter])) c[I.ter]=c[I.ter].replace(/-/g,"/");
    if (vacio(c[I.imp])) c[I.imp]="1";
    if (vacio(c[I.jor])) { c[I.jor]="101"; jorP++; }
    if (vacio(c[I.joven])) c[I.joven]="0";
    if (vacio(c[I.iate])) c[I.iate]="0";
    if (vacio(c[I.apvc])) c[I.apvc]="0";
    if (!vacio(c[I.ter]) && vacio(c[I.cau])) { c[I.cau]="6"; cauP++; }
    if (!vacio(c[I.ter])) term++;
    if (I.reg>=0 && (vacio(c[I.reg])||vacio(c[I.com]))) {
      if (region && comuna) { if (vacio(c[I.reg])) c[I.reg]=region; if (vacio(c[I.com])) c[I.com]=comuna; rcProv++; }
      else faltaRC++;
    }
    if ((Number(c[I.liq])||0) < 0) neg++;
    for (let j=0;j<c.length;j++) if (/^-\d/.test(c[j])) c[j]="0";
    n++; liq += Number(c[I.liq])||0;
    out.push(c.join(";"));
  }
  return { output: Buffer.from(out.join("\r\n"),"latin1"), n, liq, jorP, cauP, rcProv, faltaRC, neg, term, nCols };
}

async function main() {
  const [dir, region, comuna] = process.argv.slice(2);
  if (!dir || !fs.existsSync(dir)) { console.error('Uso: node scripts/cargar-lre-carpeta.mjs "<carpeta>" [region] [comuna]'); process.exit(1); }
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

  const { data: clientes, error } = await supa.from("clientes").select("id, razon_social, rut_empresa, previred_rut, carpeta_onedrive");
  if (error) throw error;
  const porRut = new Map();
  for (const c of clientes) { const a=rutNorm(c.rut_empresa), b=rutNorm(c.previred_rut); if(a)porRut.set(a,c); if(b&&!porRut.has(b))porRut.set(b,c); }

  // Archivos RUT_AAAAMM.csv (RUT con DV, incluye K; ignora sufijos " (1)")
  const files = fs.readdirSync(dir).filter((f) => /(\d{7,9}[kK]?)_(\d{6}).*\.csv$/i.test(f));
  const ok = [], atencion = [], vacios = [], sinEmpresa = [];

  for (const f of files.sort()) {
    const m = f.match(/(\d{7,9}[kK]?)_(\d{6})/);
    const rutDigits = rutNorm(m[1]), yyyymm = m[2];
    const periodo = `${yyyymm.slice(0,4)}-${yyyymm.slice(4)}`;
    // rut del archivo = rut empresa sin DV; probamos con y sin DV calculando no es trivial → match por prefijo
    const cli = porRut.get(rutDigits);
    if (!cli) { sinEmpresa.push(`${f} (RUT ${rutDigits})`); continue; }
    let res;
    try { res = corregir(fs.readFileSync(path.join(dir, f)), { region, comuna }); }
    catch (e) { atencion.push(`${cli.razon_social} ${periodo}: ERROR ${e.message}`); continue; }
    if (res.n === 0) { vacios.push(`${cli.razon_social} ${periodo}`); continue; }

    const rn = rutNorm(cli.rut_empresa);
    const archivoPath = `${cli.id}/${rn}_${yyyymm}.csv`;
    const { error: eUp } = await supa.storage.from("libros").upload(archivoPath, res.output, { contentType:"text/csv", upsert:true });
    if (eUp) { atencion.push(`${cli.razon_social} ${periodo}: subida ${eUp.message}`); continue; }
    const obs = [];
    if (res.rcProv) obs.push(`reg/com prov ${region}/${comuna} (${res.rcProv})`);
    if (res.neg) obs.push(`${res.neg} líq negativo→0`);
    if (res.faltaRC) obs.push(`${res.faltaRC} SIN reg/com`);
    const { error: eIns } = await supa.from("libro_remuneraciones").upsert({
      cliente_id: cli.id, periodo, rut_empleador: rn, archivo_path: archivoPath,
      n_trabajadores: res.n, total_liquido: res.liq,
      jornada_provisional: res.jorP>0, causal_provisional: res.cauP>0,
      observaciones: obs.length ? obs.join("; ") : null, estado:"cargado", updated_at:new Date().toISOString(),
    }, { onConflict:"cliente_id,periodo" });
    if (eIns) { atencion.push(`${cli.razon_social} ${periodo}: insert ${eIns.message}`); continue; }
    // Deja el archivo también en la carpeta OneDrive de la empresa (cierre del proceso).
    const od = guardarEnOneDrive(cli.carpeta_onedrive, rn, yyyymm, res.output);
    if (!od.ok) atencion.push(`${cli.razon_social} ${periodo}: OneDrive ✗ (${od.motivo})`);
    ok.push({ emp: cli.razon_social, periodo, n: res.n, liq: res.liq, term: res.term, neg: res.neg, rcProv: res.rcProv, faltaRC: res.faltaRC, od: od.ok });
  }

  // Reporte
  const byEmp = {};
  for (const r of ok) (byEmp[r.emp] ??= []).push(r);
  console.log(`\n=== CARGADOS: ${ok.length} libros de ${Object.keys(byEmp).length} empresas ===`);
  for (const emp of Object.keys(byEmp).sort()) {
    const rows = byEmp[emp].sort((a,b)=>a.periodo.localeCompare(b.periodo));
    console.log(`\n${emp}`);
    for (const r of rows) console.log(`  ${r.periodo}: ${r.n} trab · $${r.liq.toLocaleString("es-CL")}` +
      (r.term?` · ${r.term} término(s)`:"") + (r.neg?` · ${r.neg} neg→0`:"") + (r.rcProv?` · reg/com prov`:"") + (r.faltaRC?` · SIN reg/com`:"") +
      (r.od?` · OneDrive ✓`:` · OneDrive ✗`));
  }
  if (vacios.length) console.log(`\n=== VACÍOS (marcar "sin movimiento"): ${vacios.length} ===\n  ` + vacios.join("\n  "));
  if (sinEmpresa.length) console.log(`\n=== SIN EMPRESA EN CARTERA: ${sinEmpresa.length} ===\n  ` + sinEmpresa.join("\n  "));
  if (atencion.length) console.log(`\n=== REQUIERE ATENCIÓN: ${atencion.length} ===\n  ` + atencion.join("\n  "));
}

main().catch((e) => { console.error("ERROR:", e.message||e); process.exit(1); });
