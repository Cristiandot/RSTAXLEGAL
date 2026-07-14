import { FERIADOS_CHILE, FERIADOS_DESDE, FERIADOS_HASTA } from "./feriados";

/**
 * Motor de cálculo de finiquito (Código del Trabajo chileno).
 *
 * Funciones puras sin dependencias de servidor — se ejecutan en el navegador
 * para que la calculadora reaccione en vivo. Las reglas:
 *
 * - Indemnización por años de servicio (Art. 163): 30 días de la última
 *   remuneración mensual por año y fracción > 6 meses, tope 11 años (contratos
 *   celebrados desde el 14-08-1981). Solo causales Art. 161 y 163 bis.
 * - Indemnización sustitutiva del aviso previo (Art. 162 inc. 4): una
 *   remuneración mensual si el despido por Art. 161 no se avisó con 30 días.
 * - Base de cálculo (Art. 172): última remuneración mensual con tope de 90 UF
 *   (UF del último día del mes anterior al término — viene de los Indicadores
 *   Previred del panel).
 * - Feriado proporcional y pendiente (Arts. 67, 69, 71 y 73): días hábiles
 *   (sábado siempre inhábil) convertidos a corridos al pagarse, usando el
 *   calendario de feriados legales de lib/feriados.ts.
 */

export type CausalFiniquito = {
  codigo: string;
  label: string;
  /** Da derecho a indemnización por años de servicio y aviso previo. */
  indemnizacion: boolean;
  nota?: string;
};

export const CAUSALES_FINIQUITO: CausalFiniquito[] = [
  { codigo: "159-1", label: "Mutuo acuerdo de las partes — Art. 159 N°1", indemnizacion: false },
  { codigo: "159-2", label: "Renuncia del trabajador — Art. 159 N°2", indemnizacion: false },
  { codigo: "159-3", label: "Muerte del trabajador — Art. 159 N°3", indemnizacion: false },
  {
    codigo: "159-4",
    label: "Vencimiento del plazo convenido — Art. 159 N°4",
    indemnizacion: false,
    nota: "Si el contrato a plazo fijo se termina ANTES de su vencimiento sin causal, el trabajador puede demandar las remuneraciones que faltaban hasta el vencimiento (lucro cesante).",
  },
  {
    codigo: "159-5",
    label: "Conclusión de la obra o servicio — Art. 159 N°5",
    indemnizacion: false,
    nota: "Contratos por obra o faena: corresponde indemnización de 2,5 días de remuneración por cada mes trabajado y fracción > 15 días (Art. 163 inc. 3°, Ley 21.122) — agregarla a mano si aplica.",
  },
  { codigo: "159-6", label: "Caso fortuito o fuerza mayor — Art. 159 N°6", indemnizacion: false },
  { codigo: "160-1", label: "Falta de probidad, acoso, injurias, conducta inmoral — Art. 160 N°1", indemnizacion: false },
  { codigo: "160-2", label: "Negociaciones prohibidas por el contrato — Art. 160 N°2", indemnizacion: false },
  { codigo: "160-3", label: "Inasistencia injustificada — Art. 160 N°3", indemnizacion: false },
  { codigo: "160-4", label: "Abandono del trabajo — Art. 160 N°4", indemnizacion: false },
  { codigo: "160-5", label: "Actos o imprudencias temerarias — Art. 160 N°5", indemnizacion: false },
  { codigo: "160-6", label: "Perjuicio material causado intencionalmente — Art. 160 N°6", indemnizacion: false },
  { codigo: "160-7", label: "Incumplimiento grave de las obligaciones del contrato — Art. 160 N°7", indemnizacion: false },
  { codigo: "161-1", label: "Necesidades de la empresa — Art. 161 inc. 1°", indemnizacion: true },
  { codigo: "161-2", label: "Desahucio escrito del empleador — Art. 161 inc. 2°", indemnizacion: true },
  { codigo: "163bis", label: "Liquidación concursal del empleador — Art. 163 bis", indemnizacion: true },
];

export const CAUSAL_LABEL_FINIQUITO: Record<string, string> = Object.fromEntries(
  CAUSALES_FINIQUITO.map((c) => [c.codigo, c.label]),
);

