"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { calcularLiquidacion } from "@/lib/liquidacion";
import {
  armarEntrada,
  type IndicadoresRow,
  type ClienteRow,
  type TrabajadorRow,
  type ContratoRow,
  type NovedadRow,
  type ConceptoRow,
} from "@/lib/armar-liquidacion";

type Resp = { ok: boolean; error?: string };

/** Configuración previsional/laboral de la empresa (mutual, caja, sábado hábil). */
export async function guardarConfigEmpresa(
  clienteId: string,
  cfg: {
    mutual_institucion: string | null;
    mutual_tasa: number | null;
    caja_compensacion: string | null;
    sabado_habil: boolean;
  },
): Promise<Resp> {
  const supabase = await createClient();
  const { error } = await supabase.from("clientes").update(cfg).eq("id", clienteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true };
}

export type ConceptoInput = {
  id?: string | null;
  nombre: string;
  naturaleza: string;
  columna_lre: string | null;
  copia_mensual: boolean;
  proporcional: boolean;
  tributable: boolean;
  es_prestamo: boolean;
  orden: number;
};

/** Crea o actualiza un concepto de remuneración de la empresa. */
export async function guardarConcepto(clienteId: string, c: ConceptoInput): Promise<Resp> {
  const supabase = await createClient();
  if (!c.nombre.trim()) return { ok: false, error: "El concepto necesita un nombre." };
  const fila = {
    cliente_id: clienteId,
    nombre: c.nombre.trim(),
    naturaleza: c.naturaleza,
    columna_lre: c.columna_lre,
    copia_mensual: c.copia_mensual,
    proporcional: c.proporcional,
    tributable: c.tributable,
    es_prestamo: c.es_prestamo,
    orden: c.orden,
  };
  const { error } = c.id
    ? await supabase.from("concepto_remuneracion").update(fila).eq("id", c.id)
    : await supabase.from("concepto_remuneracion").insert(fila);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true };
}

export async function eliminarConcepto(clienteId: string, id: string): Promise<Resp> {
  const supabase = await createClient();
  const { error } = await supabase.from("concepto_remuneracion").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true };
}

export type FichaTrabajadorInput = {
  id?: string | null;
  nombres: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  rut: string | null;
  sexo: string | null;
  cargo: string | null;
  sucursal: string | null;
  tipo_contrato: string | null;
  tipo_trabajador: string;
  regimen_previsional: string;
  jornada_tipo: string | null;
  horas_semanales: number | null;
  afp: string | null;
  salud: string | null;
  salud_plan_valor: number | null;
  salud_plan_unidad: string | null;
  sueldo_base: number | null;
  mas_11_anios: boolean;
  cargas_simples: number;
  cargas_maternales: number;
  cargas_invalidas: number;
  tramo_asignacion: string | null;
  fecha_ingreso: string | null;
};

/** Crea o actualiza la ficha de un trabajador (tabla única `trabajadores`). */
export async function guardarFichaTrabajador(
  clienteId: string,
  t: FichaTrabajadorInput,
): Promise<Resp> {
  const supabase = await createClient();
  if (!t.nombres.trim()) return { ok: false, error: "Indica el nombre del trabajador." };
  const apellidos = [t.apellido_paterno, t.apellido_materno].filter(Boolean).join(" ").trim();
  const fila = {
    cliente_id: clienteId,
    nombres: t.nombres.trim(),
    apellidos: apellidos || t.nombres.trim(),
    apellido_paterno: t.apellido_paterno,
    apellido_materno: t.apellido_materno,
    rut: t.rut,
    sexo: t.sexo,
    cargo: t.cargo,
    sucursal: t.sucursal,
    tipo_contrato: t.tipo_contrato,
    tipo_trabajador: t.tipo_trabajador,
    regimen_previsional: t.regimen_previsional,
    jornada_tipo: t.jornada_tipo,
    horas_semanales: t.horas_semanales,
    afp: t.afp,
    salud: t.salud,
    salud_plan_valor: t.salud_plan_valor,
    salud_plan_unidad: t.salud_plan_unidad,
    sueldo_base: t.sueldo_base,
    mas_11_anios: t.mas_11_anios,
    cargas_simples: t.cargas_simples,
    cargas_maternales: t.cargas_maternales,
    cargas_invalidas: t.cargas_invalidas,
    tramo_asignacion: t.tramo_asignacion,
    fecha_ingreso: t.fecha_ingreso,
  };
  const { error } = t.id
    ? await supabase.from("trabajadores").update(fila).eq("id", t.id)
    : await supabase.from("trabajadores").insert(fila);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true };
}

