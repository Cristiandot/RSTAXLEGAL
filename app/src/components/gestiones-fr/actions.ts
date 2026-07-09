"use server";

import { createClient } from "@/lib/supabase/server";
import type { Causa, Contacto, Cotizacion } from "./tipos";

type Resultado = { ok: boolean; error?: string };

/** Carga todo el módulo de una vez (se llama al desbloquear la sección). */
export async function cargarGestionesFR(): Promise<{
  ok: boolean;
  error?: string;
  causas: Causa[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
}> {
  const supabase = await createClient();
  const [causasRes, contactosRes, cotizRes] = await Promise.all([
    supabase
      .from("gestion_causas_rs")
      .select("*, hitos:gestion_causas_hitos(id, causa_id, fecha, detalle)")
      .order("created_at", { ascending: true }),
    supabase
      .from("contactos")
      .select(
        "id, nombre, segmento, empresa_rubro, medio_preferido, contacto, referido_por, estado, fecha_proxima_accion, notas",
      )
      .order("nombre", { ascending: true }),
    supabase
      .from("gestion_cotizaciones_rs")
      .select("*")
      .order("numero", { ascending: false }),
  ]);

  const error =
    causasRes.error?.message ?? contactosRes.error?.message ?? cotizRes.error?.message;
  if (error) return { ok: false, error, causas: [], contactos: [], cotizaciones: [] };

  return {
    ok: true,
    causas: (causasRes.data ?? []) as Causa[],
    contactos: (contactosRes.data ?? []) as Contacto[],
    cotizaciones: (cotizRes.data ?? []) as Cotizacion[],
  };
}

// ===================== Causas =====================

export async function crearCausa(input: {
  caratula: string;
  cliente: string | null;
  calidad: string | null;
  materia: string | null;
  tribunal: string | null;
  rit_rol: string | null;
  estado: string;
  proxima_gestion_fecha: string | null;
  proxima_gestion_detalle: string | null;
  plazo_fatal: string | null;
  carpeta_sharepoint: string | null;
}): Promise<Resultado> {
  if (!input.caratula.trim()) return { ok: false, error: "La carátula es obligatoria." };
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_causas_rs").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarCausa(
  id: string,
  patch: Partial<
    Pick<
      Causa,
      | "estado"
      | "proxima_gestion_fecha"
      | "proxima_gestion_detalle"
      | "proxima_audiencia_fecha"
      | "proxima_audiencia_tipo"
      | "plazo_fatal"
      | "plazo_fatal_detalle"
    >
  >,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_causas_rs").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Agenda una audiencia o gestión: actualiza la causa y deja constancia en la bitácora. */
export async function agendarEnCausa(
  causaId: string,
  input: { tipo: "audiencia" | "gestion"; fecha: string; detalle: string },
): Promise<Resultado> {
  if (!input.fecha || !input.detalle.trim())
    return { ok: false, error: "Fecha y detalle son obligatorios." };
  const supabase = await createClient();

  const patch =
    input.tipo === "audiencia"
      ? { proxima_audiencia_fecha: input.fecha, proxima_audiencia_tipo: input.detalle }
      : { proxima_gestion_fecha: input.fecha, proxima_gestion_detalle: input.detalle };
  const { error } = await supabase
    .from("gestion_causas_rs")
    .update(patch)
    .eq("id", causaId);
  if (error) return { ok: false, error: error.message };

  const { error: errHito } = await supabase.from("gestion_causas_hitos").insert({
    causa_id: causaId,
    fecha: input.fecha,
    detalle: `Agendado (${input.tipo === "audiencia" ? "audiencia" : "gestion"}): ${input.detalle}`,
  });
  return errHito ? { ok: false, error: errHito.message } : { ok: true };
}

export async function agregarHito(
  causaId: string,
  fecha: string,
  detalle: string,
): Promise<Resultado> {
  if (!fecha || !detalle.trim())
    return { ok: false, error: "Fecha y detalle son obligatorios." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("gestion_causas_hitos")
    .insert({ causa_id: causaId, fecha, detalle: detalle.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ===================== Prospección =====================

export async function crearContacto(input: {
  nombre: string;
  segmento: string;
  empresa_rubro: string | null;
  medio_preferido: string | null;
  contacto: string | null;
  referido_por: string | null;
  estado: string;
  fecha_proxima_accion: string | null;
  notas: string | null;
}): Promise<Resultado> {
  if (!input.nombre.trim()) return { ok: false, error: "El nombre es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("contactos").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarContacto(
  id: number,
  patch: Partial<Pick<Contacto, "estado" | "fecha_proxima_accion" | "notas">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contactos")
    .update({ ...patch, actualizado_en: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ===================== Cotizaciones =====================

/** Correlativo AAAA-NNN: toma el mayor NNN registrado del año y suma 1. */
export async function crearCotizacion(input: {
  destinatario: string;
  tier: string | null;
  monto: string | null;
  proxima_accion_fecha: string | null;
  proxima_accion_detalle: string | null;
}): Promise<Resultado & { numero?: string }> {
  if (!input.destinatario.trim())
    return { ok: false, error: "El destinatario es obligatorio." };
  const supabase = await createClient();

  const anio = new Date().getFullYear();
  const { data: ultimas } = await supabase
    .from("gestion_cotizaciones_rs")
    .select("numero")
    .like("numero", `${anio}-%`)
    .order("numero", { ascending: false })
    .limit(1);
  const ultimoN = ultimas?.[0]
    ? parseInt(ultimas[0].numero.split("-")[1], 10)
    : 33; // el correlativo 2026 partió avanzado a propósito
  const numero = `${anio}-${String(ultimoN + 1).padStart(3, "0")}`;

  const { error } = await supabase.from("gestion_cotizaciones_rs").insert({
    ...input,
    numero,
    estado: "Emitida",
    fecha_emision: new Date().toISOString().slice(0, 10),
  });
  return error ? { ok: false, error: error.message } : { ok: true, numero };
}

export async function actualizarCotizacion(
  id: string,
  patch: Partial<
    Pick<Cotizacion, "estado" | "proxima_accion_fecha" | "proxima_accion_detalle">
  >,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gestion_cotizaciones_rs")
    .update(patch)
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
