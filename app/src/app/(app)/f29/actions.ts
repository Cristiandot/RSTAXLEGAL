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
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/f29");
  return { ok: true };
}
