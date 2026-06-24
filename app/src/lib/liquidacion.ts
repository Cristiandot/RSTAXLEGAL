/**
 * Motor de cálculo de liquidaciones de sueldo (migración KAME → Claude).
 *
 * Reproduce el cálculo mensual de KAME al peso. Reglas validadas contra KAME
 * (junio 2026): redondeo MEDIO PESO HACIA ARRIBA y a prueba de flotantes
 * (`pesos()`); base imponible = sueldo base + gratificación + haberes imponibles;
 * topes en UF del período; AFP/salud/AFC/impuesto único como descuentos.
 *
 * Es una función pura: recibe indicadores del período + ficha del trabajador +
 * novedades del mes, y devuelve haberes, descuentos, líquido y costos del
 * empleador. No toca BD ni red.
 */

import {
  factorHoraExtra,
  type BaseHoraExtra,
  RECARGO_MINIMO,
} from "./horas-extras";

/**
 * Redondeo a peso entero, medio hacia arriba (ROUND_HALF_UP) y robusto frente a
 * artefactos de punto flotante (ej. 4042.4999999 → 4043). KAME redondea así.
 */
export function pesos(x: number): number {
  return Math.round(x + 1e-6);
}

export type TasaAfp = { nombre: string; tasaTrabajador: number }; // % ej. 11.27

export type TramoAsignacion = {
  tramo: string; // 'A' | 'B' | 'C' | 'D'
  hasta: number | null; // tope de renta del tramo (null = sin tope)
  monto: number; // monto por carga simple
};

/** Indicadores Previred del período (de `indicadores_previred`). */
export type IndicadoresLiq = {
  imm: number; // ingreso mínimo mensual
  utm: number;
  uf: number; // UF del último día del mes
  topeUfAfp: number; // 90
  topeUfIps: number; // 60
  topeUfAfc: number; // 135.2
  tasaSis: number; // % cargo empleador, ej. 1.62
  tasaSeguroSocial: number; // % base Ley 16.744, ej. 0.90
  tasasAfp: TasaAfp[];
  asignacionFamiliar: TramoAsignacion[];
};

export type RegimenPrevisional = "afp" | "ips" | "sip";
export type TipoTrabajador =
  | "activo"
  | "pensionado_cotiza"
  | "pensionado_no_cotiza"
  | "activo_mayor65";
export type TipoContrato = "indefinido" | "plazo_fijo" | "casa_particular";
export type GratificacionTipo = "sin" | "25" | "tope" | "manual";

/** Una partida de horas extra del mes. */
export type HoraExtraInput = {
  horas: number;
  jornadaSemanal: number;
  base?: BaseHoraExtra; // default "mensual"
  recargo?: number; // default 0.5
};

/** Concepto valorizado del mes (bono/descuento configurable por empresa). */
export type ConceptoValor = {
  nombre: string;
  naturaleza: "haber_imponible" | "haber_no_imponible" | "descuento";
  monto: number; // monto del mes (antes de prorrateo)
  proporcional?: boolean; // prorratea por días trabajados / 30
  tributable?: boolean; // sólo no imponibles: afecto a impuesto único
};

export type EntradaLiquidacion = {
  ind: IndicadoresLiq;

  // --- Empresa ---
  mutualTasa: number; // % total cargo empleador (incluye 0,90 base), ej. 1.95

  // --- Ficha del trabajador / contrato ---
  sueldoBase: number;
  diasTrabajados: number; // base 30; mes completo = 30
  gratificacionTipo: GratificacionTipo;
  gratificacionMonto?: number; // si tipo 'manual'
  afp: string | null;
  regimenPrevisional: RegimenPrevisional;
  tipoTrabajador: TipoTrabajador;
  tipoContrato: TipoContrato;
  mas11Anios?: boolean; // AFC empleador 0,8% en indefinidos de 11+ años
  sueldoEmpresarial?: boolean; // socio/dueño: no cotiza AFC (sin subordinación)
  salud: string | null; // 'Fonasa' o nombre de isapre
  planSaludUf?: number; // valor del plan en UF (isapre)
  planSaludPesos?: number; // valor del plan en $ (isapre)
  cargasSimples?: number;
  cargasMaternales?: number;
  cargasInvalidas?: number;
  tramoAsignacion?: string | null; // 'A'..'D'; si null se determina por renta

  // --- Novedades del mes ---
  horasExtras?: HoraExtraInput[];
  /** Remuneración variable del mes (comisiones/trato) base de la semana corrida. */
  semanaCorridaVariable?: number;
  /** Domingos + festivos pagados del período (calculados con lib/feriados). */
  diasDescanso?: number;
  conceptos?: ConceptoValor[];
  anticipo?: number;
};

