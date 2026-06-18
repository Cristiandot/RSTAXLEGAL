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

// fechaLarga y montoCLP viven en lib/format (client-safe, sin node:fs); se
// re-exportan acá para no romper a quienes ya los importaban desde generar-docx.
export { fechaLarga, montoCLP } from "@/lib/format";
