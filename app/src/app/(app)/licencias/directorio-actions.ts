"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ContactoInput = {
  id?: string | null;
  institucion: string;
  area: string;
  telefono: string;
  correo: string;
  notas: string;
};

/** Crea o actualiza un contacto del directorio de instituciones. */
export async function guardarContactoInstitucion(
  c: ContactoInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!c.institucion.trim()) {
    return { ok: false, error: "Indica la institución." };
  }
  if (!c.telefono.trim() && !c.correo.trim()) {
    return { ok: false, error: "Indica al menos un teléfono o un correo." };
  }
  const supabase = await createClient();
  const fila = {
    institucion: c.institucion.trim(),
    area: c.area.trim() || null,
    telefono: c.telefono.trim() || null,
    correo: c.correo.trim() || null,
    notas: c.notas.trim() || null,
  };
  const { error } = c.id
    ? await supabase.from("contactos_instituciones").update(fila).eq("id", c.id)
    : await supabase.from("contactos_instituciones").insert(fila);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/licencias");
  return { ok: true };
}

/** Elimina un contacto del directorio. */
export async function eliminarContactoInstitucion(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contactos_instituciones")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/licencias");
  return { ok: true };
}
