"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GuardarLiquidacionInput = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  modalidad: string;
  fechaPreviredListoPago: string | null;
  fechaPreviredPagado: string | null;
  fechaDnpDeclarado: string | null;
  monto: string | null;
  observaciones: string | null;
  origResponsableDefaultId: string | null;
  origModalidad: string | null;
};

/**
 * Guarda los campos del modal: responsable, modalidad, fechas de pago y monto.
 * Los pasos 1-3 (consulta/detalle/liquidaciones) se marcan con checkbox inline
 * vía `marcarPaso`, no acá. Hereda responsable/modalidad al cliente si cambian.
 */
export async function guardarLiquidacion(
  input: GuardarLiquidacionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error: errCiclo } = await supabase
    .from("ciclo_liquidaciones")
    .update({
      responsable_id: input.responsableId,
      fecha_previred_listo_pago: input.fechaPreviredListoPago,
      fecha_previred_pagado: input.fechaPreviredPagado,
      fecha_dnp_declarado: input.fechaDnpDeclarado,
      monto_previred_total: input.monto,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (errCiclo) return { ok: false, error: errCiclo.message };

  const patchCliente: Record<string, unknown> = {};
  if (
    input.responsableId !== null &&
    input.responsableId !== input.origResponsableDefaultId
  ) {
    patchCliente.responsable_default_id = input.responsableId;
  }
  if (input.modalidad !== input.origModalidad) {
    patchCliente.modalidad_previred = input.modalidad;
  }

  if (Object.keys(patchCliente).length > 0) {
    const { error: errCli } = await supabase
      .from("clientes")
      .update(patchCliente)
      .eq("id", input.clienteId);
    if (errCli) {
      return {
        ok: false,
        error: `Ciclo guardado, pero error actualizando el cliente: ${errCli.message}`,
      };
    }
  }

  revalidatePath("/liquidaciones");
  return { ok: true };
}

/** Columnas-fecha permitidas para los pasos marcables con checkbox. */
const COLUMNAS_PASO = new Set([
  "fecha_consulta_enviada",
  "fecha_detalle_recibido",
  "fecha_liquidaciones_enviadas",
]);

/**
 * Marca/desmarca un paso del ciclo (checkbox inline en la tabla). Al marcar,
 * estampa la fecha de hoy en la columna; al desmarcar, la deja en null. El
 * estado se recalcula solo en la vista.
 */
export async function marcarPaso(
  cicloId: string,
  columna: string,
  hecho: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!COLUMNAS_PASO.has(columna)) {
    return { ok: false, error: "Columna no permitida" };
  }
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ciclo_liquidaciones")
    .update({ [columna]: hecho ? hoy : null })
    .eq("id", cicloId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/liquidaciones");
  return { ok: true };
}
