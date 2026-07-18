/**
 * Crea/enriquece fichas de `trabajadores` desde las boletas de junio de KAME
 * (dataset scrapeado en scratchpad/boletas-junio.json). Uso interno, local.
 *
 * La sección Empleados de KAME NO es confiable; la boleta es la fuente (lo que
 * realmente se pagó). Este script crea trabajadores VIGENTES (los que tienen
 * boleta de junio) que aún no existan en el panel, matcheando por RUT dentro de
 * la empresa. NO pisa fichas existentes (esas se reconcilian aparte). Los montos
 * de la liquidación se cargan luego desde el LRE (importar-liquidaciones-lre.mjs).
 *
 * Empresarial: si la tasa AFP de la boleta incluye el SIS (>=11.9), el trabajador
 * paga su propio SIS ⇒ sueldo_empresarial=true.
 *
 * Uso:  node scripts/crear-fichas-boletas.mjs [--write] [rutEmpresa]
 *       (sin --write = dry-run; rutEmpresa opcional para una sola)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutNorm = (r) => (r || "").toUpperCase().replace(/[^0-9K]/g, "");
const SC = "C:/Users/CRISTI~1/AppData/Local/Temp/claude/C--Users-CristianL-pezThienel-OneDrive---Rodr-guez-Samith-Tax---Legal-Limitada-RSTL---Clientes/3ced6794-e7ea-4709-8b61-db41675d2fad/scratchpad";

function cargarEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

const AFP_MAP = { MODELO:"Modelo", CAPITAL:"Capital", HABITAT:"Habitat", CUPRUM:"Cuprum", PLANVITAL:"PlanVital", "PLAN VITAL":"PlanVital", UNO:"Uno", PROVIDA:"Provida" };
function mapAfp(n){ if(!n) return null; const k=n.toUpperCase().trim(); return AFP_MAP[k] || (k.charAt(0)+k.slice(1).toLowerCase()); }
function mapSalud(n){ if(!n) return null; const k=n.toUpperCase();
  if(k.includes("FONASA")) return "Fonasa";
  if(k.includes("CRUZ BLANCA")) return "Cruz Blanca";
  if(k.includes("NUEVA MASVIDA")||k.includes("MASVIDA")) return "Nueva Masvida";
  if(k.includes("CONSALUD")) return "Consalud"; if(k.includes("COLMENA")) return "Colmena";
  if(k.includes("BANMEDICA")||k.includes("BANMÉDICA")) return "Banmédica"; if(k.includes("VIDA TRES")||k.includes("VIDATRES")) return "Vida Tres";
  return n.replace(/^ISAPRE\s+/i,"").replace(/\s+S\.A\.?$/i,"").trim(); }
function fecha(d){ if(!d) return null; const m=d.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m?`${m[3]}-${m[2]}-${m[1]}`:null; }
function splitNombre(full){ const t=(full||"").trim().split(/\s+/);
  if(t.length>=3) return { ap:t[0], am:t[1], nom:t.slice(2).join(" ") };
  if(t.length===2) return { ap:t[0], am:"", nom:t[1] };
  return { ap:t[0]||"", am:"", nom:t[0]||"" }; }

async function main(){
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const soloRut = args.find(a=>/^\d/.test(a));
  const data = JSON.parse(fs.readFileSync(path.join(SC,"boletas-junio.json"),"utf8"));
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });

  const { data: clientes } = await supa.from("clientes").select("id, razon_social, rut_empresa, previred_rut");
  const porRut = new Map(); for(const c of clientes){ const a=rutNorm(c.rut_empresa),b=rutNorm(c.previred_rut); if(a)porRut.set(a,c); if(b&&!porRut.has(b))porRut.set(b,c); }

  let totNuevos=0, totExist=0, totEmp=0; const sinCliente=[];
  for(const rutEmp in data){
    if(soloRut && rutEmp!==rutNorm(soloRut)) continue;
    const r = data[rutEmp]; if(!r.n) continue;
    const cli = porRut.get(rutEmp);
    if(!cli){ sinCliente.push(rutEmp); continue; }
    const { data: existentes } = await supa.from("trabajadores").select("rut").eq("cliente_id", cli.id);
    const yaRut = new Set((existentes||[]).map(t=>rutNorm(t.rut)));
    const nuevos=[];
    for(const w of r.workers){
      if(yaRut.has(rutNorm(w.rut))) { totExist++; continue; }
      const {ap,am,nom}=splitNombre(w.nombre);
      const empresarial = parseFloat(w.afpTasa||"0") >= 11.9;
      if(empresarial) totEmp++;
      nuevos.push({
        cliente_id: cli.id, nombres: nom, apellidos: [ap,am].filter(Boolean).join(" "), apellido_paterno: ap, apellido_materno: am||null,
        rut: w.rut, cargo: w.cargo||null, sucursal: w.unidad||null,
        tipo_contrato: /plazo/i.test(w.contrato||"") ? "plazo_fijo" : "indefinido",
        tipo_trabajador: "activo", regimen_previsional: "afp", sueldo_modalidad: "mensual",
        afp: mapAfp(w.afpNom), salud: mapSalud(w.saludNom),
        sueldo_base: w.sueldoBase||null, sueldo_empresarial: empresarial,
        fecha_ingreso: fecha(w.ingreso), fecha_termino_contrato: fecha(w.termino),
        montos_fijos: { colacion:0, movilizacion:0, conceptos:{} },
        cargas_simples:0, cargas_maternales:0, cargas_invalidas:0, activo:true,
      });
    }
    totNuevos += nuevos.length;
    console.log(`${(cli.razon_social||rutEmp).slice(0,34).padEnd(34)} | nuevos ${nuevos.length} | ya existen ${r.workers.length-nuevos.length}`);
    if(write && nuevos.length){
      const { error } = await supa.from("trabajadores").insert(nuevos);
      if(error) console.log(`   ERROR insert: ${error.message}`);
    }
  }
  console.log(`\n${write?"ESCRITO":"DRY-RUN"} · nuevos a crear: ${totNuevos} · ya existían: ${totExist} · empresarial detectados: ${totEmp}`);
  if(sinCliente.length) console.log(`Sin cliente en cartera: ${sinCliente.join(", ")}`);
}
main().catch(e=>{ console.error("ERROR:", e.message||e); process.exit(1); });
