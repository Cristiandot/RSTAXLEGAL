import fs from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

/**
 * Rellena una plantilla .docx con variables {NOMBRE}. Las plantillas viven en
 * app/plantillas/ (incluidas en el bundle vía outputFileTracingIncludes).
 * Variables sin valor quedan en blanco (nullGetter), nunca rompen el render.
 */
export async function generarDocx(
  archivoPath: string,
  datos: Record<string, string>,
): Promise<Buffer> {
  const ruta = path.join(process.cwd(), archivoPath);
  const contenido = await fs.readFile(ruta);
  const zip = new PizZip(contenido);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
    nullGetter: () => "",
  });
  doc.render(datos);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre",
];

/** ISO `2026-06-10` → "10 de junio de 2026" (formato de cláusulas). */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Monto numérico → "529.000" (formato CLP sin símbolo, el $ está en la plantilla). */
export function montoCLP(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("es-CL");
}
