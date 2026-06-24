/**
 * Arma la entrada del motor `calcularLiquidacion` a partir de las filas de BD:
 * ficha del trabajador + contrato + empresa + indicadores del período +
 * novedades del mes (lo que el cliente carga por el portal) + conceptos de la
 * empresa. Centraliza el "pegado" para que el motor reciba datos limpios.
 */

import {
  type EntradaLiquidacion,
  type IndicadoresLiq,
  type ConceptoValor,
  type HoraExtraInput,
  type TipoTrabajador,
  type RegimenPrevisional,
  type TipoContrato,
  type GratificacionTipo,
} from "./liquidacion";

export type IndicadoresRow = {
  imm?: number | null;
  rmi_general?: number | null;
  utm: number | null;
  uf_ultimo_dia: number | null;
  tope_uf_afp: number | string | null;
  tope_uf_ips: number | string | null;
  tope_uf_afc: number | string | null;
  tasa_sis: number | string | null;
  tasa_seguro_social: number | string | null;
  afp: { nombre: string; tasa_trabajador: number }[] | null;
  asignacion_familiar: { tramo: string; hasta: number | null; monto: number }[] | null;
};

export type ClienteRow = {
  mutual_tasa?: number | string | null;
  sabado_habil?: boolean | null;
};

export type TrabajadorRow = {
  sueldo_base?: number | string | null;
  afp?: string | null;
  salud?: string | null;
  salud_plan_valor?: number | string | null;
  salud_plan_unidad?: string | null;
  tipo_contrato?: string | null;
  tipo_trabajador?: string | null;
  regimen_previsional?: string | null;
  horas_semanales?: number | string | null;
  mas_11_anios?: boolean | null;
  cargas_simples?: number | null;
  cargas_maternales?: number | null;
  cargas_invalidas?: number | null;
  tramo_asignacion?: string | null;
};

export type ContratoRow = {
  remuneracion?: {
    sueldo_base?: number;
    gratificacion_tipo?: string;
    gratificacion_monto?: number | null;
  } | null;
  jornada?: { horas_semanales?: number } | null;
};

export type NovedadRow = {
  tipo: string;
  cantidad: number | string | null;
  monto: number | string | null;
  concepto_id: string | null;
};

export type ConceptoRow = {
  id: string;
  naturaleza: string;
  proporcional: boolean;
  tributable: boolean;
  nombre: string;
};

const num = (v: number | string | null | undefined, def = 0): number =>
  v === null || v === undefined || v === "" ? def : Number(v);

function mapearIndicadores(i: IndicadoresRow): IndicadoresLiq {
  return {
    imm: num(i.rmi_general ?? i.imm),
    utm: num(i.utm),
    uf: num(i.uf_ultimo_dia),
    topeUfAfp: num(i.tope_uf_afp, 90),
    topeUfIps: num(i.tope_uf_ips, 60),
    topeUfAfc: num(i.tope_uf_afc, 135.2),
    tasaSis: num(i.tasa_sis),
    tasaSeguroSocial: num(i.tasa_seguro_social),
    tasasAfp: (i.afp ?? []).map((a) => ({
      nombre: a.nombre,
      tasaTrabajador: num(a.tasa_trabajador),
    })),
    asignacionFamiliar: (i.asignacion_familiar ?? []).map((t) => ({
      tramo: t.tramo,
      hasta: t.hasta,
      monto: num(t.monto),
    })),
  };
}

function tipoContrato(t: string | null | undefined): TipoContrato {
  if (t === "plazo_fijo") return "plazo_fijo";
  if (t === "casa_particular") return "casa_particular";
  return "indefinido";
}

export type ArmarParams = {
  ind: IndicadoresRow;
  cliente: ClienteRow;
  trabajador: TrabajadorRow;
  contrato: ContratoRow | null;
  novedades: NovedadRow[];
  conceptos: ConceptoRow[];
  /** Días trabajados del mes (default 30). */
  diasTrabajados?: number;
  /** Domingos + festivos del mes (para semana corrida). */
  diasDescanso?: number;
};

export function armarEntrada(p: ArmarParams): EntradaLiquidacion {
  const rem = p.contrato?.remuneracion ?? null;
  const sueldoBase = num(rem?.sueldo_base ?? p.trabajador.sueldo_base);
  const jornadaSemanal =
    num(p.contrato?.jornada?.horas_semanales ?? p.trabajador.horas_semanales, 45) || 45;
  const porId = new Map(p.conceptos.map((c) => [c.id, c]));

  // Novedades → entradas del motor
  const horasExtras: HoraExtraInput[] = [];
  const conceptosValor: ConceptoValor[] = [];
  let anticipo = 0;
  let semanaCorridaVariable = 0;

  for (const n of p.novedades) {
    if (n.tipo === "hora_extra") {
      horasExtras.push({ horas: num(n.cantidad), jornadaSemanal });
    } else if (n.tipo === "anticipo") {
      anticipo += num(n.monto);
    } else if (n.tipo === "bono" || n.tipo === "descuento") {
      const c = n.concepto_id ? porId.get(n.concepto_id) : undefined;
      if (c) {
        conceptosValor.push({
          nombre: c.nombre,
          naturaleza: c.naturaleza as ConceptoValor["naturaleza"],
          monto: num(n.monto),
          proporcional: c.proporcional,
          tributable: c.tributable,
        });
        if (c.naturaleza === "haber_imponible" && /comisi|semana corrida|trato/i.test(c.nombre))
          semanaCorridaVariable += num(n.monto);
      } else {
        // Bono/descuento genérico sin concepto: imponible si bono, descuento si no.
        conceptosValor.push({
          nombre: n.tipo === "bono" ? "Bono" : "Descuento",
          naturaleza: n.tipo === "bono" ? "haber_imponible" : "descuento",
          monto: num(n.monto),
        });
      }
    }
  }

  return {
    ind: mapearIndicadores(p.ind),
    mutualTasa: num(p.cliente.mutual_tasa),
    sueldoBase,
    diasTrabajados: p.diasTrabajados ?? 30,
    gratificacionTipo: (rem?.gratificacion_tipo as GratificacionTipo) ?? "sin",
    gratificacionMonto: rem?.gratificacion_monto ?? 0,
    afp: p.trabajador.afp ?? null,
    regimenPrevisional: (p.trabajador.regimen_previsional as RegimenPrevisional) ?? "afp",
    tipoTrabajador: (p.trabajador.tipo_trabajador as TipoTrabajador) ?? "activo",
    tipoContrato: tipoContrato(p.trabajador.tipo_contrato),
    mas11Anios: p.trabajador.mas_11_anios ?? false,
    salud: p.trabajador.salud ?? null,
    planSaludUf: p.trabajador.salud_plan_unidad === "UF" ? num(p.trabajador.salud_plan_valor) : undefined,
    planSaludPesos: p.trabajador.salud_plan_unidad === "$" ? num(p.trabajador.salud_plan_valor) : undefined,
    cargasSimples: p.trabajador.cargas_simples ?? 0,
    cargasMaternales: p.trabajador.cargas_maternales ?? 0,
    cargasInvalidas: p.trabajador.cargas_invalidas ?? 0,
    tramoAsignacion: p.trabajador.tramo_asignacion ?? null,
    horasExtras,
    semanaCorridaVariable: semanaCorridaVariable || undefined,
    diasDescanso: p.diasDescanso,
    conceptos: conceptosValor,
    anticipo,
  };
}