/** Mapea el valor simple que llega del portal del cliente al código de causal. */
export const CAUSAL_PORTAL_A_CODIGO: Record<string, string> = {
  renuncia: "159-2",
  mutuo_acuerdo: "159-1",
  vencimiento_plazo: "159-4",
  conclusion_obra: "159-5",
  necesidades_empresa: "161-1",
  conducta: "160-7",
  no_seguro: "",
};

export type EntradaFiniquito = {
  causal: string; // código, ej. "161-1"
  fechaInicio: string | null; // ISO YYYY-MM-DD
  fechaTermino: string | null;
  /** true = se avisó con 30 días de anticipación (no se paga mes de aviso). */
  avisoCon30Dias: boolean;
  sueldoBase: number; // fijo, o promedio últimos 3 meses si es variable
  gratificacion: number; // mensual
  otrasImponibles: number; // bonos, comisiones, etc. (promedio mensual)
  colacion: number;
  movilizacion: number;
  /** Incluir colación/movilización en la base Art. 172 (criterio CS). */
  incluirNoImponiblesEnBase: boolean;
  /** Valor UF para el tope de 90 UF; null = sin tope (advertencia en notas). */
  ufValor: number | null;
  zonaExtrema: boolean; // feriado anual de 20 días hábiles (Art. 67 inc. 2)
  diasTomados: number; // días hábiles de vacaciones ya tomados
  /** Override manual de los días hábiles ya devengados; null = automático. */
  diasObtenidosManual: number | null;
  remuneracionPendiente: number; // días trabajados del último mes, en $
  descuentoAfc: number; // aporte empleador AFC descontable (Art. 13 Ley 19.728)
  /** Anticipos de sueldo u otras sumas ya pagadas al trabajador que se descuentan del líquido. */
  descuentoAnticipos: number;
};

export type ResultadoFiniquito = {
  servicio: { anios: number; meses: number; dias: number } | null;
  aniosComputables: number;
  topeAniosAplicado: boolean;
  baseMensual: number;
  tope90Uf: number | null;
  topeUfAplicado: boolean;
  baseIndemnizatoria: number; // base con tope 90 UF aplicado
  tieneIndemnizacion: boolean; // según causal
  indemAviso: number;
  indemAnios: number;
  vacaciones: {
    factorMensual: number;
    obtenidos: number; // días hábiles devengados por años completos
    proporcionales: number; // días hábiles del período en curso
    tomados: number;
    saldoHabiles: number;
    diasInhabiles: number; // sáb/dom/feriados intercalados que también se pagan
    diasCorridosPago: number;
    valorDia: number;
    monto: number;
    coberturaFeriados: boolean;
  };
  remuneracionPendiente: number;
  descuentoAfc: number;
  descuentoAnticipos: number;
  total: number;
  notas: string[];
};

const DIA_MS = 24 * 60 * 60 * 1000;

function aUtc(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isoDe(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function esInhabilVacaciones(t: number): boolean {
  const dow = new Date(t).getUTCDay();
  return dow === 0 || dow === 6 || Boolean(FERIADOS_CHILE[isoDe(t)]);
}

/** Diferencia calendario entre dos fechas (la relación termina AL FIN del día de término). */
export function periodoServicio(
  inicioIso: string,
  terminoIso: string,
): { anios: number; meses: number; dias: number } | null {
  const ini = aUtc(inicioIso);
  const fin = terminoIso ? aUtc(terminoIso) : null;
  if (ini === null || fin === null || fin < ini) return null;

  const i = new Date(ini);
  // el día de término es trabajado: el período cubre hasta el día siguiente exclusivo
  const f = new Date(fin + DIA_MS);
  let anios = f.getUTCFullYear() - i.getUTCFullYear();
  let meses = f.getUTCMonth() - i.getUTCMonth();
  let dias = f.getUTCDate() - i.getUTCDate();
  if (dias < 0) {
    meses--;
    const ultimoDiaMesAnterior = new Date(
      Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), 0),
    ).getUTCDate();
    dias += ultimoDiaMesAnterior;
  }
  if (meses < 0) {
    anios--;
    meses += 12;
  }
  return { anios, meses, dias };
}

