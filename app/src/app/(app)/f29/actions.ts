"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GuardarF29Input = {
  cicloId: string;
  responsableId: string | null;
  fechaArmado: string | null;
  fechaPresentado: string | null;
  monto: string | null;
  folio: string | null;
  pagoPor: string | null;
  observaciones: string | null;
};

/**
 * Actualiza el ciclo F29. NO hereda responsable al cliente: el responsable de
 * F29 es independiente del de Previred (decisión explícita del proyecto).
 */
export async function guardarF29(
  input: GuardarF29Input,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ciclo_f29")
    .update({
      responsable_id: input.responsableId,
      fecha_f29_armado: input.fechaArmado,
      fecha_f29_presentado: input.fechaPresentado,
      monto_a_pagar: input.monto,
      folio_f29: input.folio,
      pago_por: input.pagoPor,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/f29");
  return { ok: true };
}

/** Columnas-fecha permitidas para los pasos marcables con checkbox inline. */
const COLUMNAS_PASO_F29 = new Set(["fecha_f29_armado", "fecha_f29_presentado"]);

/**
 * Marca/desmarca un paso del F29 desde el checkbox de la tabla (mismo patrón
 * que Liquidaciones): al marcar estampa la fecha de hoy; al desmarcar, null.
 * El estado lo recalcula la vista.
 */
export async function marcarPasoF29(
  cicloId: string,
  columna: string,
  hecho: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!COLUMNAS_PASO_F29.has(columna)) {
    return { ok: false, error: "Columna no permitida" };
  }
  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ciclo_f29")
    .update({ [columna]: hecho ? hoy : null })
    .eq("id", cicloId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/f29");
  return { ok: true };
}

/**
 * Edición rápida inline de quién paga el F29 y el monto, sin abrir el modal.
 */
export async function actualizarPagoF29(
  cicloId: string,
  patch: { pagoPor?: string | null; monto?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const cambios: Record<string, unknown> = {};
  if ("pagoPor" in patch) {
    if (patch.pagoPor !== null && patch.pagoPor !== "rs" && patch.pagoPor !== "cliente") {
      return { ok: false, error: "Pagador no válido" };
    }
    cambios.pago_por = patch.pagoPor;
  }
  if ("monto" in patch) {
    cambios.monto_a_pagar = patch.monto === null || patch.monto === "" ? null : patch.monto;
  }
  if (Object.keys(cambios).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("ciclo_f29").update(cambios).eq("id", cicloId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/f29");
  return { ok: true };
}
