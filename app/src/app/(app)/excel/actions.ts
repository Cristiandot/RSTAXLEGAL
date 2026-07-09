"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_NOVEDAD } from "@/lib/novedades";

export type NovedadInternaInput = {
  cliente_id: string;
  trabajador_id: string;
  periodo: string;
  tipo: string;
  fecha: string;
  fecha_hasta: string;
  cantidad: string;
  monto: string;
  comentario: string;
};

/** El equipo agrega una novedad por dentro (origen 'equipo'). */
export async function agregarNovedadInterna(
  n: NovedadInternaInput,
): Promise<{ ok: boolean; error?: string }> {
  const def = TIPOS_NOVEDAD.find((t) => t.value === n.tipo);
  if (!def) return { ok: false, error: "Tipo de novedad no válido." };
  if (!n.trabajador_id) return { ok: false, error: "Selecciona al trabajador." };
  if (def.campos === "horas" && (!n.fecha || !n.cantidad || Number(n.cantidad) <= 0)) {
    return { ok: false, error: "Indica fecha y horas (mayor a 0)." };
  }
  if (def.campos === "rango" && (!n.fecha || !n.fecha_hasta || n.fecha_hasta < n.fecha)) {
    return { ok: false, error: "Indica un rango de fechas válido." };
  }
  if (def.campos === "monto" && (!n.monto || Number(n.monto) <= 0)) {
    return { ok: false, error: "Indica el monto en pesos (mayor a 0)." };
  }
  if (def.requiereRima && (!n.monto || Number(n.monto) <= 0)) {
    return { ok: false, error: "Indica la RIMA: renta imponible del trabajador en el mes ANTERIOR al inicio de la licencia (obligatoria para Previred)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("novedades_remuneraciones").insert({
    cliente_id: n.cliente_id,
    trabajador_id: n.trabajador_id,
    periodo: n.periodo,
    tipo: n.tipo,
    fecha: n.fecha || null,
    fecha_hasta: def.campos === "rango" ? n.fecha_hasta || null : null,
    cantidad: def.campos === "horas" ? Number(n.cantidad) : null,
    monto: def.campos === "monto" || def.requiereRima ? Number(n.monto) : null,
    comentario: n.comentario || null,
    origen: "equipo",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/excel");
  return { ok: true };
}

export async function eliminarNovedadInterna(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("novedades_remuneraciones")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/excel");
  return { ok: true };
}

/** Cierra o reabre el período de un cliente (el equipo puede revertir cierres). */
export async function cambiarEstadoPeriodo(
  clienteId: string,
  periodo: string,
  estado: "abierto" | "cerrado",
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{4}-\d{2}$/.test(periodo)) return { ok: false, error: "Período inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("periodos_remuneraciones").upsert(
    {
      cliente_id: clienteId,
      periodo,
      estado,
      cerrado_at: estado === "cerrado" ? new Date().toISOString() : null,
    },
    { onConflict: "cliente_id,periodo" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/excel");
  return { ok: true };
}
