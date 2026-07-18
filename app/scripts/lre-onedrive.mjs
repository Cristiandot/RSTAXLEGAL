/**
 * Helper compartido: deja el CSV LRE corregido (DT-ready) en la carpeta
 * OneDrive de la empresa, en `<carpeta_onedrive>/01-RRHH/LRE <año>/<rut>_<AAAAMM>.csv`.
 *
 * Lo usan los cargadores (`cargar-lre.mjs`, `cargar-lre-carpeta.mjs`) para que el
 * proceso por empresa TERMINE con el archivo también en su carpeta, no solo en el
 * bucket; y `sincronizar-lre-onedrive.mjs` para el backfill desde el bucket.
 *
 * Base OneDrive = env RSTL_CLIENTES_DIR o el default de la máquina de RS.
 */
import fs from "node:fs";
import path from "node:path";

export const RSTL_DIR =
  process.env.RSTL_CLIENTES_DIR ||
  "C:/Users/CristianLópezThienel/OneDrive - Rodríguez Samith Tax & Legal Limitada/RSTL - Clientes";

/**
 * @param {string} carpetaOnedrive  ruta relativa a "RSTL - Clientes" (col clientes.carpeta_onedrive)
 * @param {string} rn               RUT empleador normalizado sin puntos/guión
 * @param {string} yyyymm           período AAAAMM
 * @param {Buffer} output           CSV corregido (latin1/ANSI)
 * @returns {{ok:boolean, dest?:string, motivo?:string}}
 */
export function guardarEnOneDrive(carpetaOnedrive, rn, yyyymm, output) {
  if (!carpetaOnedrive || !carpetaOnedrive.trim())
    return { ok: false, motivo: "cliente sin carpeta_onedrive" };
  const anio = yyyymm.slice(0, 4);
  const rel = carpetaOnedrive.replace(/\\/g, "/");
  const destDir = path.join(RSTL_DIR, rel, "01-RRHH", `LRE ${anio}`);
  try {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${rn}_${yyyymm}.csv`);
    fs.writeFileSync(dest, output);
    return { ok: true, dest };
  } catch (e) {
    return { ok: false, motivo: e.message || String(e) };
  }
}
