"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Guarda los favoritos del sidebar del usuario autenticado.
 *
 * Escribe SOLO la columna `favoritos` de su propia fila en `usuarios`,
 * resolviendo el correo desde la sesión del servidor (nunca desde el cliente).
 * Usa el cliente service-role porque el RLS de `usuarios` restringe UPDATE a
 * administradores; acá el alcance queda acotado al correo autenticado y a esa
 * única columna.
 */
export async function guardarFavoritos(
  favoritos: string[]
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false };

  // Sanea: strings no vacíos, sin duplicados, tope defensivo.
  const limpio = Array.from(
    new Set(
      (favoritos ?? []).filter((k) => typeof k === "string" && k.length > 0)
    )
  ).slice(0, 12);

  const service = createServiceClient();
  const { error } = await service
    .from("usuarios")
    .update({ favoritos: limpio })
    .eq("correo", user.email.toLowerCase());

  if (error) return { ok: false };

  revalidatePath("/", "layout");
  return { ok: true };
}
