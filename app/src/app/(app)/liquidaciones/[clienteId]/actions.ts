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
import { generarPdfLiquidaciones, type DatosLiquidacionPdf } from "@/lib/liquidacion-pdf";
import { generarNominaPrevired, type DatosPreviredTrabajador } from "@/lib/previred-nomina";
import { etiquetaPeriodo } from "@/lib/periodos";

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

/** Marca si un concepto se considera (o no) en un período específico. */
export async function marcarConceptoPeriodo(
  clienteId: string,
  conceptoId: string,
  periodo: string,
  considerado: boolean,
): Promise<Resp> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("concepto_periodo")
    .upsert(
      { cliente_id: clienteId, concepto_id: conceptoId, periodo, considerado },
      { onConflict: "concepto_id,periodo" },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/liquidaciones/${clienteId}`);
  return { ok: true };
}

/** Filtra los conceptos excluidos del período (concepto_periodo.considerado=false). */
function filtrarConsiderados<T extends { id: string }>(
  conceptos: T[],
  cp: { concepto_id: string; considerado: boolean }[] | null,
): T[] {
  const excluido = new Set((cp ?? []).filter((r) => r.considerado === false).map((r) => r.concepto_id));
  return conceptos.filter((c) => !excluido.has(c.id));
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
  sueldo_modalidad: string;
  gratificacion_tipo: string | null;
  gratificacion_monto: number | null;
  mas_11_anios: boolean;
  sueldo_empresarial: boolean;
  montos_fijos: { colacion: number; movilizacion: number; conceptos: Record<string, number> };
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
    sueldo_modalidad: t.sueldo_modalidad || "mensual",
    gratificacion_tipo: t.gratificacion_tipo,
    gratificacion_monto: t.gratificacion_monto,
    mas_11_anios: t.mas_11_anios,
    sueldo_empresarial: t.sueldo_empresarial,
    montos_fijos: t.montos_fijos,
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
  opts: { diasTrabajados?: number; diasDescanso?: number; diasVacaciones?: number; diasLicencia?: number; kameLiquido?: number | null },
): Promise<Resp & { liquido?: number; detalle?: ReturnType<typeof calcularLiquidacion> }> {
  const supabase = await createClient();
  const usuario = await getUsuarioActual().catch(() => null);
  let usuarioId: string | null = null;
  if (usuario) {
    const { data } = await supabase.from("usuarios").select("id").eq("correo", usuario.correo).maybeSingle();
    usuarioId = data?.id ?? null;
  }

  const [cliRes, indRes, trabRes, contRes, novRes, concRes, cpRes] = await Promise.all([
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
    supabase.from("concepto_periodo").select("concepto_id, considerado").eq("cliente_id", clienteId).eq("periodo", periodo),
  ]);

  if (!indRes.data) return { ok: false, error: `No hay indicadores Previred cargados para ${periodo}. Súbelos en /indicadores.` };
  if (!trabRes.data) return { ok: false, error: "Trabajador no encontrado." };

  const entrada = armarEntrada({
    ind: indRes.data as IndicadoresRow,
    cliente: (cliRes.data ?? {}) as ClienteRow,
    trabajador: trabRes.data as TrabajadorRow,
    contrato: (contRes.data ?? null) as ContratoRow | null,
    novedades: (novRes.data ?? []) as NovedadRow[],
    conceptos: filtrarConsiderados((concRes.data ?? []) as ConceptoRow[], cpRes.data),
    periodo,
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
    dias_vacaciones: opts.diasVacaciones ?? 0,
    dias_licencia: opts.diasLicencia ?? 0,
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
  return { ok: true, liquido: r.liquido, detalle: r };
}

export type MontoConcepto = { concepto_id: string; naturaleza: string; monto: number };

/**
 * Guarda los montos del mes que el equipo ingresa por trabajador (conceptos de
 * la empresa + horas extra + anticipo) como novedades (origen 'equipo') y
 * recalcula la liquidación. Reemplaza las novedades 'equipo' previas del período.
 */
export async function guardarLiquidacionDetalle(
  clienteId: string,
  trabajadorId: string,
  periodo: string,
  p: {
    diasTrabajados: number;
    diasVacaciones: number;
    diasLicencia: number;
    conceptos: MontoConcepto[];
    horasExtra: number;
    anticipo: number;
    kameLiquido: number | null;
    /** Modalidad por hora: horas normales trabajadas en el mes. */
    horasNormales?: number;
    /** Modalidad por día: días a pago del mes. */
    diasPagados?: number;
  },
): Promise<Resp & { liquido?: number; detalle?: ReturnType<typeof calcularLiquidacion> }> {
  const supabase = await createClient();

  // Reemplaza lo que cargó el equipo en el período (no toca lo del portal = origen 'cliente').
  const del = await supabase
    .from("novedades_remuneraciones")
    .delete()
    .eq("trabajador_id", trabajadorId)
    .eq("periodo", periodo)
    .eq("origen", "equipo");
  if (del.error) return { ok: false, error: del.error.message };

  const filas: Record<string, unknown>[] = [];
  for (const c of p.conceptos) {
    if (!c.monto || c.monto === 0) continue;
    filas.push({
      cliente_id: clienteId,
      trabajador_id: trabajadorId,
      periodo,
      tipo: c.naturaleza === "descuento" ? "descuento" : "bono",
      monto: c.monto,
      concepto_id: c.concepto_id,
      origen: "equipo",
    });
  }
  if (p.horasExtra > 0)
    filas.push({ cliente_id: clienteId, trabajador_id: trabajadorId, periodo, tipo: "hora_extra", cantidad: p.horasExtra, origen: "equipo" });
  if (p.anticipo > 0)
    filas.push({ cliente_id: clienteId, trabajador_id: trabajadorId, periodo, tipo: "anticipo", monto: p.anticipo, origen: "equipo" });
  if ((p.horasNormales ?? 0) > 0)
    filas.push({ cliente_id: clienteId, trabajador_id: trabajadorId, periodo, tipo: "horas_normales", cantidad: p.horasNormales, origen: "equipo" });
  if ((p.diasPagados ?? 0) > 0)
    filas.push({ cliente_id: clienteId, trabajador_id: trabajadorId, periodo, tipo: "dias_pagados", cantidad: p.diasPagados, origen: "equipo" });

  if (filas.length > 0) {
    const ins = await supabase.from("novedades_remuneraciones").insert(filas);
    if (ins.error) return { ok: false, error: ins.error.message };
  }

  return calcularYGuardarLiquidacion(clienteId, trabajadorId, periodo, {
    diasTrabajados: p.diasTrabajados,
    diasVacaciones: p.diasVacaciones,
    diasLicencia: p.diasLicencia,
    kameLiquido: p.kameLiquido,
  });
}

const COLS_IND =
  "rmi_general, utm, uf_ultimo_dia, tope_uf_afp, tope_uf_ips, tope_uf_afc, tasa_sis, tasa_seguro_social, afp, asignacion_familiar";

function fmtFecha(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function labelContrato(t: string | null): string {
  return t === "plazo_fijo" ? "Plazo Fijo" : t === "casa_particular" ? "Casa Particular" : "Indefinido";
}

/**
 * Genera el PDF de liquidaciones con el formato KAME. Si `trabajadorId` viene,
 * descarga esa liquidación; si no, todas las del período en un solo archivo
 * (una por página). Recalcula con los datos actuales para que el PDF esté completo.
 */
export async function descargarLiquidaciones(
  clienteId: string,
  periodo: string,
  trabajadorId?: string | null,
): Promise<{ ok: boolean; base64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  const [cliRes, indRes, liqRes, concRes, cpRes] = await Promise.all([
    supabase.from("clientes").select("razon_social, rut_empresa, domicilio").eq("id", clienteId).maybeSingle(),
    supabase.from("indicadores_previred").select(COLS_IND).eq("periodo", periodo).maybeSingle(),
    supabase.from("liquidacion").select("trabajador_id, dias_trabajados, dias_vacaciones, dias_licencia").eq("cliente_id", clienteId).eq("periodo", periodo),
    supabase.from("concepto_remuneracion").select("id, naturaleza, proporcional, tributable, nombre").eq("cliente_id", clienteId),
    supabase.from("concepto_periodo").select("concepto_id, considerado").eq("cliente_id", clienteId).eq("periodo", periodo),
  ]);

  if (!indRes.data) return { ok: false, error: `No hay indicadores Previred para ${periodo}.` };
  if (!cliRes.data) return { ok: false, error: "Empresa no encontrada." };

  const diasMap = new Map(
    (liqRes.data ?? []).map((l) => [
      l.trabajador_id,
      { trab: (l.dias_trabajados as number) ?? 30, vac: (l.dias_vacaciones as number) ?? 0, lic: (l.dias_licencia as number) ?? 0 },
    ]),
  );
  const ids = trabajadorId ? [trabajadorId] : (liqRes.data ?? []).map((l) => l.trabajador_id);
  if (ids.length === 0) return { ok: false, error: "No hay liquidaciones calculadas en el período. Liquida primero." };

  const [trabRes, novRes, contRes] = await Promise.all([
    supabase.from("trabajadores").select("*").in("id", ids),
    supabase.from("novedades_remuneraciones").select("trabajador_id, tipo, cantidad, monto, concepto_id").eq("periodo", periodo).in("trabajador_id", ids),
    supabase.from("contratos").select("trabajador_id, remuneracion, jornada, estado, created_at").in("trabajador_id", ids).neq("estado", "anulado").order("created_at", { ascending: false }),
  ]);

  const contMap = new Map<string, ContratoRow>();
  for (const c of contRes.data ?? []) if (!contMap.has(c.trabajador_id)) contMap.set(c.trabajador_id, c as ContratoRow);

  const [mes, anio] = etiquetaPeriodo(periodo).split(" ");
  const periodoLabel = `${(mes ?? "").toUpperCase()} DE ${anio ?? ""}`;

  const items: DatosLiquidacionPdf[] = (trabRes.data ?? [])
    .slice()
    .sort((a, b) => String(a.apellidos).localeCompare(String(b.apellidos)))
    .map((t) => {
      const novs = (novRes.data ?? []).filter((n) => n.trabajador_id === t.id) as NovedadRow[];
      const dias = diasMap.get(t.id) ?? { trab: 30, vac: 0, lic: 0 };
      const entrada = armarEntrada({
        ind: indRes.data as IndicadoresRow,
        cliente: cliRes.data as ClienteRow,
        trabajador: t as TrabajadorRow,
        contrato: contMap.get(t.id) ?? null,
        novedades: novs,
        conceptos: filtrarConsiderados((concRes.data ?? []) as ConceptoRow[], cpRes.data),
        periodo,
        diasTrabajados: dias.trab,
      });
      const modalidad = (t.sueldo_modalidad as string) ?? "mensual";
      let sueldoLinea: string | undefined;
      if (modalidad === "hora" || modalidad === "dia") {
        const cant = novs
          .filter((n) => n.tipo === (modalidad === "hora" ? "horas_normales" : "dias_pagados"))
          .reduce((s, n) => s + Number(n.cantidad ?? 0), 0);
        const tarifa = Number(t.sueldo_base ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
        sueldoLinea = `SUELDO BASE ${cant.toLocaleString("es-CL")} ${modalidad === "hora" ? "HORAS" : "DIAS"} x $${tarifa}`;
      }
      const esIsapre =
        !!t.salud && String(t.salud).toLowerCase() !== "fonasa" && String(t.salud).toLowerCase() !== "sin isapre";
      const planValor = Number(t.salud_plan_valor ?? 0);
      const uf = Number((indRes.data as IndicadoresRow).uf_ultimo_dia ?? 0);
      const planSalud =
        esIsapre && planValor > 0
          ? {
              valor: planValor,
              unidad: (t.salud_plan_unidad === "$" ? "$" : "UF") as "UF" | "$",
              totalPesos: Math.round((t.salud_plan_unidad === "$" ? planValor : planValor * uf) + 1e-6),
            }
          : null;
      return {
        empresa: { razonSocial: cliRes.data!.razon_social, rut: cliRes.data!.rut_empresa, direccion: cliRes.data!.domicilio },
        trabajador: {
          nombre: `${t.apellidos} ${t.nombres}`,
          rut: t.rut,
          tipoContrato: labelContrato(t.tipo_contrato),
          fechaIngreso: fmtFecha(t.fecha_ingreso),
          fechaTermino: fmtFecha(t.fecha_termino_contrato),
          cargo: t.cargo,
          unidadNegocio: t.sucursal,
          salud: t.salud,
          planSalud,
        },
        periodoLabel,
        diasTrabajados: dias.trab,
        diasVacaciones: dias.vac,
        diasLicencia: dias.lic,
        sueldoBase: entrada.sueldoBase,
        r: calcularLiquidacion(entrada),
        sueldoLinea,
        alerta:
          entrada.diasTrabajados === 0
            ? modalidad === "hora"
              ? "PENDIENTE: INFORMAR LAS HORAS TRABAJADAS DEL MES PARA CALCULAR ESTA LIQUIDACION."
              : "PENDIENTE: INFORMAR LOS DIAS TRABAJADOS DEL MES PARA CALCULAR ESTA LIQUIDACION."
            : undefined,
      };
    });

  const bytes = await generarPdfLiquidaciones(items);
  const base64 = Buffer.from(bytes).toString("base64");
  return {
    ok: true,
    base64,
    filename: trabajadorId ? `liquidacion_${periodo}.pdf` : `liquidaciones_${periodo}.pdf`,
  };
}

function partirRut(rut: string | null): { num: string; dv: string } {
  const limpio = (rut ?? "").replace(/[.\s]/g, "").toUpperCase();
  const m = limpio.match(/^(\d+)-?([0-9K])$/);
  if (m) return { num: m[1], dv: m[2] };
  return { num: limpio.replace(/[^0-9]/g, ""), dv: "" };
}

/**
 * Genera el archivo de carga electrónica de Previred (Formato Largo Variable,
 * 105 campos) para el período. Filtra por unidad de negocio (centro de costo)
 * si se indica. Recalcula cada trabajador con los datos actuales.
 */
export async function descargarNominaPrevired(
  clienteId: string,
  periodo: string,
  unidadNegocio?: string | null,
): Promise<{ ok: boolean; base64?: string; filename?: string; error?: string }> {
  const supabase = await createClient();

  const [cliRes, indRes, liqRes, concRes, cpRes] = await Promise.all([
    supabase.from("clientes").select("razon_social, mutual_institucion, caja_compensacion, mutual_tasa, sabado_habil").eq("id", clienteId).maybeSingle(),
    supabase.from("indicadores_previred").select(COLS_IND).eq("periodo", periodo).maybeSingle(),
    supabase.from("liquidacion").select("trabajador_id, dias_trabajados, dias_licencia").eq("cliente_id", clienteId).eq("periodo", periodo),
    supabase.from("concepto_remuneracion").select("id, naturaleza, proporcional, tributable, nombre").eq("cliente_id", clienteId),
    supabase.from("concepto_periodo").select("concepto_id, considerado").eq("cliente_id", clienteId).eq("periodo", periodo),
  ]);

  if (!indRes.data) return { ok: false, error: `No hay indicadores Previred para ${periodo}.` };
  if (!cliRes.data) return { ok: false, error: "Empresa no encontrada." };

  let trabQuery = supabase.from("trabajadores").select("*").eq("cliente_id", clienteId).eq("activo", true);
  if (unidadNegocio) trabQuery = trabQuery.eq("sucursal", unidadNegocio);
  const trabRes = await trabQuery.order("apellidos");
  const trabajadores = trabRes.data ?? [];
  if (trabajadores.length === 0) return { ok: false, error: "No hay trabajadores para esa unidad de negocio." };

  const ids = trabajadores.map((t) => t.id);
  const [novRes, contRes] = await Promise.all([
    supabase.from("novedades_remuneraciones").select("trabajador_id, tipo, cantidad, monto, concepto_id").eq("periodo", periodo).in("trabajador_id", ids),
    supabase.from("contratos").select("trabajador_id, remuneracion, jornada, estado, created_at").in("trabajador_id", ids).neq("estado", "anulado").order("created_at", { ascending: false }),
  ]);
  const contMap = new Map<string, ContratoRow>();
  for (const c of contRes.data ?? []) if (!contMap.has(c.trabajador_id)) contMap.set(c.trabajador_id, c as ContratoRow);
  const diasMap = new Map((liqRes.data ?? []).map((l) => [l.trabajador_id, { trab: (l.dias_trabajados as number) ?? 30 }]));
  const conceptos = filtrarConsiderados((concRes.data ?? []) as ConceptoRow[], cpRes.data);
  const indData = indRes.data as { uf_ultimo_dia?: number; tasa_seguro_social?: number | string; afp?: { nombre: string; tasa_total?: number }[] };
  const uf = Number(indData.uf_ultimo_dia ?? 0);
  const tasaSeguroSocial = Number(indData.tasa_seguro_social ?? 0);
  const tasaTotalAfp = (nombre: string | null): number => {
    const q = (nombre ?? "").toLowerCase().replace("afp", "").trim();
    const m = (indData.afp ?? []).find((a) => a.nombre.toLowerCase().includes(q) || (q && q.includes(a.nombre.toLowerCase())));
    return Number(m?.tasa_total ?? 0);
  };

  const datos: DatosPreviredTrabajador[] = trabajadores.map((t) => {
    const dias = diasMap.get(t.id)?.trab ?? 30;
    const entrada = armarEntrada({
      ind: indRes.data as IndicadoresRow,
      cliente: cliRes.data as ClienteRow,
      trabajador: t as TrabajadorRow,
      contrato: contMap.get(t.id) ?? null,
      novedades: (novRes.data ?? []).filter((n) => n.trabajador_id === t.id) as NovedadRow[],
      conceptos,
      periodo,
      diasTrabajados: dias,
    });
    const r = calcularLiquidacion(entrada);
    const { num, dv } = partirRut(t.rut);
    const planUf = t.salud_plan_unidad === "UF" ? Number(t.salud_plan_valor ?? 0) * uf : Number(t.salud_plan_valor ?? 0);
    return {
      rutSinDv: num,
      dv,
      apellidoPaterno: t.apellido_paterno ?? (t.apellidos ?? "").split(" ")[0] ?? "",
      apellidoMaterno: t.apellido_materno ?? (t.apellidos ?? "").split(" ").slice(1).join(" ") ?? "",
      nombres: t.nombres ?? "",
      sexo: t.sexo,
      nacionalidad: t.nacionalidad,
      regimen: t.regimen_previsional ?? "afp",
      tipoTrabajador: t.tipo_trabajador ?? "activo",
      diasTrabajados: dias,
      afp: t.afp,
      afpTasaTotal: tasaTotalAfp(t.afp),
      tasaSeguroSocial,
      salud: t.salud,
      monedaPlan: t.salud_plan_unidad,
      valorPlan: Math.round(planUf),
      tramoAsignacion: t.tramo_asignacion,
      cargasSimples: t.cargas_simples ?? 0,
      cargasMaternales: t.cargas_maternales ?? 0,
      cargasInvalidas: t.cargas_invalidas ?? 0,
      jornada: t.jornada_tipo,
      centroCosto: t.sucursal,
      r,
    };
  });

  const txt = generarNominaPrevired(periodo, { mutual: cliRes.data.mutual_institucion, ccaf: cliRes.data.caja_compensacion }, datos);
  const base64 = Buffer.from(txt, "latin1").toString("base64");
  const suf = unidadNegocio ? `_${unidadNegocio.replace(/[^a-zA-Z0-9]/g, "")}` : "";
  return { ok: true, base64, filename: `previred_${periodo}${suf}.txt` };
}