export type LineaLiquidacion = { glosa: string; monto: number };

export type ResultadoLiquidacion = {
  // Haberes
  sueldoBase: number;
  gratificacion: number;
  horasExtras: number;
  semanaCorrida: number;
  haberesImponibles: LineaLiquidacion[];
  totalImponible: number; // antes de tope
  baseImponible: number; // tras aplicar tope AFP/salud
  baseImponibleAfc: number; // tras tope AFC
  haberesNoImponibles: LineaLiquidacion[];
  totalNoImponible: number;
  asignacionFamiliar: number;
  totalHaberes: number;

  // Descuentos (cargo del trabajador)
  afpNombre: string | null;
  afpTasa: number | null;
  afpMonto: number;
  saludLegal: number; // 7%
  saludAdicional: number; // exceso del plan isapre sobre 7%
  saludMonto: number;
  afcTrabajador: number;
  tributable: number; // base afecta a impuesto único
  impuestoUnico: number;
  descuentosVarios: LineaLiquidacion[];
  anticipo: number;
  totalDescuentos: number;

  liquido: number;

  // Costos del empleador (para Previred / costo empresa)
  sisEmpleador: number;
  afcEmpleador: number;
  mutualEmpleador: number;

  notas: string[];
};

/** Tramos mensuales del impuesto único de 2ª categoría (Art. 43 LIR, en UTM). */
const TRAMOS_IUSC: { hastaUtm: number; tasa: number }[] = [
  { hastaUtm: 13.5, tasa: 0 },
  { hastaUtm: 30, tasa: 0.04 },
  { hastaUtm: 50, tasa: 0.08 },
  { hastaUtm: 70, tasa: 0.135 },
  { hastaUtm: 90, tasa: 0.23 },
  { hastaUtm: 120, tasa: 0.304 },
  { hastaUtm: 310, tasa: 0.35 },
  { hastaUtm: Infinity, tasa: 0.4 },
];

function impuestoUnico(tributable: number, utm: number): number {
  let impuesto = 0;
  let piso = 0;
  for (const t of TRAMOS_IUSC) {
    const techo = t.hastaUtm * utm;
    if (tributable > piso) impuesto += (Math.min(tributable, techo) - piso) * t.tasa;
    piso = techo;
    if (tributable <= techo) break;
  }
  return pesos(impuesto);
}

/** Busca la tasa de la AFP del trabajador en los indicadores del período. */
function buscarTasaAfp(afp: string | null, tasas: TasaAfp[]): TasaAfp | undefined {
  const q = (afp ?? "").toLowerCase().replace("afp", "").trim();
  if (!q) return undefined;
  return tasas.find(
    (t) =>
      t.nombre.toLowerCase().includes(q) || q.includes(t.nombre.toLowerCase()),
  );
}

/** Determina el tramo de asignación familiar por renta imponible. */
function montoAsignacion(
  imponible: number,
  cargas: number,
  tramoForzado: string | null | undefined,
  tabla: TramoAsignacion[],
): number {
  if (cargas <= 0) return 0;
  let tramo: TramoAsignacion | undefined;
  if (tramoForzado) {
    tramo = tabla.find((t) => t.tramo === tramoForzado);
  } else {
    tramo = tabla.find((t) => t.hasta === null || imponible <= t.hasta);
  }
  return tramo ? pesos(tramo.monto) * cargas : 0;
}

