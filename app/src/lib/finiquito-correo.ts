import { FERIADOS_CHILE, FERIADOS_DESDE, FERIADOS_HASTA } from "./feriados";
import { formatFecha, formatMonto } from "./format";

/**
 * Correo listo para el cliente + seguimiento del plazo del Art. 177 CT.
 *
 * Plazo Art. 177 inc. 4°: el finiquito debe ser otorgado y su pago puesto a
 * disposición del trabajador dentro de 10 días HÁBILES contados desde la
 * separación. Para este plazo el sábado ES hábil (solo el Art. 69 declara el
 * sábado inhábil, y exclusivamente "para los efectos del feriado"); se
 * excluyen domingos y feriados legales.
 */

const DIA_MS = 86_400_000;

function aUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function isoDe(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function esInhabilArt177(t: number): boolean {
  return new Date(t).getUTCDay() === 0 || Boolean(FERIADOS_CHILE[isoDe(t)]);
}

export type PlazoArt177 = {
  /** Fecha límite ISO para suscribir y pagar (10° día hábil desde la separación). */
  fechaLimite: string;
  /** false si el conteo cruzó años fuera de la tabla de feriados. */
  coberturaCompleta: boolean;
};

/** Fecha límite del Art. 177 a partir del ÚLTIMO DÍA TRABAJADO. */
export function plazoArt177(fechaTerminoIso: string): PlazoArt177 | null {
  const termino = aUtc(fechaTerminoIso);
  if (termino === null) return null;
  let habiles = 0;
  let coberturaCompleta = true;
  let t = termino;
  while (habiles < 10) {
    t += DIA_MS;
    const anio = new Date(t).getUTCFullYear();
    if (anio < FERIADOS_DESDE || anio > FERIADOS_HASTA) coberturaCompleta = false;
    if (!esInhabilArt177(t)) habiles++;
  }
  return { fechaLimite: isoDe(t), coberturaCompleta };
}

/** Días corridos que faltan para la fecha límite (negativo = vencido). */
export function diasParaLimite(fechaLimiteIso: string, hoyIso: string): number {
  const limite = aUtc(fechaLimiteIso);
  const hoy = aUtc(hoyIso);
  if (limite === null || hoy === null) return 0;
  return Math.round((limite - hoy) / DIA_MS);
}

// ── Correo para el cliente ───────────────────────────────────────────────────

const CAUSAL_FRASE: Record<string, string> = {
  renuncia: "quien presentó su renuncia voluntaria",
  mutuo_acuerdo: "cuyo contrato termina por mutuo acuerdo de las partes (Art. 159 N°1 CT)",
  vencimiento_plazo: "cuyo contrato a plazo fijo vence y no será renovado (Art. 159 N°4 CT)",
  conclusion_obra: "por conclusión de la obra o servicio que dio origen al contrato (Art. 159 N°5 CT)",
  necesidades_empresa: "cuyo contrato termina por necesidades de la empresa (Art. 161 CT)",
  conducta: "cuyo contrato termina por la causal de conducta invocada (Art. 160 CT)",
};

export type ResumenCorreo = {
  remuneracionPendiente: number;
  vacacionesMonto: number;
  vacacionesDias: number;
  indemAviso: number;
  indemAnios: number;
  /** Anticipos ya pagados que se descuentan del total (cálculos antiguos no lo traen). */
  descuentoAnticipos?: number;
  total: number;
};

export type DatosCorreoFiniquito = {
  trabajador: string;
  rut: string;
  causal: string; // valor del portal
  fechaTermino: string | null;
  resumen: ResumenCorreo;
};

/** Texto plano listo para pegar en el correo al dueño/contraparte. */
export function textoCorreoFiniquito(d: DatosCorreoFiniquito): string {
  const frase = CAUSAL_FRASE[d.causal] ?? "cuyo contrato de trabajo termina";
  const limite = d.fechaTermino ? plazoArt177(d.fechaTermino) : null;
  const r = d.resumen;

  const lineas: string[] = [
    "Estimado,",
    "",
    `Adjunto información para finiquito de ${d.trabajador}, ${frase}. Indíquennos si quieren suscribirlo por notaría o por la Dirección del Trabajo (finiquito laboral electrónico).`,
    "",
    `CÁLCULO DEL FINIQUITO — ${d.trabajador} (${d.rut})`,
  ];
  if (d.fechaTermino) {
    lineas.push(`Último día trabajado: ${formatFecha(d.fechaTermino)}`);
  }
  lineas.push("");
  if (r.remuneracionPendiente > 0) {
    lineas.push(`· Remuneración pendiente (líquido): ${formatMonto(r.remuneracionPendiente)}`);
  }
  if (r.vacacionesMonto > 0) {
    lineas.push(
      `· Feriado proporcional (${r.vacacionesDias.toLocaleString("es-CL")} días corridos): ${formatMonto(r.vacacionesMonto)}`,
    );
  }
  if (r.indemAnios > 0) {
    lineas.push(`· Indemnización por años de servicio: ${formatMonto(r.indemAnios)}`);
  }
  if (r.indemAviso > 0) {
    lineas.push(`· Indemnización sustitutiva del aviso previo: ${formatMonto(r.indemAviso)}`);
  }
  if ((r.descuentoAnticipos ?? 0) > 0) {
    lineas.push(`· Descuento anticipos ya pagados: − ${formatMonto(r.descuentoAnticipos ?? 0)}`);
  }
  lineas.push(`TOTAL FINIQUITO A PAGO: ${formatMonto(r.total)}`);
  lineas.push("");
  if (limite) {
    lineas.push(
      `Plazo legal: el finiquito debe estar suscrito y su pago a disposición del trabajador a más tardar el ${formatFecha(limite.fechaLimite)} (10 días hábiles desde la separación, Art. 177 CT). Para la firma, las cotizaciones previsionales deben estar al día.`,
    );
    lineas.push("");
  }
  lineas.push("Quedamos atentos,");
  lineas.push("RS Tax & Legal");
  return lineas.join("\n");
}
