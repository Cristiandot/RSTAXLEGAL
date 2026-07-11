"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Tablas que aceptan asignación desde la bandeja del inicio (whitelist). */
const TABLAS_GESTION = new Set([
  "solicitudes_rrhh",
  "contratos",
  "licencias_medicas",
  "solicitudes_documento",
  "tareas_oficina",
]);

const CANALES = new Set(["dashboard", "correo", "wati", "telefono", "otro"]);

/**
 * Crea una tarea manual desde el botón "+" de la bandeja: requerimientos que
 * llegan por fuera del portal (correo, Wati, teléfono o creados a mano).
 */
export async function crearTarea(input: {
  titulo: string;
  detalle: string | null;
  clienteId: string | null;
  canal: string;
  plazo: string | null;
  responsableId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.titulo.trim()) return { ok: false, error: "Escribe el título de la tarea." };
  if (!CANALES.has(input.canal)) return { ok: false, error: "Canal no válido." };
  if (input.plazo && !/^\d{4}-\d{2}-\d{2}$/.test(input.plazo)) {
    return { ok: false, error: "Plazo de entrega inválido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let creadoPor: string | null = null;
  if (user?.email) {
    const { data: u } = await supabase
      .from("usuarios")
      .select("id")
      .eq("correo", user.email.toLowerCase())
      .maybeSingle();
    creadoPor = u?.id ?? null;
  }

  const { error } = await supabase.from("tareas_oficina").insert({
    titulo: input.titulo.trim(),
    detalle: input.detalle?.trim() || null,
    cliente_id: input.clienteId,
    canal: input.canal,
    plazo: input.plazo,
    responsable_id: input.responsableId,
    asignado_at: input.responsableId ? new Date().toISOString() : null,
    creado_por: creadoPor,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Marca una tarea manual como terminada (o la reabre). */
export async function completarTarea(
  tareaId: string,
  terminada: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tareas_oficina")
    .update({ estado: terminada ? "terminada" : "pendiente" })
    .eq("id", tareaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Asigna (o desasigna con null) una gestión a un usuario del equipo, desde la
 * bandeja de Inicio y requerimientos. Estampa la fecha de asignación y
 * revalida el layout completo para refrescar el contador del sidebar.
 */
export async function asignarGestion(
  fuente: string,
  gestionId: string,
  responsableId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!TABLAS_GESTION.has(fuente)) {
    return { ok: false, error: "Tipo de gestión no permitido" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from(fuente)
    .update({
      responsable_id: responsableId,
      asignado_at: responsableId ? new Date().toISOString() : null,
    })
    .eq("id", gestionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