/**
 * Calcula la liquidación de un trabajador en el período (leyendo ficha +
 * contrato + indicadores + novedades del cliente) y la guarda como snapshot.
 */
export async function calcularYGuardarLiquidacion(
  clienteId: string,
  trabajadorId: string,
  periodo: string,
  opts: { diasTrabajados?: number; diasDescanso?: number; kameLiquido?: number | null },
): Promise<Resp & { liquido?: number }> {
  const supabase = await createClient();
  const usuario = await getUsuarioActual().catch(() => null);
  let usuarioId: string | null = null;
  if (usuario) {
    const { data } = await supabase.from("usuarios").select("id").eq("correo", usuario.correo).maybeSingle();
    usuarioId = data?.id ?? null;
  }

  const [cliRes, indRes, trabRes, contRes, novRes, concRes] = await Promise.all([
    supabase.from("clientes").select("mutual_tasa, sabado_habil").eq("id", clienteId).maybeSingle(),
    supabase
      .from("indicadores_previred")
      .select(
        "rmi_general, utm, uf_ultimo_dia, tope_uf_afp, tope_uf_ips, tope_uf_afc, tasa_sis, tasa_seguro_social, afp, asignacion_familiar",
      )
      .eq("periodo", periodo)
      .maybeSingle(),
    supabase.from("trabajadores").select("*").eq("id", trabajadorId).maybeSingle(),
    supabase
      .from("contratos")
      .select("remuneracion, jornada, estado, created_at")
      .eq("trabajador_id", trabajadorId)
      .neq("estado", "anulado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("novedades_remuneraciones")
      .select("tipo, cantidad, monto, concepto_id")
      .eq("trabajador_id", trabajadorId)
      .eq("periodo", periodo),
    supabase
      .from("concepto_remuneracion")
      .select("id, naturaleza, proporcional, tributable, nombre")
      .eq("cliente_id", clienteId),
  ]);

  if (!indRes.data) return { ok: false, error: `No hay indicadores Previred cargados para ${periodo}. Súbelos en /indicadores.` };
  if (!trabRes.data) return { ok: false, error: "Trabajador no encontrado." };

  const entrada = armarEntrada({
    ind: indRes.data as IndicadoresRow,
    cliente: (cliRes.data ?? {}) as ClienteRow,
    trabajador: trabRes.data as TrabajadorRow,
    contrato: (contRes.data ?? null) as ContratoRow | null,
    novedades: (novRes.data ?? []) as NovedadRow[],
    conceptos: (concRes.data ?? []) as ConceptoRow[],
    diasTrabajados: opts.diasTrabajados ?? 30,
    diasDescanso: opts.diasDescanso,
  });

  const r = calcularLiquidacion(entrada);
  const kameLiquido = opts.kameLiquido ?? null;

  const fila = {
    cliente_id: clienteId,
    trabajador_id: trabajadorId,
    periodo,
    dias_trabajados: opts.diasTrabajados ?? 30,
    total_imponible: r.totalImponible,
    total_no_imponible: r.totalNoImponible,
    total_haberes: r.totalHaberes,
    total_descuentos: r.totalDescuentos,
    liquido: r.liquido,
    afp_monto: r.afpMonto,
    salud_monto: r.saludMonto,
    afc_trabajador: r.afcTrabajador,
    impuesto_unico: r.impuestoUnico,
    asignacion_familiar: r.asignacionFamiliar,
    sis_empleador: r.sisEmpleador,
    afc_empleador: r.afcEmpleador,
    mutual_empleador: r.mutualEmpleador,
    detalle: r,
    kame_liquido: kameLiquido,
    kame_cuadra: kameLiquido !== null ? kameLiquido === r.liquido : null,
    calculado_at: new Date().toISOString(),
    calculado_por: usuarioId,
  };

  const { error } = await supabase
    .from("liquidacion")
    .upsert(fila, { onConflict: "cliente_id,trabajador_id,periodo" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true, liquido: r.liquido };
}
