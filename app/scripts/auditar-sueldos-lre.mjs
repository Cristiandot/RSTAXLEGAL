/**
 * Auditoría transversal de sueldos base en los LRE de un período (uso interno, local).
 *
 * Regla (17-07-2026, caso LeBlanc): con jornada ordinaria (1107=101) el sueldo base
 * (2101) no puede quedar bajo el IMM ($553.553 desde mayo 2026), prorrateado por los
 * días trabajados del mes (1115). OJO: KAME exporta mal 2101 cuando la liquidación
 * trae ajuste retroactivo, así que todo hallazgo se verifica contra las liquidaciones
 * emitidas antes de concluir — esto genera la lista de verificación, no el veredicto.
 *
 * Baja cada CSV desde el bucket `libros` (fuente más completa que OneDrive).
 *
 * Uso: node scripts/tmp-auditar-sueldos-lre.mjs [AAAA-MM]   (default 2026-06)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMM = 553553; // ingreso mínimo vigente desde mayo 2026
const rutNorm = (r) => (r || "").toUpperCase().replace(/[^0-9K]/g, "");
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? n : 0; };
const clp = (n) => "$" + n.toLocaleString("es-CL");

function cargarEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

function parseLre(buf) {
  const lines = buf.toString("latin1").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !lines[0].includes("(1101)")) throw new Error("no es LRE");
  const codeIdx = {};
  lines[0].split(";").forEach((h, i) => { const m = h.match(/\((\d+)\)/); if (m) codeIdx[m[1]] = i; });
  const filas = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(";");
    const gs = (code) => (c[codeIdx[code]] ?? "").trim();
    if (!gs("1101")) continue;
    filas.push({
      rut: gs("1101"),
      jornada: gs("1107"),
      dias: num(gs("1115")),
      lic: num(gs("1116")),
      vac: num(gs("1117")),
      sueldo: num(gs("2101")),
      fechaTermino: gs("1103"),
      liquido: num(gs("5501")),
    });
  }
  return filas;
}

async function main() {
  const periodo = process.argv[2] || "2026-06";
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: libros, error: e1 } = await supa.from("libro_remuneraciones")
    .select("cliente_id, archivo_path, n_trabajadores, clientes(razon_social)")
    .eq("periodo", periodo).gt("n_trabajadores", 0).neq("archivo_path", "");
  if (e1) throw e1;

  const { data: trabs, error: e2 } = await supa.from("trabajadores").select("cliente_id, rut, nombres, apellidos");
  if (e2) throw e2;
  const nombrePorRut = new Map(trabs.map((t) => [t.cliente_id + "|" + rutNorm(t.rut), `${t.apellidos ?? ""}, ${t.nombres ?? ""}`.trim()]));

  const IMM_VIEJO = 539000, IMM_2025 = 529000, JORNADA_FULL = 42;
  /** Clasifica un sueldo mensualizado contra los mínimos, probando horas 1..42. */
  function clasificar(mensual) {
    const TOL = 5;
    for (const [nombre, imm] of [["IMM vigente", IMM], ["IMM VIEJO $539.000", IMM_VIEJO], ["IMM 2025 $529.000", IMM_2025]]) {
      if (Math.abs(mensual - imm) <= TOL) return { tipo: nombre, horas: JORNADA_FULL };
      for (let h = 1; h < JORNADA_FULL; h++) {
        if (Math.abs(mensual - Math.round(imm * h / JORNADA_FULL)) <= TOL) return { tipo: nombre, horas: h };
      }
    }
    return null;
  }

  const flags = []; const parciales = []; const errores = []; let nTrab = 0, nEmp = 0;

  for (const lb of libros.sort((a, b) => a.clientes.razon_social.localeCompare(b.clientes.razon_social))) {
    const { data: blob, error } = await supa.storage.from("libros").download(lb.archivo_path);
    if (error) { errores.push(`${lb.clientes.razon_social}: no pude bajar ${lb.archivo_path} (${error.message})`); continue; }
    let filas;
    try { filas = parseLre(Buffer.from(await blob.arrayBuffer())); }
    catch (e) { errores.push(`${lb.clientes.razon_social}: ${e.message}`); continue; }
    nEmp++;
    for (const f of filas) {
      nTrab++;
      const nombre = nombrePorRut.get(lb.cliente_id + "|" + rutNorm(f.rut)) || "(sin ficha)";
      const base = { empresa: lb.clientes.razon_social, rut: f.rut, nombre, ...f };
      if (f.dias <= 0) continue; // mes completo en licencia/sin días: sueldo 0 esperable
      if (f.jornada && f.jornada !== "101") { // parcial (201), extraordinaria (301), exenta (701)
        parciales.push(base);
        continue;
      }
      const piso = Math.round(IMM * Math.min(f.dias, 30) / 30);
      if (f.sueldo >= piso - 1) continue;
      // Mensualizar por días para clasificar contra los mínimos
      const mensual = f.dias >= 30 ? f.sueldo : Math.round(f.sueldo * 30 / f.dias);
      const c = clasificar(mensual);
      let cat;
      if (c && c.tipo === "IMM vigente") cat = `A-PARCIAL OK (${c.horas}h del IMM vigente — solo jornada mal etiquetada 101)`;
      else if (c) cat = c.horas === JORNADA_FULL
        ? `B-SUELDO VIEJO jornada completa (${c.tipo}) — AJUSTAR`
        : `C-PARCIAL con sueldo viejo (${c.horas}h del ${c.tipo}) — AJUSTAR proporcional`;
      else if (mensual >= IMM * 0.98) cat = "D-CASI PISO — posible bug 2101 KAME (verificar liquidación emitida)";
      else cat = "E-REVISAR contrato/liquidación (no calza con ningún mínimo)";
      flags.push({ ...base, piso, mensual, cat });
    }
  }

  console.log(`AUDITORÍA SUELDO BASE LRE ${periodo} — piso jornada ordinaria: ${clp(IMM)} (prorrateado por días)`);
  console.log(`${nEmp} empresas, ${nTrab} filas de trabajador analizadas.\n`);

  if (flags.length) {
    const orden = ["B", "C", "E", "D", "A"];
    flags.sort((x, y) => orden.indexOf(x.cat[0]) - orden.indexOf(y.cat[0]) || x.empresa.localeCompare(y.empresa));
    let cur = "";
    for (const f of flags) {
      if (f.cat[0] !== cur) { cur = f.cat[0]; console.log(`\n═══ CATEGORÍA ${cur} ═══`); }
      console.log(`  ${f.empresa} | ${f.rut} ${f.nombre} | días ${f.dias} | 2101 ${clp(f.sueldo)} (mensualizado ${clp(f.mensual)}) | ${f.cat}${f.fechaTermino ? " | término " + f.fechaTermino : ""}`);
    }
  } else console.log("Sin casos bajo el piso en jornada ordinaria.");

  if (parciales.length) {
    console.log(`\nℹ Jornadas no ordinarias (piso proporcional a horas, no auditable desde el LRE): ${parciales.length}`);
    for (const p of parciales) console.log(`  ${p.empresa} | ${p.rut} ${p.nombre} | jornada ${p.jornada} | días ${p.dias} | sueldo ${clp(p.sueldo)}`);
  }
  if (errores.length) { console.log(`\n✗ Errores:`); errores.forEach((e) => console.log("  " + e)); }
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });
