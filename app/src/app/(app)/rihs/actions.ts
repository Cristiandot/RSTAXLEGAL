"use server";

import { getUsuarioActual } from "@/lib/auth";
import { generarDocx } from "@/lib/generar-docx";
import { nombreArchivo } from "@/lib/format";

/**
 * Genera el RIHS (.docx) desde la plantilla tipo (D.S. N° 44, < 10 trabajadores)
 * rellenando la razón social de la empresa. La matriz de riesgos y los EPP por
 * tarea quedan con la nota de "completar según rubro" para ajustar a mano.
 * No persiste nada: devuelve el archivo en base64 para descarga directa.
 */
export async function generarRihs(
  variables: Record<string, string>,
): Promise<{ ok: boolean; error?: string; base64?: string; filename?: string }> {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)

  try {
    const buffer = await generarDocx(
      "plantillas/GENERICO/RIHS DS44 (menos de 10 trabajadores).docx",
      variables,
    );
    const empresa = variables.RAZON_SOCIAL?.trim() || "Empresa";
    const filename = nombreArchivo(`RIHS - ${empresa}`) + ".docx";
    return { ok: true, base64: buffer.toString("base64"), filename };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo generar el documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
