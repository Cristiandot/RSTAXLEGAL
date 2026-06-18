"use server";

import { getUsuarioActual } from "@/lib/auth";
import { generarDocx } from "@/lib/generar-docx";
import { nombreArchivo } from "@/lib/format";

/**
 * Genera el contrato de mutuo de dinero (.docx) desde la plantilla genérica con
 * las variables del formulario. No persiste nada: devuelve el archivo en base64
 * para descarga directa.
 */
export async function generarMutuo(
  variables: Record<string, string>,
): Promise<{ ok: boolean; error?: string; base64?: string; filename?: string }> {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)

  try {
    const buffer = await generarDocx(
      "plantillas/GENERICO/CONTRATO Mutuo de Dinero.docx",
      variables,
    );
    const empresa = variables.EMPRESA_RAZON_SOCIAL?.trim() || "Empresa";
    const filename = nombreArchivo(`Contrato Mutuo - ${empresa}`) + ".docx";
    return { ok: true, base64: buffer.toString("base64"), filename };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo generar el documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