export function calcularLiquidacion(e: EntradaLiquidacion): ResultadoLiquidacion {
  const notas: string[] = [];
  const dias = e.diasTrabajados > 0 ? Math.min(e.diasTrabajados, 30) : 0;
  const propDias = dias / 30;

  // ---------- HABERES IMPONIBLES ----------
  const sueldoBase = pesos(e.sueldoBase * propDias);
  if (dias < 30) notas.push(`Mes de ${dias} días — sueldo base y tope de gratificación prorrateados.`);

  // Gratificación legal Art. 50: 25% de lo devengado, tope 4,75 IMM / 12 (prorrateado por días).
  const topeGratif = pesos(((4.75 * e.ind.imm) / 12) * propDias);
  let gratificacion = 0;
  if (e.gratificacionTipo === "25") gratificacion = Math.min(pesos(sueldoBase * 0.25), topeGratif);
  else if (e.gratificacionTipo === "tope") gratificacion = topeGratif;
  else if (e.gratificacionTipo === "manual") gratificacion = pesos(e.gratificacionMonto ?? 0);
  if (e.gratificacionTipo === "25" && pesos(sueldoBase * 0.25) > topeGratif)
    notas.push("Gratificación topada en 4,75 IMM ÷ 12.");

  // Horas extras
  let horasExtras = 0;
  for (const h of e.horasExtras ?? []) {
    const f = factorHoraExtra(h.jornadaSemanal, h.base ?? "mensual", h.recargo ?? RECARGO_MINIMO);
    horasExtras += pesos(e.sueldoBase * f * h.horas);
  }

  // Semana corrida = (variable / días trabajados) × días de descanso (Art. 45)
  let semanaCorrida = 0;
  if ((e.semanaCorridaVariable ?? 0) > 0 && (e.diasDescanso ?? 0) > 0 && dias > 0) {
    semanaCorrida = pesos((e.semanaCorridaVariable! / dias) * e.diasDescanso!);
  }

  const haberesImponibles: LineaLiquidacion[] = [];
  for (const c of e.conceptos ?? []) {
    if (c.naturaleza !== "haber_imponible") continue;
    const monto = c.proporcional ? pesos(c.monto * propDias) : pesos(c.monto);
    haberesImponibles.push({ glosa: c.nombre, monto });
  }

  const totalImponible =
    sueldoBase +
    gratificacion +
    horasExtras +
    semanaCorrida +
    haberesImponibles.reduce((s, l) => s + l.monto, 0);

  // ---------- TOPES ----------
  const topeAfpSalud = pesos((e.regimenPrevisional === "ips" ? e.ind.topeUfIps : e.ind.topeUfAfp) * e.ind.uf);
  const topeAfc = pesos(e.ind.topeUfAfc * e.ind.uf);
  const baseImponible = Math.min(totalImponible, topeAfpSalud);
  const baseImponibleAfc = Math.min(totalImponible, topeAfc);
  if (totalImponible > topeAfpSalud) notas.push("Renta imponible topada para AFP/salud.");

  // ---------- DESCUENTOS PREVISIONALES ----------
  const cotizaPrevision = e.tipoTrabajador !== "pensionado_no_cotiza";

  const tasaAfp = buscarTasaAfp(e.afp, e.ind.tasasAfp);
  let afpMonto = 0;
  if (cotizaPrevision && e.regimenPrevisional === "afp") {
    if (tasaAfp) afpMonto = pesos((baseImponible * tasaAfp.tasaTrabajador) / 100);
    else notas.push(e.afp ? `AFP "${e.afp}" no identificada en indicadores — no se descontó AFP.` : "Sin AFP — no se descontó AFP.");
  }

  // Salud: 7% legal; si es isapre con plan mayor, la diferencia es adicional.
  const saludLegal = cotizaPrevision ? pesos(baseImponible * 0.07) : 0;
  let saludAdicional = 0;
  const esIsapre = !!e.salud && e.salud.toLowerCase() !== "fonasa" && e.salud.toLowerCase() !== "sin isapre";
  if (esIsapre && cotizaPrevision) {
    const planPesos = e.planSaludUf ? pesos(e.planSaludUf * e.ind.uf) : pesos(e.planSaludPesos ?? 0);
    saludAdicional = Math.max(0, planPesos - saludLegal);
  }
  const saludMonto = saludLegal + saludAdicional;

  // AFC trabajador: sólo indefinidos con menos de 11 años (0,6%); plazo fijo no
  // cotiza; sueldo empresarial no cotiza (sin subordinación/dependencia).
  let afcTrabajador = 0;
  if (e.sueldoEmpresarial) {
    notas.push("Sueldo empresarial: no cotiza seguro de cesantía (sin relación de subordinación).");
  } else if (e.tipoContrato === "indefinido" && !e.mas11Anios && e.tipoTrabajador === "activo") {
    afcTrabajador = pesos(baseImponibleAfc * 0.006);
  } else if (e.tipoContrato === "indefinido" && e.mas11Anios) {
    notas.push("11+ años de antigüedad: el trabajador deja de cotizar AFC y el empleador baja a 0,8%.");
  } else if (e.tipoContrato === "plazo_fijo") {
    notas.push("Plazo fijo: el trabajador no cotiza AFC (3% íntegro del empleador).");
  }

  // ---------- HABERES NO IMPONIBLES ----------
  const haberesNoImponibles: LineaLiquidacion[] = [];
  let baseTributableExtra = 0;
  for (const c of e.conceptos ?? []) {
    if (c.naturaleza !== "haber_no_imponible") continue;
    const monto = c.proporcional ? pesos(c.monto * propDias) : pesos(c.monto);
    haberesNoImponibles.push({ glosa: c.nombre, monto });
    if (c.tributable) baseTributableExtra += monto;
  }
  const totalNoImponible = haberesNoImponibles.reduce((s, l) => s + l.monto, 0);

  // ---------- IMPUESTO ÚNICO ----------
  const tributable = baseImponible - afpMonto - saludMonto - afcTrabajador + baseTributableExtra;
  const tributablePositivo = Math.max(0, tributable);
  const impuesto = e.ind.utm ? impuestoUnico(tributablePositivo, e.ind.utm) : 0;

  // ---------- ASIGNACIÓN FAMILIAR ----------
  const cargas = (e.cargasSimples ?? 0) + (e.cargasMaternales ?? 0) + (e.cargasInvalidas ?? 0);
  const asignacionFamiliar = montoAsignacion(totalImponible, cargas, e.tramoAsignacion, e.ind.asignacionFamiliar);

  // ---------- DESCUENTOS VARIOS ----------
  const descuentosVarios: LineaLiquidacion[] = [];
  for (const c of e.conceptos ?? []) {
    if (c.naturaleza !== "descuento") continue;
    descuentosVarios.push({ glosa: c.nombre, monto: pesos(c.monto) });
  }
  const anticipo = pesos(e.anticipo ?? 0);

  // ---------- TOTALES ----------
  const totalHaberes = totalImponible + totalNoImponible + asignacionFamiliar;
  const totalDescuentos =
    afpMonto +
    saludMonto +
    afcTrabajador +
    impuesto +
    anticipo +
    descuentosVarios.reduce((s, l) => s + l.monto, 0);
  const liquido = totalHaberes - totalDescuentos;

  // ---------- COSTOS DEL EMPLEADOR ----------
  const sisEmpleador =
    cotizaPrevision && e.tipoTrabajador !== "pensionado_no_cotiza"
      ? pesos((baseImponible * e.ind.tasaSis) / 100)
      : 0;
  let tasaAfcEmpleador = 0;
  if (e.sueldoEmpresarial) tasaAfcEmpleador = 0; // socio: sin AFC
  else if (e.tipoContrato === "plazo_fijo" || e.tipoContrato === "casa_particular") tasaAfcEmpleador = 0.03;
  else if (e.tipoContrato === "indefinido") tasaAfcEmpleador = e.mas11Anios ? 0.008 : 0.024;
  const afcEmpleador = pesos(baseImponibleAfc * tasaAfcEmpleador);
  const mutualEmpleador = pesos((baseImponible * e.mutualTasa) / 100);

  return {
    sueldoBase,
    gratificacion,
    horasExtras,
    semanaCorrida,
    haberesImponibles,
    totalImponible,
    baseImponible,
    baseImponibleAfc,
    haberesNoImponibles,
    totalNoImponible,
    asignacionFamiliar,
    totalHaberes,
    afpNombre: tasaAfp?.nombre ?? e.afp,
    afpTasa: tasaAfp?.tasaTrabajador ?? null,
    afpMonto,
    saludLegal,
    saludAdicional,
    saludMonto,
    afcTrabajador,
    tributable: tributablePositivo,
    impuestoUnico: impuesto,
    descuentosVarios,
    anticipo,
    totalDescuentos,
    liquido,
    sisEmpleador,
    afcEmpleador,
    mutualEmpleador,
    notas,
  };
}