function redondear(n: number): number {
  return Math.round(n);
}

export function calcularFiniquito(e: EntradaFiniquito): ResultadoFiniquito {
  const notas: string[] = [];
  const causal = CAUSALES_FINIQUITO.find((c) => c.codigo === e.causal);
  const tieneIndemnizacion = causal?.indemnizacion ?? false;
  if (causal?.nota) notas.push(causal.nota);

  // ── Período de servicio ───────────────────────────────────────────────────
  const servicio =
    e.fechaInicio && e.fechaTermino
      ? periodoServicio(e.fechaInicio, e.fechaTermino)
      : null;

  let aniosComputables = 0;
  let topeAniosAplicado = false;
  if (servicio) {
    // Art. 163: la indemnización procede solo si el contrato estuvo vigente
    // UN AÑO O MÁS; cumplido el año, cada fracción > 6 meses suma un año.
    if (servicio.anios === 0) {
      aniosComputables = 0;
      if (tieneIndemnizacion) {
        notas.push(
          "Contrato vigente menos de un año: NO procede indemnización por años de servicio (Art. 163 inc. 1° — exige vigencia de un año o más). El mes de aviso sí procede.",
        );
      }
    } else {
      aniosComputables =
        servicio.anios +
        (servicio.meses > 6 || (servicio.meses === 6 && servicio.dias > 0) ? 1 : 0);
    }
    const sinTope = e.fechaInicio !== null && e.fechaInicio < "1981-08-14";
    if (aniosComputables > 11 && !sinTope) {
      aniosComputables = 11;
      topeAniosAplicado = true;
      notas.push(
        "Indemnización por años de servicio topada en 330 días (11 años, Art. 163 inc. 2°).",
      );
    }
    if (sinTope && servicio.anios > 11) {
      notas.push(
        "Contrato anterior al 14-08-1981: la indemnización por años de servicio NO tiene tope de 11 años.",
      );
    }
  }

  // ── Base de cálculo Art. 172 ──────────────────────────────────────────────
  const baseMensual =
    e.sueldoBase +
    e.gratificacion +
    e.otrasImponibles +
    (e.incluirNoImponiblesEnBase ? e.colacion + e.movilizacion : 0);

  const tope90Uf = e.ufValor !== null ? redondear(90 * e.ufValor) : null;
  const topeUfAplicado = tope90Uf !== null && baseMensual > tope90Uf;
  const baseIndemnizatoria = topeUfAplicado ? tope90Uf! : baseMensual;
  if (topeUfAplicado) {
    notas.push(
      "Base de cálculo topada en 90 UF (Art. 172) para las indemnizaciones por años de servicio y aviso previo.",
    );
  }
  if (e.ufValor === null && tieneIndemnizacion) {
    notas.push(
      "Sin UF del período cargada: el tope de 90 UF del Art. 172 no se está aplicando — cargar los Indicadores Previred del mes.",
    );
  }
  if (e.incluirNoImponiblesEnBase && e.colacion + e.movilizacion > 0) {
    notas.push(
      "Colación y movilización incluidas en la base indemnizatoria (criterio Corte Suprema sobre Art. 172; la DT las excluye — definible según el caso).",
    );
  }

  // ── Indemnizaciones ───────────────────────────────────────────────────────
  const indemAviso = tieneIndemnizacion && !e.avisoCon30Dias ? baseIndemnizatoria : 0;
  const indemAnios = tieneIndemnizacion ? baseIndemnizatoria * aniosComputables : 0;

  // ── Vacaciones (feriado pendiente + proporcional, Arts. 67/69/71/73) ─────
  const factorAnual = e.zonaExtrema ? 20 : 15;
  const factorMensual = factorAnual / 12;

  let obtenidos = 0;
  let proporcionales = 0;
  if (servicio) {
    obtenidos =
      e.diasObtenidosManual !== null
        ? e.diasObtenidosManual
        : servicio.anios * factorAnual;
    // Redondeado a 2 decimales ANTES de valorizar: se paga exactamente el
    // número de días que se muestra (misma práctica de los simuladores).
    proporcionales =
      Math.round((servicio.meses + servicio.dias / 30) * factorMensual * 100) / 100;
    if (e.diasObtenidosManual === null && servicio.anios >= 13) {
      notas.push(
        "Más de 13 años de servicio: revisar feriado progresivo (Art. 68 — 1 día hábil extra por cada 3 años sobre los primeros 10, contando también empleadores anteriores). Ajustar en 'días obtenidos' si aplica.",
      );
    }
  }
  const saldoHabiles = Math.max(0, obtenidos - e.diasTomados) + proporcionales;

  // Conversión hábiles → corridos: se pagan también los sáb/dom/feriados que
  // caerían dentro del período si las vacaciones se hubieran tomado a contar
  // del día siguiente al término.
  let diasInhabiles = 0;
  let coberturaFeriados = true;
  if (e.fechaTermino && saldoHabiles >= 1) {
    const inicio = aUtc(e.fechaTermino);
    if (inicio !== null) {
      let habilesPorConsumir = Math.floor(saldoHabiles);
      for (let t = inicio + DIA_MS; habilesPorConsumir > 0; t += DIA_MS) {
        const anio = new Date(t).getUTCFullYear();
        if (anio < FERIADOS_DESDE || anio > FERIADOS_HASTA) coberturaFeriados = false;
        if (esInhabilVacaciones(t)) diasInhabiles++;
        else habilesPorConsumir--;
      }
    }
  }
  const diasCorridosPago = saldoHabiles + diasInhabiles;

  // El feriado se paga con la remuneración íntegra (Art. 71): sueldo fijo +
  // promedio de remuneraciones variables. La gratificación queda SIEMPRE
  // fuera (es remuneración distinta del sueldo, Art. 42 — entra solo a la
  // base indemnizatoria Art. 172); colación/movilización tampoco van acá.
  const valorDia = (e.sueldoBase + e.otrasImponibles) / 30;
  const montoVacaciones = redondear(valorDia * diasCorridosPago);
  if (!coberturaFeriados) {
    notas.push(
      "Parte del período de conversión de vacaciones cae fuera del calendario de feriados cargado — el conteo de días inhábiles puede variar en 1-2 días.",
    );
  }

  if (e.descuentoAfc > 0) {
    notas.push(
      "Se descuenta el aporte del empleador a la cuenta individual AFC (Art. 13 Ley 19.728) — solo procede en despidos por Art. 161.",
    );
  }

  // Cálculos guardados antes de existir el campo no lo traen: tratar como 0.
  const descuentoAnticipos = e.descuentoAnticipos ?? 0;

  const total = redondear(
    e.remuneracionPendiente +
      indemAviso +
      indemAnios +
      montoVacaciones -
      e.descuentoAfc -
      descuentoAnticipos,
  );

  return {
    servicio,
    aniosComputables: tieneIndemnizacion ? aniosComputables : 0,
    topeAniosAplicado,
    baseMensual: redondear(baseMensual),
    tope90Uf,
    topeUfAplicado,
    baseIndemnizatoria: redondear(baseIndemnizatoria),
    tieneIndemnizacion,
    indemAviso: redondear(indemAviso),
    indemAnios: redondear(indemAnios),
    vacaciones: {
      factorMensual,
      obtenidos,
      proporcionales,
      tomados: e.diasTomados,
      saldoHabiles,
      diasInhabiles,
      diasCorridosPago,
      valorDia,
      monto: montoVacaciones,
      coberturaFeriados,
    },
    remuneracionPendiente: redondear(e.remuneracionPendiente),
    descuentoAfc: redondear(e.descuentoAfc),
    descuentoAnticipos: redondear(descuentoAnticipos),
    total,
    notas,
  };
}

/** Gratificación legal 25% con tope de 4,75 IMM ÷ 12 (Art. 50 CT). */
export function gratificacionLegalMensual(
  sueldoBase: number,
  otrasImponibles: number,
  imm: number | null,
): number {
  const veinticinco = 0.25 * (sueldoBase + otrasImponibles);
  if (imm === null) return Math.round(veinticinco);
  return Math.round(Math.min(veinticinco, (4.75 * imm) / 12));
}
