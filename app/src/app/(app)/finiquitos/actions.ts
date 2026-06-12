"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EntradaFiniquito } from "@/lib/finiquito";
import {
  generarYSubirCartaAviso,
  type ParametrosCartaAviso,
  type ResultadoCartaAviso,
} from "@/lib/carta-aviso";

/**
 * Genera la carta de aviso de término (Art. 162 CT) con los datos de la
 * solicitud + el cálculo vigente, y devuelve el link de descarga.
 */
export async function generarCartaAviso(
  gestionId: string,
  parametros: ParametrosCartaAviso,
): Promise<ResultadoCartaAviso> {
  const supabase = await createClient();
  const res = await generarYSubirCartaAviso(supabase, gestionId, parametros);
  if (res.ok) revalidatePath("/finiquitos");
  return res;
}

export type ResumenCalculo = {
  total: number;
  remuneracionPendiente: number;
  indemAviso: number;
  indemAnios: number;
  vacacionesMonto: number;
  vacacionesDias: number;
  descuentoAfc: number;
  baseIndemnizatoria: number;
  aniosComputables: number;
  ufValor: number | null;
  periodoUf: string | null;
};

/**
 * Elimina definitivamente una solicitud de finiquito. La política RLS solo
 * permite DELETE a administradores; para operadores no borra ninguna fila y
 * se informa. El trigger de auditoría registra la eliminación en audit_log.
 */
export async function eliminarSolicitudFiniquito(
  gestionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("solicitudes_rrhh")
    .delete()
    .eq("id", gestionId)
    .eq("tipo", "finiquito")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "No se pudo eliminar: la solicitud no existe o tu cuenta no tiene permisos de administrador.",
    };
  }

  revalidatePath("/finiquitos");
  return { ok: true };
}

/**
 * Persiste el cálculo dentro de `datos.calculo_finiquito` de la solicitud,
 * sin tocar el resto de los campos que mandó el cliente. La auditoría queda
 * en `audit_log` vía trigger.
 */
export async function guardarCalculoFiniquito(
  gestionId: string,
  entrada: EntradaFiniquito,
  resumen: ResumenCalculo,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: gestion, error: errSel } = await supabase
    .from("solicitudes_rrhh")
    .select("id, tipo, datos")
    .eq("id", gestionId)
    .maybeSingle();
  if (errSel) return { ok: false, error: errSel.message };
  if (!gestion) return { ok: false, error: "No se encontró la solicitud." };
  if (gestion.tipo !== "finiquito") {
    return { ok: false, error: "La solicitud no es de tipo finiquito." };
  }

  const datos = (gestion.datos ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("solicitudes_rrhh")
    .update({
      datos: {
        ...datos,
        calculo_finiquito: {
          entrada,
          resumen,
          calculado_en: new Date().toISOString(),
        },
      },
    })
    .eq("id", gestionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/finiquitos");
  return { ok: true };
}
