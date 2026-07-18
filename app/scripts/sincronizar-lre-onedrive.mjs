/**
 * Sincroniza los LRE ya cargados (bucket `libros`) hacia la carpeta OneDrive de
 * cada empresa: `<carpeta_onedrive>/01-RRHH/LRE <año>/<rut>_<AAAAMM>.csv`.
 *
 * Idempotente: recorre `libro_remuneraciones` con archivo (estados distintos de
 * "sin_movimiento"), descarga el CSV corregido del bucket y lo deja en la empresa.
 * Sirve de backfill de lo ya cargado y como reparación si falta alguna copia.
 *
 * Uso:
 *   node scripts/sincronizar-lre-onedrive.mjs            (todas las empresas)
 *   node scripts/sincronizar-lre-onedrive.mjs 77902189-0 (solo una, por RUT)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { guardarEnOneDrive } from "./lre-onedrive.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rutNorm = (r) => (r || "").toUpperCase().replace(/[^0-9K]/g, "");

function cargarEnv() {
  const txt = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const l of txt.split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }
  return env;
}

async function main() {
  const filtroRut = rutNorm(process.argv[2] || "");
  const env = cargarEnv();
  const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rows, error } = await supa
    .from("libro_remuneraciones")
    .select("cliente_id, periodo, rut_empleador, archivo_path, estado")
    .neq("estado", "sin_movimiento")
    .order("periodo");
  if (error) throw error;

  const { data: clientes, error: eC } = await supa
    .from("clientes")
    .select("id, razon_social, carpeta_onedrive, rut_empresa, previred_rut");
  if (eC) throw eC;
  const byId = new Map(clientes.map((c) => [c.id, c]));

  let ok = 0, skip = 0; const fallas = [];
  for (const r of rows) {
    const c = byId.get(r.cliente_id) || {};
    if (!r.archivo_path || !r.archivo_path.trim()) { skip++; continue; }
    if (filtroRut && rutNorm(c.rut_empresa) !== filtroRut && rutNorm(c.previred_rut) !== filtroRut && rutNorm(r.rut_empleador) !== filtroRut) continue;

    const { data: blob, error: eDl } = await supa.storage.from("libros").download(r.archivo_path);
    if (eDl || !blob) { fallas.push(`${c.razon_social} ${r.periodo}: descarga ${eDl?.message || "sin datos"}`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const yyyymm = r.periodo.replace("-", "");
    const rn = r.rut_empleador || rutNorm(c.rut_empresa);
    const od = guardarEnOneDrive(c.carpeta_onedrive, rn, yyyymm, buf);
    if (od.ok) { ok++; console.log(`✓ ${c.razon_social} ${r.periodo} → ${od.dest}`); }
    else fallas.push(`${c.razon_social} ${r.periodo}: OneDrive ${od.motivo}`);
  }

  console.log(`\n=== ${ok} archivo(s) dejados en OneDrive · ${skip} sin archivo (omitidos) ===`);
  if (fallas.length) console.log(`\n=== FALLAS: ${fallas.length} ===\n  ` + fallas.join("\n  "));
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });
