"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Organismo, TipoConvenio } from "@/lib/convenios";

export type CuotaInput = {
  nCuota: number;
  monto: string | null;
  fechaVencimiento: string | null;
  fechaPago: string | null;
};

export type GuardarConvenioInput = {
  id: string | null; // null = crear
  clienteId: string;
  tipo: TipoConvenio;
  organismo: Organismo;
  folio: string | null;
  concepto: string | null;
  montoTotal: string | null;
  fechaSuscripcion: string | null;
  caido: boolean;
  observaciones: string | null;
  responsableId: string | null;
  cuotas: CuotaInput[];
  periodosF29: string[]; // 'YYYY-MM' que cubre (opcional)
};

const num = (v: string | null) => (v && v.trim() !== "" ? v.trim() : null);

/**
 * Crea o actualiza un convenio/multa junto con sus cuotas y los períodos F29
 * vinculados. Las cuotas y los vínculos se reemplazan en bloque (borrar + insertar):
 * el formulario manda el set completo, así que es más simple y consistente que
 * diferenciar altas/bajas. Todo bajo la sesión autenticada (RLS).
 */
export async function guardarConvenio(
  input: GuardarConvenioInput,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const supabase = await createClient();

  if (!input.clienteId) return { ok: false, error: "Falta la empresa." };

  const fila = {
    cliente_id: input.clienteId,
    tipo: input.tipo,
    organismo: input.organismo,
    folio: num(input.folio),
    concepto: num(input.concepto),
    monto_total: num(input.montoTotal),
    fecha_suscripcion: input.fechaSuscripcion || null,
    caido: input.caido,
    observaciones: num(input.observaciones),
    responsable_id: input.responsableId || null,
    updated_at: new Date().toISOString(),
  };

  // 1) Cabecera del convenio.
  let convenioId = input.id;
  if (convenioId) {
    const { error } = await supabase.from("convenio").update(fila).eq("id", convenioId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from("convenio").insert(fila).select("id").single();
    if (error || !data) return { ok: false, error: error?.message ?? "No se pudo crear el convenio." };
    convenioId = data.id as string;
  }

  // 2) Cuotas: reemplazo en bloque.
  await supabase.from("convenio_cuota").delete().eq("convenio_id", convenioId);
  const cuotas = input.cuotas
    .filter((c) => num(c.monto) !== null || c.fechaVencimiento || c.fechaPago)
    .map((c, i) => ({
      convenio_id: convenioId,
      n_cuota: c.nCuota || i + 1,
      monto: num(c.monto),
      fecha_vencimiento: c.fechaVencimiento || null,
      fecha_pago: c.fechaPago || null,
    }));
  if (cuotas.length) {
    const { error } = await supabase.from("convenio_cuota").insert(cuotas);
    if (error) return { ok: false, error: error.message };
  }

  // 3) Períodos F29 vinculados: reemplazo en bloque.
  await supabase.from("convenio_f29").delete().eq("convenio_id", convenioId);
  const periodos = Array.from(
    new Set(
      input.periodosF29
        .map((p) => p.trim())
        .filter((p) => /^\d{4}-\d{2}$/.test(p)),
    ),
  ).map((periodo) => ({ convenio_id: convenioId, cliente_id: input.clienteId, periodo }));
  if (periodos.length) {
    const { error } = await supabase.from("convenio_f29").insert(periodos);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/convenios");
  return { ok: true, id: convenioId };
}

/** Marca (o desmarca) una cuota como pagada. fecha=null la vuelve a pendiente. */
export async function marcarCuotaPagada(
  cuotaId: string,
  fecha: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("convenio_cuota")
    .update({ fecha_pago: fecha || null })
    .eq("id", cuotaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/convenios");
  return { ok: true };
}

/** Borra un convenio (y sus cuotas/vínculos por cascade). Solo admin (RLS). */
export async function borrarConvenio(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("convenio").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/convenios");
  return { ok: true };
}
