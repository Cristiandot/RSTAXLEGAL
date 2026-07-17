/**
 * Importa/enriquece la ficha ADMINISTRATIVA de `trabajadores` desde el export
 * "Listado de Empleados" de KAME (XLSX). Match por RUT dentro de un cliente.
 *
 * SOLO rellena campos actualmente vacíos (NULL / ""); NUNCA pisa un dato ya
 * cargado en el panel. NO toca datos económicos ni contractuales (sueldo,
 * tipo de contrato, jornada, gratificación, montos fijos, cargas, tramo,
 * fecha de ingreso) — esos vienen del LRE / boletas, no de este listado.
 *
 * Uso:
 *   node scripts/importar-empleados-kame.mjs --cliente <id> [--xlsx <ruta>] \
 *        [--rut 10126537,10128860 | --limit 3] [--write]
 *   (sin --write = dry-run; imprime el diff campo a campo)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------- args ----------
const argv = process.argv.slice(2);
const getArg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const write = argv.includes("--write");
const auto = argv.includes("--auto"); // detecta el cliente por los RUTs del archivo
let clienteId = getArg("--cliente");
// carpeta con el XLSX ya descomprimido (contiene xl/sharedStrings.xml y xl/worksheets/sheet1.xml)
const xlsxDir = getArg("--dir");
const soloRuts = (getArg("--rut") || "").split(",").map(rutKey).filter(Boolean);
const limit = getArg("--limit") ? parseInt(getArg("--limit"), 10) : null;
if (!clienteId && !auto) { console.error("Falta --cliente <id> (o --auto)"); process.exit(1); }
if (!xlsxDir) { console.error("Falta --dir <carpeta con el xlsx descomprimido>"); process.exit(1); }

// ---------- helpers ----------
function rutNorm(r) { return (r || "").toUpperCase().replace(/[^0-9K]/g, "").replace(/K$/, "").replace(/^(\d+)$/, "$1"); }
// normaliza dejando SIN dígito verificador para comparar (la tabla guarda con DV con puntos)
function rutKey(r) {
  const clean = (r || "").toUpperCase().replace(/[^0-9K]/g, "");
  return clean.slice(0, -1); // sin DV
}
function cargarEnv() {
  const txt = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}
const clean = (v) => { const s = (v ?? "").toString().trim(); return s === "" ? null : s; };
function fechaISO(d) { const m = (d || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : null; }
function estadoCivil(v) { const s = clean(v); if (!s) return null; return s.replace(/\(a\)/i, "").trim(); }
function mapSexo(v) { const s = (v || "").toUpperCase().trim(); if (s === "M") return "Masculino"; if (s === "F") return "Femenino"; return clean(v); }
function mapRegimen(v) { const s = (v || "").toUpperCase().trim(); if (s === "AFP") return "afp"; if (s.includes("IPS") || s.includes("INP")) return "ips"; if (s === "SIP") return "sip"; return null; }
function mapDiscapacidad(v) { const s = (v || "").toUpperCase().trim(); if (!s || s === "NO") return "no"; return clean(v); }
function numeroCuenta(v) { const s = clean(v); return s ? s.replace(/\s+/g, "") : null; }
function planIsapre(v) { const s = clean(v); if (!s || /no tiene plan/i.test(s)) return null; return s; }
function monto(v) { const n = parseFloat((v || "").toString().replace(",", ".")); return isFinite(n) && n > 0 ? n : null; }
function profesion(v) { const s = clean(v); return s && /^(otros|s\/o|sin oficio|n\/a|na)$/i.test(s) ? null : s; }
// descarta teléfonos placeholder: "0", vacío, o un mismo dígito repetido (000000000, 999999999)
function fono(v) { const s = clean(v); if (!s) return null; const d = s.replace(/\D/g, ""); return (d === "" || /^(\d)\1*$/.test(d)) ? null : s; }

// nombres de banco al estándar del panel (evita fragmentar la nómina de transferencias)
const BANCOS = {
  "banco del estado de chile": "Banco Estado", "banco estado": "Banco Estado", "bancoestado": "Banco Estado",
  "banco de chile": "Banco de Chile", "banco chile": "Banco de Chile",
  "banco de credito e inversiones": "Banco BCI", "bci": "Banco BCI",
  "banco santander chile": "Banco Santander", "banco santander": "Banco Santander", "santander": "Banco Santander",
  "banco ripley": "Banco Ripley",
  "banco itau chile": "Banco Itaú", "banco itau": "Banco Itaú",
  "banco falabella": "Banco Falabella",
};
function mapBanco(v) { const s = clean(v); if (!s) return null; return BANCOS[norm(s)] || s; }

// nacionalidad al gentilicio femenino (forma que usa el panel)
const NACION = {
  chileno: "Chilena", chilena: "Chilena", chile: "Chilena",
  venezolano: "Venezolana", venezolana: "Venezolana", venezuela: "Venezolana",
  colombiano: "Colombiana", colombiana: "Colombiana", colombia: "Colombiana",
  peruano: "Peruana", peruana: "Peruana", peru: "Peruana",
  boliviano: "Boliviana", boliviana: "Boliviana", bolivia: "Boliviana",
  argentino: "Argentina", argentina: "Argentina",
  ecuatoriano: "Ecuatoriana", ecuatoriana: "Ecuatoriana", ecuador: "Ecuatoriana",
  haitiano: "Haitiana", haitiana: "Haitiana", haiti: "Haitiana",
};
function mapNacionalidad(v) { const s = clean(v); if (!s) return null; return NACION[norm(s)] || s; }

// ---------- parse xlsx ----------
function colIndex(ref) { const m = ref.match(/^([A-Z]+)\d+$/); if (!m) return -1; let n = 0; for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }
function parseXlsx(dir) {
  const ss = fs.readFileSync(path.join(dir, "xl", "sharedStrings.xml"), "utf8");
  const strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n"));
  const sh = fs.readFileSync(path.join(dir, "xl", "worksheets", "sheet1.xml"), "utf8");
  const rows = [...sh.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const arr = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const idx = colIndex(c[1]);
      const isStr = /t="s"/.test(c[2]);
      const vm = (c[3] || "").match(/<v>([\s\S]*?)<\/v>/);
      arr[idx] = vm ? (isStr ? strs[+vm[1]] : vm[1]) : null;
    }
    return arr;
  });
  return rows;
}

// normaliza un nombre de columna: minúsculas, sin tildes, sin puntos ni espacios extra
const norm = (s) => (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();

// mapea una fila del XLSX a campos de `trabajadores`, usando el índice por
// NOMBRE de encabezado (KAME intercala una columna fantasma que corre las posiciones).
// Alias de encabezados: KAME tiene 2 formatos de export (listadoempleados 40-col
// y el completo 64-col tipo "PUBA"). Las diferencias de tilde las absorbe norm();
// aquí van solo las que cambian de palabra.
const ALIAS = {
  "Mail": ["Mail", "Email Personal", "Email"],
  "Mail Empresa": ["Mail Empresa", "Email Empresa"],
  "Teléfono": ["Teléfono", "Teléfono Personal"],
  "Cuenta Corriente": ["Cuenta Corriente", "Número de Cuenta"],
  "Tipo Cta.": ["Tipo Cta.", "Tipo de Cuenta"],
  "Fecha de Nacimiento": ["Fecha de Nacimiento", "Fecha Nacimiento"],
  "Monto Plan de Salud": ["Monto Plan de Salud", "Valor Plan"],
  "Plan A.P.V.": ["Plan A.P.V.", "Plan APV"],
  "Institución A.P.V.": ["Institución A.P.V.", "Institución APV"],
  "Plan A.P.V. 2": ["Plan A.P.V. 2", "Plan APV2"],
  "Institución A.P.V. 2": ["Institución A.P.V. 2", "Institución APV2"],
  "Tipo de Discapacidad": ["Tipo de Discapacidad", "Tipo Discapacidad"],
};

function mapFila(fila, H) {
  const g = (nombre) => {
    for (const cand of ALIAS[nombre] || [nombre]) {
      const i = H[norm(cand)];
      if (i !== undefined) return fila[i];
    }
    return undefined;
  };
  const apv = {};
  if (clean(g("Plan A.P.V."))) apv.plan1 = clean(g("Plan A.P.V."));
  if (clean(g("Institución A.P.V."))) apv.institucion1 = clean(g("Institución A.P.V."));
  if (clean(g("Plan A.P.V. 2"))) apv.plan2 = clean(g("Plan A.P.V. 2"));
  if (clean(g("Institución A.P.V. 2"))) apv.institucion2 = clean(g("Institución A.P.V. 2"));
  return {
    nombres: clean(g("Nombres")),
    apellido_paterno: clean(g("Apellido Paterno")),
    apellido_materno: clean(g("Apellido Materno")),
    direccion: clean(g("Dirección")),
    ciudad: clean(g("Ciudad")),
    comuna: clean(g("Comuna")),
    correo: clean(g("Mail")),
    correo_empresa: clean(g("Mail Empresa")),
    fono: fono(g("Teléfono")),
    estado_civil: estadoCivil(g("Estado Civil")),
    fecha_nacimiento: fechaISO(g("Fecha de Nacimiento")),
    sexo: mapSexo(g("Sexo")),
    genero: clean(g("Género")),
    profesion: profesion(g("Profesión")),
    enfermedades_alergias: clean(g("Enfermedades")),
    contacto_emergencia: clean(g("Contacto de Emergencia")),
    banco: mapBanco(g("Banco")),
    tipo_cuenta: clean(g("Tipo Cta.")),
    numero_cuenta: numeroCuenta(g("Cuenta Corriente")),
    regimen_previsional: mapRegimen(g("Régimen Previsional")),
    afp: clean(g("Previsión")),
    salud: clean(g("Salud")),
    plan_isapre: planIsapre(g("Plan de Salud")),
    salud_plan_valor: monto(g("Monto Plan de Salud")),
    nacionalidad: mapNacionalidad(g("Nacionalidad")),
    sindicato: clean(g("Sindicato")),
    discapacidad: mapDiscapacidad(g("Tipo de Discapacidad")),
    clasificacion_sence: clean(g("Clasificación Sence")),
    sucursal: clean(g("Unidad de Negocio")),
    prevision_voluntaria: Object.keys(apv).length ? apv : null,
  };
}

async function main() {
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const rows = parseXlsx(xlsxDir);
  const header = rows[0];
  const H = {}; header.forEach((h, i) => { if (h != null && h !== "") H[norm(h)] = i; });
  const rutCol = H[norm("Rut")];
  const dataRows = rows.slice(1).filter((r) => clean(r[rutCol]));
  const porRut = new Map();
  for (const r of dataRows) porRut.set(rutKey(r[rutCol]), r);

  // --auto: detecta el cliente por mayoría de RUTs del archivo
  if (!clienteId) {
    let all = [], from = 0;
    for (;;) {
      const { data, error } = await supa.from("trabajadores").select("rut, cliente_id").range(from, from + 999);
      if (error) { console.error(error); process.exit(1); }
      all = all.concat(data); if (data.length < 1000) break; from += 1000;
    }
    const cuenta = {};
    for (const t of all) { const k = rutKey(t.rut); if (porRut.has(k)) cuenta[t.cliente_id] = (cuenta[t.cliente_id] || 0) + 1; }
    const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
    if (!top) { console.log(`  ✗ ${xlsxDir}: ningún RUT calza con el panel — se omite`); return; }
    clienteId = top[0];
    const { data: c } = await supa.from("clientes").select("razon_social").eq("id", clienteId).single();
    console.log(`  → detectado: ${c?.razon_social} (${top[1]} RUTs)`);
  }

  const { data: trabajadores, error } = await supa
    .from("trabajadores").select("*").eq("cliente_id", clienteId);
  if (error) { console.error(error); process.exit(1); }

  let objetivo = trabajadores;
  if (soloRuts.length) objetivo = trabajadores.filter((t) => soloRuts.includes(rutKey(t.rut)));
  if (limit) objetivo = objetivo.slice(0, limit);

  let conMatch = 0, sinMatch = 0, totalCampos = 0, tocados = 0;
  for (const t of objetivo) {
    const fila = porRut.get(rutKey(t.rut));
    if (!fila) { sinMatch++; console.log(`  ✗ ${t.rut} ${t.nombres} ${t.apellido_paterno} — SIN match en XLSX`); continue; }
    conMatch++;
    const nuevo = mapFila(fila, H);
    const cambios = {};
    for (const [k, v] of Object.entries(nuevo)) {
      if (v === null || v === undefined) continue;
      const actual = t[k];
      const vacio = actual === null || actual === undefined || (typeof actual === "string" && actual.trim() === "");
      if (vacio) { cambios[k] = v; totalCampos++; }
    }
    if (Object.keys(cambios).length === 0) { console.log(`  = ${t.rut} ${t.nombres} ${t.apellido_paterno} — sin cambios (ya completo)`); continue; }
    tocados++;
    console.log(`\n  ● ${t.rut} ${t.nombres} ${t.apellido_paterno} ${t.apellido_materno}  [${Object.keys(cambios).length} campos]`);
    for (const [k, v] of Object.entries(cambios)) console.log(`      ${k}: ${JSON.stringify(v)}`);
    if (write) {
      const { error: e2 } = await supa.from("trabajadores").update(cambios).eq("id", t.id);
      if (e2) console.log(`      ⚠ ERROR update: ${e2.message}`);
    }
  }

  console.log(`\n──────── ${write ? "ESCRITO" : "DRY-RUN"} ────────`);
  console.log(`Trabajadores objetivo: ${objetivo.length} | con match: ${conMatch} | sin match: ${sinMatch}`);
  console.log(`Fichas a modificar: ${tocados} | campos a rellenar: ${totalCampos}`);
  if (!write) console.log(`(dry-run — agregá --write para aplicar)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
