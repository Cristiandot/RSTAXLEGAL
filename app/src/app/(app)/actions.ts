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
 * Edita el texto (título y detalle) de una tarea/requerimiento desde la bandeja.
 * Solo aplica a `tareas_oficina` (requerimientos de correo/WhatsApp/manuales);
 * las demás fuentes traen su texto del registro de origen.
 */
export async function editarTextoTarea(
  tareaId: string,
  titulo: string,
  detalle: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!titulo.trim()) return { ok: false, error: "El título no puede quedar vacío." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("tareas_oficina")
    .update({ titulo: titulo.trim(), detalle: detalle?.trim() || null })
    .eq("id", tareaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Guarda (o actualiza) la justificación de atraso de una gestión en
 * `gestion_seguimiento`. Sirve para cualquier fuente de la bandeja. No toca
 * `resuelto_at` (lo maneja el trigger). Registra quién justificó.
 */
export async function justificarAtraso(
  fuente: string,
  gestionId: string,
  texto: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!TABLAS_GESTION.has(fuente)) {
    return { ok: false, error: "Tipo de gestión no permitido" };
  }
  const t = texto.trim();
  if (!t) return { ok: false, error: "Escribe la justificación del atraso." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let uid: string | null = null;
  if (user?.email) {
    const { data: u } = await supabase
      .from("usuarios")
      .select("id")
      .eq("correo", user.email.toLowerCase())
      .maybeSingle();
    uid = u?.id ?? null;
  }

  const { error } = await supabase.from("gestion_seguimiento").upsert(
    {
      fuente,
      gestion_id: gestionId,
      justificacion_atraso: t,
      justificado_por: uid,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fuente,gestion_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Cambia la empresa (cliente_id) de una tarea/requerimiento desde la bandeja.
 * Útil cuando la auto-identificación (correo/WhatsApp) eligió una empresa del
 * grupo distinta a la correcta. Solo aplica a `tareas_oficina`. Valida que la
 * empresa elegida pertenezca al mismo grupo (cliente) de la tarea; el grupo no
 * cambia. `clienteId` null deja la tarea sin empresa (solo a nivel cliente).
 */
export async function asignarEmpresaTarea(
  tareaId: string,
  clienteId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: tarea, error: eTarea } = await supabase
    .from("tareas_oficina")
    .select("grupo_id")
    .eq("id", tareaId)
    .maybeSingle();
  if (eTarea) return { ok: false, error: eTarea.message };
  if (!tarea) return { ok: false, error: "Tarea no encontrada" };

  if (clienteId) {
    const { data: empresa, error: eEmp } = await supabase
      .from("clientes")
      .select("grupo_id")
      .eq("id", clienteId)
      .maybeSingle();
    if (eEmp) return { ok: false, error: eEmp.message };
    if (!empresa) return { ok: false, error: "Empresa no encontrada" };
    if (tarea.grupo_id && empresa.grupo_id && empresa.grupo_id !== tarea.grupo_id) {
      return { ok: false, error: "La empresa no pertenece al cliente de la tarea." };
    }
  }

  const { error } = await supabase
    .from("tareas_oficina")
    .update({ cliente_id: clienteId })
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
