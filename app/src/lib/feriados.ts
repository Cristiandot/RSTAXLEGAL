/**
 * Feriados legales de Chile y cálculo de días hábiles de vacaciones.
 *
 * Para el feriado anual (vacaciones) los días se cuentan en días hábiles y el
 * sábado se considera SIEMPRE inhábil (Art. 69 CT), igual que domingos y
 * feriados legales (Art. 67 y ss. CT).
 *
 * La tabla incluye los traslados de lunes de la Ley 19.668 (San Pedro y San
 * Pablo, Encuentro de Dos Mundos), el traslado a viernes de la Ley 20.299
 * (Iglesias Evangélicas) y el solsticio de la Ley 21.357 (Pueblos Indígenas).
 * NO puede incluir feriados que se decreten a futuro (elecciones, censos,
 * feriados regionales) — por eso el equipo revisa antes de emitir la papeleta.
 * Extender la tabla antes de FERIADOS_HASTA.
 */

export const FERIADOS_DESDE = 2026;
export const FERIADOS_HASTA = 2028;

/**
 * Feriados obligatorios e IRRENUNCIABLES para los trabajadores del comercio
 * (Ley 19.973): 1 de enero, 1 de mayo, 18 y 19 de septiembre y 25 de
 * diciembre. Se marcan por MM-DD porque se repiten todos los años.
 */
export const FERIADOS_IRRENUNCIABLES_MM_DD = new Set([
  "01-01",
  "05-01",
  "09-18",
  "09-19",
  "12-25",
]);

export type FeriadoMes = {
  fecha: string; // ISO YYYY-MM-DD
  dia: number;
  nombre: string;
  irrenunciable: boolean;
};

/** Feriados legales de un mes (periodo YYYY-MM), con flag de irrenunciable. */
export function feriadosDelMes(periodo: string): FeriadoMes[] {
  return Object.entries(FERIADOS_CHILE)
    .filter(([fecha]) => fecha.startsWith(periodo + "-"))
    .map(([fecha, nombre]) => ({
      fecha,
      dia: Number(fecha.slice(8, 10)),
      nombre,
      irrenunciable: FERIADOS_IRRENUNCIABLES_MM_DD.has(fecha.slice(5)),
    }))
    .sort((a, b) => a.dia - b.dia);
}

export const FERIADOS_CHILE: Record<string, string> = {
  // 2026
  "2026-01-01": "Año Nuevo",
  "2026-04-03": "Viernes Santo",
  "2026-04-04": "Sábado Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-21": "Día de las Glorias Navales",
  "2026-06-21": "Día Nacional de los Pueblos Indígenas",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-16": "Día de la Virgen del Carmen",
  "2026-08-15": "Asunción de la Virgen",
  "2026-09-18": "Fiestas Patrias",
  "2026-09-19": "Día de las Glorias del Ejército",
  "2026-10-12": "Encuentro de Dos Mundos",
  "2026-10-31": "Día de las Iglesias Evangélicas y Protestantes",
  "2026-11-01": "Día de Todos los Santos",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
  // 2027
  "2027-01-01": "Año Nuevo",
  "2027-03-26": "Viernes Santo",
  "2027-03-27": "Sábado Santo",
  "2027-05-01": "Día del Trabajo",
  "2027-05-21": "Día de las Glorias Navales",
  "2027-06-21": "Día Nacional de los Pueblos Indígenas",
  "2027-06-28": "San Pedro y San Pablo (trasladado)",
  "2027-07-16": "Día de la Virgen del Carmen",
  "2027-08-15": "Asunción de la Virgen",
  "2027-09-18": "Fiestas Patrias",
  "2027-09-19": "Día de las Glorias del Ejército",
  "2027-10-11": "Encuentro de Dos Mundos (trasladado)",
  "2027-10-31": "Día de las Iglesias Evangélicas y Protestantes",
  "2027-11-01": "Día de Todos los Santos",
  "2027-12-08": "Inmaculada Concepción",
  "2027-12-25": "Navidad",
  // 2028
  "2028-01-01": "Año Nuevo",
  "2028-04-14": "Viernes Santo",
  "2028-04-15": "Sábado Santo",
  "2028-05-01": "Día del Trabajo",
  "2028-05-21": "Día de las Glorias Navales",
  "2028-06-20": "Día Nacional de los Pueblos Indígenas",
  "2028-06-26": "San Pedro y San Pablo (trasladado)",
  "2028-07-16": "Día de la Virgen del Carmen",
  "2028-08-15": "Asunción de la Virgen",
  "2028-09-18": "Fiestas Patrias",
  "2028-09-19": "Día de las Glorias del Ejército",
  "2028-10-09": "Encuentro de Dos Mundos (trasladado)",
  "2028-10-27": "Día de las Iglesias Evangélicas y Protestantes (trasladado)",
  "2028-11-01": "Día de Todos los Santos",
  "2028-12-08": "Inmaculada Concepción",
  "2028-12-25": "Navidad",
};

const DIA_MS = 86_400_000;

/** ISO `YYYY-MM-DD` → epoch UTC a medianoche, o null si no parsea. */
function aUtc(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

function esFinDeSemana(t: number): boolean {
  const dow = new Date(t).getUTCDay();
  return dow === 0 || dow === 6;
}

function isoDe(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export type CalculoVacaciones = {
  /** Días hábiles de vacaciones que consume el rango (lun-vie sin feriados). */
  diasHabiles: number;
  /** Feriados legales que caen en día de semana dentro del rango (no se cuentan). */
  feriadosEnRango: { fecha: string; nombre: string }[];
  /** Primer día hábil posterior al término — día de reintegro al trabajo. */
  fechaRegreso: string | null;
  /** false si parte del rango cae fuera de la tabla de feriados. */
  coberturaCompleta: boolean;
};

/** Calcula los días hábiles de vacaciones entre dos fechas inclusive. */
export function calcularVacaciones(
  inicioIso: string,
  finIso: string,
): CalculoVacaciones | null {
  const ini = aUtc(inicioIso);
  const fin = aUtc(finIso);
  if (ini === null || fin === null || fin < ini) return null;

  let diasHabiles = 0;
  let coberturaCompleta = true;
  const feriadosEnRango: { fecha: string; nombre: string }[] = [];

  for (let t = ini; t <= fin; t += DIA_MS) {
    const anio = new Date(t).getUTCFullYear();
    if (anio < FERIADOS_DESDE || anio > FERIADOS_HASTA) coberturaCompleta = false;
    if (esFinDeSemana(t)) continue;
    const iso = isoDe(t);
    const feriado = FERIADOS_CHILE[iso];
    if (feriado) {
      feriadosEnRango.push({ fecha: iso, nombre: feriado });
      continue;
    }
    diasHabiles++;
  }

  let fechaRegreso: string | null = null;
  for (let t = fin + DIA_MS, i = 0; i < 60; t += DIA_MS, i++) {
    if (esFinDeSemana(t) || FERIADOS_CHILE[isoDe(t)]) continue;
    fechaRegreso = isoDe(t);
    break;
  }

  return { diasHabiles, feriadosEnRango, fechaRegreso, coberturaCompleta };
}
