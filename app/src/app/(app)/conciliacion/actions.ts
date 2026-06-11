"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Id en `usuarios` del usuario autenticado (null si no se resuelve). */
async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

export type GuardarConciliacionInput = {
  cicloId: string;
  clienteId: string;
  responsableId: string | null;
  kameCierre: string | null;
  fechaCompras: string | null;
  fechaVentas: string | null;
  fechaConciliacion: string | null;
  observaciones: string | null;
};

/**
 * Guarda el ciclo de conciliación. Si se marcó el estado KAME al cierre,
 * actualiza también el estado vigente del cliente (ON/OFF es por empresa,
 * no historial mensual) con fecha y revisor.
 */
export async function guardarConciliacion(
  input: GuardarConciliacionInput,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { error: errCiclo } = await supabase
    .from("ciclo_conciliacion")
    .update({
      responsable_id: input.responsableId,
      fecha_compras_descargadas: input.fechaCompras,
      fecha_ventas_descargadas: input.fechaVentas,
      fecha_conciliacion_kame_ok: input.fechaConciliacion,
      kame_cert_estado_al_cierre: input.kameCierre,
      observaciones: input.observaciones,
    })
    .eq("id", input.cicloId);

  if (errCiclo) return { ok: false, error: errCiclo.message };

  if (input.kameCierre) {
    const revisorId = await usuarioActualId(supabase);
    const { error: errCli } = await supabase
      .from("clientes")
      .update({
        kame_cert_estado: input.kameCierre,
        kame_cert_ultima_revision: new Date().toISOString().slice(0, 10),
        kame_cert_revisado_por: revisorId,
      })
      .eq("id", input.clienteId);
    if (errCli) {
      return {
        ok: false,
        error: `Ciclo guardado, pero error actualizando KAME del cliente: ${errCli.message}`,
      };
    }
  }

  revalidatePath("/conciliacion");
  return { ok: true };
}

/**
 * Registra una ejecución de cambio IVA recuperable → no recuperable
 * (solo clientes profesionales de salud), con fecha de hoy y el usuario
 * autenticado como responsable.
 */
export async function registrarCambioIva(
  clienteId: string,
  observaciones: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const responsableId = await usuarioActualId(supabase);
  if (!responsableId) return { ok: false, error: "Usuario no autorizado" };

  const { error } = await supabase.from("iva_salud_ejecucion").insert({
    cliente_id: clienteId,
    fecha_ejecutada: new Date().toISOString().slice(0, 10),
    responsable_id: responsableId,
    observaciones: observaciones || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/conciliacion");
  return { ok: true };
}

/** Elimina un registro de cambio IVA (corrección de un registro erróneo). */
export async function eliminarCambioIva(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("iva_salud_ejecucion")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/conciliacion");
  return { ok: true };
}
