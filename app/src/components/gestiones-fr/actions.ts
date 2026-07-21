"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  AdItem,
  CarteraItem,
  Causa,
  Contacto,
  Cotizacion,
  DatosGerencia,
  DeudaCliente,
  EmisionItem,
  GestionLegal,
  HitoGerencia,
  LinkPlan,
  MetaCategoria,
  Pendiente,
  Posicion,
  PuntoCrecimiento,
  Requerimiento,
} from "./tipos";

type Resultado = { ok: boolean; error?: string };

/** Usuario Felipe Rodríguez (dueño de este panel), para filtrar sus requerimientos. */
const FELIPE_ID = "a93e8f17-7f21-418a-9895-c612aa02dd0c";

/** Carga todo el módulo de una vez (se llama al desbloquear la sección). */
export async function cargarGestionesFR(): Promise<{
  ok: boolean;
  error?: string;
  causas: Causa[];
  contactos: Contacto[];
  cotizaciones: Cotizacion[];
  gestiones: GestionLegal[];
  pendientes: Pendiente[];
  requerimientos: Requerimiento[];
}> {
  const supabase = await createClient();
  const vacio = { causas: [], contactos: [], cotizaciones: [], gestiones: [], pendientes: [], requerimientos: [] };
  const [causasRes, contactosRes, cotizRes, gestionesRes, pendientesRes, requerimientosRes] =
    await Promise.all([
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
      supabase.from("gestion_cotizaciones_rs").select("*").order("numero", { ascending: false }),
      supabase
        .from("gestion_legal_rs")
        .select("*, hitos:gestion_legal_hitos(id, gestion_id, fecha, detalle)")
        .order("created_at", { ascending: true }),
      supabase
        .from("pendientes_fr")
        .select("*, hitos:pendientes_fr_hitos(id, pendiente_id, fecha, detalle)")
        .order("created_at", { ascending: true }),
      supabase
        .from("tareas_oficina")
        .select("id, titulo, detalle, canal, plazo, estado")
        .eq("responsable_id", FELIPE_ID)
        .eq("estado", "pendiente")
        .order("plazo", { ascending: true, nullsFirst: false }),
    ]);

  const error =
    causasRes.error?.message ??
    contactosRes.error?.message ??
    cotizRes.error?.message ??
    gestionesRes.error?.message ??
    pendientesRes.error?.message ??
    requerimientosRes.error?.message;
  if (error) return { ok: false, error, ...vacio };

  return {
    ok: true,
    causas: (causasRes.data ?? []) as Causa[],
    contactos: (contactosRes.data ?? []) as Contacto[],
    cotizaciones: (cotizRes.data ?? []) as Cotizacion[],
    gestiones: (gestionesRes.data ?? []) as GestionLegal[],
    pendientes: (pendientesRes.data ?? []) as Pendiente[],
    requerimientos: (requerimientosRes.data ?? []) as Requerimiento[],
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

// ===================== Gestiones legales =====================

export async function crearGestion(input: {
  titulo: string;
  tipo: string | null;
  cliente: string | null;
  contraparte: string | null;
  estado: string;
  proxima_gestion_fecha: string | null;
  proxima_gestion_detalle: string | null;
  carpeta_sharepoint: string | null;
  notas: string | null;
}): Promise<Resultado> {
  if (!input.titulo.trim()) return { ok: false, error: "El título es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_legal_rs").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarGestion(
  id: string,
  patch: Partial<
    Pick<
      GestionLegal,
      | "titulo"
      | "tipo"
      | "cliente"
      | "contraparte"
      | "estado"
      | "proxima_gestion_fecha"
      | "proxima_gestion_detalle"
      | "carpeta_sharepoint"
      | "notas"
    >
  >,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gestion_legal_rs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function agregarHitoGestion(
  gestionId: string,
  fecha: string,
  detalle: string,
): Promise<Resultado> {
  if (!fecha || !detalle.trim())
    return { ok: false, error: "Fecha y detalle son obligatorios." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("gestion_legal_hitos")
    .insert({ gestion_id: gestionId, fecha, detalle: detalle.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function editarHitoGestion(
  id: string,
  patch: { fecha?: string; detalle?: string },
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_legal_hitos").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarHitoGestion(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gestion_legal_hitos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ===================== Pendientes =====================

export async function crearPendiente(input: {
  titulo: string;
  detalle: string | null;
  area: string;
  fecha: string | null;
}): Promise<Resultado> {
  if (!input.titulo.trim()) return { ok: false, error: "El título es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("pendientes_fr").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarPendiente(
  id: string,
  patch: Partial<Pick<Pendiente, "titulo" | "detalle" | "area" | "fecha">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pendientes_fr")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function agregarHitoPendiente(
  pendienteId: string,
  fecha: string,
  detalle: string,
): Promise<Resultado> {
  if (!fecha || !detalle.trim())
    return { ok: false, error: "Fecha y detalle son obligatorios." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("pendientes_fr_hitos")
    .insert({ pendiente_id: pendienteId, fecha, detalle: detalle.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function editarHitoPendiente(
  id: string,
  patch: { fecha?: string; detalle?: string },
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("pendientes_fr_hitos").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarHitoPendiente(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("pendientes_fr_hitos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function togglePendiente(id: string, hecho: boolean): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pendientes_fr")
    .update({ hecho, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function eliminarPendiente(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("pendientes_fr").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Cierra un requerimiento de la bandeja común (tareas_oficina) desde Pendientes.
 *  Mismo mecanismo que la bandeja: estado='terminada' (el trigger estampa resuelto_at),
 *  por lo que también queda cerrado allá. */
export async function terminarRequerimiento(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tareas_oficina")
    .update({ estado: "terminada" })
    .eq("id", id);
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

// ===================== Gerencia =====================

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Carga el módulo Gerencia completo. La serie de crecimiento mezcla el real
 *  histórico sembrado del Excel (2025) con el neto en vivo de la grilla de
 *  facturación (v_gerencia_facturacion_mensual, desde 2026-01). */
export async function cargarGerencia(): Promise<
  { ok: true; datos: DatosGerencia } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const [cartera, metas, hitos, crecimiento, facturacion, posiciones, ads, deudas, links, emision, indicadores] =
    await Promise.all([
      supabase.from("gerencia_cartera").select("*").eq("activo", true)
        .order("categoria").order("valor", { ascending: false }),
      supabase.from("gerencia_metas_categoria").select("*").order("orden"),
      supabase.from("gerencia_hitos").select("*").order("orden"),
      supabase.from("gerencia_crecimiento").select("*").order("mes"),
      supabase.from("v_gerencia_facturacion_mensual").select("*"),
      supabase.from("gerencia_posiciones").select("*").order("primera_cuota"),
      supabase.from("gerencia_ads").select("*").order("fecha", { ascending: false }),
      supabase.from("gerencia_deudas_clientes").select("*").order("created_at"),
      supabase.from("gerencia_links_planes").select("*").order("orden"),
      supabase.from("gerencia_emision").select("*").eq("activo", true)
        .order("valor").order("cliente"),
      supabase.from("indicadores_previred").select("periodo, uf_ultimo_dia")
        .order("periodo", { ascending: false }).limit(1),
    ]);

  const error =
    cartera.error?.message ?? metas.error?.message ?? hitos.error?.message ??
    crecimiento.error?.message ?? facturacion.error?.message ?? posiciones.error?.message ??
    ads.error?.message ?? deudas.error?.message ?? links.error?.message ?? emision.error?.message;
  if (error) return { ok: false, error };

  const netoPorMes = new Map<string, { neto: number; pendiente: number }>();
  for (const f of facturacion.data ?? []) {
    netoPorMes.set(f.periodo as string, {
      neto: num(f.monto_neto),
      pendiente: num(f.monto_pendiente),
    });
  }

  const mesActual = new Date().toISOString().slice(0, 7);
  const PANEL_DESDE = "2026-01"; // antes de esto la grilla de facturación no tiene documentos
  const serie: PuntoCrecimiento[] = (crecimiento.data ?? []).map((r) => {
    const mes = (r.mes as string).slice(0, 7);
    const enVivo = mes >= PANEL_DESDE;
    const vivo = netoPorMes.get(mes);
    const realVivo = enVivo && mes <= mesActual && vivo ? vivo.neto : null;
    const realManual = numONull(r.real_manual);
    return {
      mes,
      meta: num(r.meta_monto),
      real: realManual ?? realVivo,
      realVivo,
      realManual,
      uf: numONull(r.uf_valor),
      enVivo,
    };
  });

  const ufIndicadores = numONull(indicadores.data?.[0]?.uf_ultimo_dia);
  const ufActual =
    ufIndicadores ?? serie.find((p) => p.mes === mesActual)?.uf ?? 40823;

  return {
    ok: true,
    datos: {
      cartera: (cartera.data ?? []).map((c) => ({
        ...c,
        uf: numONull(c.uf),
        valor: num(c.valor),
      })) as CarteraItem[],
      metasCategoria: (metas.data ?? []).map((m) => ({
        ...m,
        rango_uf: num(m.rango_uf),
      })) as MetaCategoria[],
      hitos: (hitos.data ?? []).map((h) => ({
        ...h,
        uf_objetivo: numONull(h.uf_objetivo),
      })) as HitoGerencia[],
      crecimiento: serie,
      posiciones: (posiciones.data ?? []).map((p) => ({
        ...p,
        monto_total: num(p.monto_total),
        capital_cuota: numONull(p.capital_cuota),
        interes_cuota: numONull(p.interes_cuota),
        valor_cuota: num(p.valor_cuota),
      })) as Posicion[],
      ads: (ads.data ?? []).map((a) => ({ ...a, monto: num(a.monto) })) as AdItem[],
      deudas: (deudas.data ?? []).map((d) => ({ ...d, monto: num(d.monto) })) as DeudaCliente[],
      links: (links.data ?? []) as LinkPlan[],
      emision: (emision.data ?? []).map((e) => ({ ...e, valor: num(e.valor) })) as EmisionItem[],
      ufActual,
      pendienteMes: netoPorMes.get(mesActual)?.pendiente ?? 0,
    },
  };
}

/** Edita un mes del plan de crecimiento (meta, real manual u UF). El mes es YYYY-MM. */
export async function actualizarCrecimientoMes(
  mes: string,
  patch: { meta_monto?: number; real_manual?: number | null; uf_valor?: number | null },
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gerencia_crecimiento")
    .update(patch)
    .eq("mes", `${mes}-01`);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function crearEmisionItem(input: {
  periodo: string;
  cliente: string;
  rut: string | null;
  valor: number;
  observaciones: string | null;
}): Promise<Resultado> {
  if (!input.cliente.trim()) return { ok: false, error: "El cliente es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_emision").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarEmisionItem(
  id: string,
  patch: Partial<Pick<EmisionItem, "cliente" | "rut" | "valor" | "observaciones" | "emitida" | "activo">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_emision").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Copia la nómina de un período a otro (sin marcar emitidas). No duplica: si el
 *  destino ya tiene filas activas con el mismo cliente, esas se saltan. */
export async function copiarEmisionMes(
  desde: string,
  hacia: string,
): Promise<Resultado & { copiadas?: number }> {
  if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(hacia) || desde === hacia)
    return { ok: false, error: "Períodos inválidos." };
  const supabase = await createClient();
  const [origen, destino] = await Promise.all([
    supabase.from("gerencia_emision").select("cliente, rut, valor, observaciones")
      .eq("periodo", desde).eq("activo", true),
    supabase.from("gerencia_emision").select("cliente").eq("periodo", hacia).eq("activo", true),
  ]);
  if (origen.error) return { ok: false, error: origen.error.message };
  if (destino.error) return { ok: false, error: destino.error.message };
  const yaExisten = new Set((destino.data ?? []).map((d) => d.cliente.trim().toLowerCase()));
  const nuevas = (origen.data ?? [])
    .filter((o) => !yaExisten.has(o.cliente.trim().toLowerCase()))
    .map((o) => ({ ...o, periodo: hacia }));
  if (nuevas.length === 0)
    return { ok: false, error: "No hay filas nuevas que copiar (¿ya estaba copiado el mes?)." };
  const { error } = await supabase.from("gerencia_emision").insert(nuevas);
  return error ? { ok: false, error: error.message } : { ok: true, copiadas: nuevas.length };
}

export async function crearCarteraItem(input: {
  codigo: string | null;
  cliente: string;
  modalidad: string | null;
  categoria: string;
  uf: number | null;
  valor: number;
  es_prospecto: boolean;
}): Promise<Resultado> {
  if (!input.cliente.trim()) return { ok: false, error: "El cliente es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_cartera").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarCarteraItem(
  id: string,
  patch: Partial<
    Pick<CarteraItem, "codigo" | "categoria" | "modalidad" | "uf" | "valor" | "es_prospecto" | "activo" | "notas">
  >,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_cartera").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarMetaCategoria(
  categoria: string,
  patch: Partial<Pick<MetaCategoria, "rango_uf" | "objetivo_cantidad">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gerencia_metas_categoria")
    .update(patch)
    .eq("categoria", categoria);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function crearPosicion(input: {
  financista: string;
  monto_total: number;
  valor_cuota: number;
  num_cuotas: number;
  primera_cuota: string;
  capital_cuota: number | null;
  interes_cuota: number | null;
  observaciones: string | null;
}): Promise<Resultado> {
  if (!input.financista.trim()) return { ok: false, error: "El financista es obligatorio." };
  if (!input.primera_cuota) return { ok: false, error: "La fecha de la primera cuota es obligatoria." };
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_posiciones").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarPosicion(
  id: string,
  patch: Partial<Pick<Posicion, "cuotas_pagadas" | "estado" | "observaciones">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_posiciones").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function crearAd(input: {
  tipo: "gasto" | "conversion";
  fecha: string;
  detalle: string;
  monto: number;
  categoria: string | null;
}): Promise<Resultado> {
  if (!input.detalle.trim()) return { ok: false, error: "El detalle es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_ads").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function crearDeudaCliente(input: {
  cliente: string;
  monto: number;
  motivo: string | null;
}): Promise<Resultado> {
  if (!input.cliente.trim()) return { ok: false, error: "El cliente es obligatorio." };
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_deudas_clientes").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function actualizarDeudaCliente(
  id: string,
  patch: Partial<Pick<DeudaCliente, "status" | "monto" | "motivo">>,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("gerencia_deudas_clientes").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function crearLinkPlan(input: {
  nombre: string;
  monto: string | null;
  observaciones: string | null;
  link: string;
}): Promise<Resultado> {
  if (!input.nombre.trim() || !input.link.trim())
    return { ok: false, error: "Nombre y link son obligatorios." };
  const supabase = await createClient();
  const { data: ultimo } = await supabase
    .from("gerencia_links_planes")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1);
  const orden = (ultimo?.[0]?.orden ?? 0) + 1;
  const { error } = await supabase.from("gerencia_links_planes").insert({ ...input, orden });
  return error ? { ok: false, error: error.message } : { ok: true };
}
