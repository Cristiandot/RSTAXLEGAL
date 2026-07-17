"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda la respuesta del contador a una pregunta de revisión del Libro
 * Mayor. `respuesta` viene de las opciones del desplegable (incluye siempre
 * "No aplica"); `comentario` es texto libre opcional. Pasar respuesta vacía
 * vuelve la pregunta a pendiente.
 */
export async function responderPreguntaLM(
  id: string,
  respuesta: string,
  comentario: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let usuarioId: string | null = null;
  if (user?.email) {
    const { data } = await supabase
      .from("usuarios")
      .select("id")
      .eq("correo", user.email.toLowerCase())
      .eq("activo", true)
      .maybeSingle();
    usuarioId = data?.id ?? null;
  }

  const limpia = respuesta.trim();
  const { error } = await supabase
    .from("libro_mayor_pregunta")
    .update(
      limpia === ""
        ? { respuesta: null, comentario: comentario.trim() || null, respondido_por: null, respondido_at: null }
        : {
            respuesta: limpia,
            comentario: comentario.trim() || null,
            respondido_por: usuarioId,
            respondido_at: new Date().toISOString(),
          },
    )
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/contabilidad", "layout");
  return { ok: true };
}
