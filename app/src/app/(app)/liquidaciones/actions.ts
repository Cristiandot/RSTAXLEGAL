"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GuardarLiquidacionInput = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  modalidad: string;
  fechaConsulta: string | null;
  fechaDetalle: string | null;
  fechaLiquidaciones: string | null;
  fechaPrevired: string | null;
  fechaPreviredListoPago: string | null;
  fechaPreviredPagado: string | null;
  monto: string | null;
  observaciones: string | null;
  origResponsableDefaultId: string | null;
  origModalidad: string | null;
};

/**
 * Actualiza el ciclo de liquidaciones y, si cambió, hereda responsable y
 * modalidad al cliente (igual que liquidaciones.html). Auditoría y updated_at
 * los maneja Postgres por trigger; no se tocan acá.
 */
export async function guardarLiquidacion(
  input: GuardarLiquidacionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error: errCiclo } = await supabase
    .from("ciclo_liquidaciones")
    .update({
      responsable_id: input.responsableId,
      fecha_consulta_enviada: input.fechaConsulta,
      fecha_detalle_recibido: input.fechaDetalle,
      fecha_liquidaciones_enviadas: input.fechaLiquidaciones,
      fecha_previred_presentada: input.fechaPrevired,
      fecha_previred_listo_pago: input.fechaPreviredListoPago,
      fecha_previred_pagado: input.fechaPreviredPagado,
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
