/**
 * Control de vacaciones Red Barrera — lógica compartida (cliente y servidor).
 *
 * Reglas operativas del sistema (origen: PROMPT MAESTRO / INICIO RAPIDO del
 * cliente A.4 Red Barrera):
 * - Los saldos viven por período de devengo ("2024-2025") más una bolsa de
 *   días "progresivos" (Art. 68 CT).
 * - Al emitir papeleta se consumen primero los progresivos y después los
 *   períodos normales del más antiguo al más nuevo, salvo instrucción expresa.
 * - El sábado es inhábil para el feriado (Art. 69 inc. 2° CT), salvo dos
 *   escenarios operativos del cliente: sábado como único día solicitado, o
 *   sábado como primer día del feriado (jornadas Lu-Sá).
 * - Correlativos PAP/PER/REC estrictamente secuenciales; nunca se reutilizan.
 */

import { calcularVacaciones } from "@/lib/feriados";

export const PERIODO_PROGRESIVOS = "progresivos";

/** Períodos conocidos, del más antiguo al más nuevo. */
export const PERIODOS_BASE = [
  "2022-2023",
  "2023-2024",
  "2024-2025",
  "2025-2026",
  "2026-2027",
  "2027-2028",
];

export const TIPOS_PERMISO = [
  "Permiso sin goce de remuneraciones",
  "Permiso con goce de remuneraciones",
  "Permiso administrativo",
  "Matrimonio / AUC (Art. 207 bis CT)",
  "Nacimiento de hijo/a (Art. 195 inc. 2° CT)",
  "Fallecimiento de familiar (Art. 66 CT)",
  "Médico / trámite de salud",
  "Citación judicial / trámite legal",
  "Compensación de horas extras",
  "Otro",
];

export const TIPOS_ASISTENCIA = [
  "Ausencia día completo",
  "Atraso o Descuento horario",
  "Licencia médica",
  "Otro",
];

export type SaldoTrabajador = {
  trabajadorId: string;
  nombre: string;
  rut: string;
  cargo: string | null;
  sucursal: string;
  fechaIngreso: string | null;
  activo: boolean;
  /** periodo -> días (incluye "progresivos") */
  saldos: Record<string, number>;
  total: number;
};

export type DocumentoRow = {
  id: string;
  tipo: "PAP" | "PER" | "REC";
  correlativo: string;
  fechaEmision: string;
  trabajadorNombre: string;
  trabajadorRut: string;
  sucursal: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  dias: number | null;
  desgloseTexto: string | null;
  saldoAnterior: number | null;
  saldoFinal: number | null;
  permisoTipo: string | null;
  conGoce: boolean | null;
  unidad: string | null;
  cantidad: number | null;
  respaldo: string | null;
  observacion: string | null;
  estado: "vigente" | "anulado";
  anulacionMotivo: string | null;
  reemplazadoPor: string | null;
  pdfPath: string | null;
  pdfNombre: string | null;
  origen: "excel" | "panel";
};

/**
 * Días hábiles de vacaciones entre dos fechas para Red Barrera.
 * `sabadoHabilInicio`: aplica la regla operativa del cliente — si el rango
 * parte en sábado (o es un sábado único), ese primer sábado cuenta como hábil.
 * Los sábados intermedios y finales siguen siendo inhábiles siempre.
 */
export function calcularDiasHabilesRB(
  desdeIso: string,
  hastaIso: string,
  sabadoHabilInicio: boolean,
): { dias: number; feriados: { fecha: string; nombre: string }[]; cobertura: boolean } | null {
  const base = calcularVacaciones(desdeIso, hastaIso);
  if (!base) return null;
  let dias = base.diasHabiles;
  if (sabadoHabilInicio) {
    const dow = new Date(desdeIso + "T00:00:00Z").getUTCDay();
    if (dow === 6) dias += 1;
  }
  return { dias, feriados: base.feriadosEnRango, cobertura: base.coberturaCompleta };
}

/**
 * Sugerencia de desglose "progresivos primero, luego períodos del más antiguo
 * al más nuevo". Devuelve null si el saldo total no alcanza.
 */
export function sugerirDesglose(
  saldos: Record<string, number>,
  diasNecesarios: number,
): Record<string, number> | null {
  const orden = [PERIODO_PROGRESIVOS, ...PERIODOS_BASE];
  const out: Record<string, number> = {};
  let falta = diasNecesarios;
  for (const per of orden) {
    if (falta <= 0) break;
    const disp = saldos[per] ?? 0;
    if (disp <= 0) continue;
    const toma = Math.min(disp, falta);
    out[per] = toma;
    falta = redondear2(falta - toma);
  }
  return falta > 0 ? null : out;
}

export function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "2024-2025: 4, progresivos: 2 (imputados a 2024-2025)" para bitácora y PDF. */
export function desgloseATexto(
  items: Record<string, number>,
  progresivosPeriodo?: string | null,
): string {
  const partes: string[] = [];
  const prog = items[PERIODO_PROGRESIVOS];
  if (prog) {
    partes.push(
      `progresivos: ${formatDias(prog)}` +
        (progresivosPeriodo ? ` (imputados a ${progresivosPeriodo})` : ""),
    );
  }
  for (const per of PERIODOS_BASE) {
    if (items[per]) partes.push(`${per}: ${formatDias(items[per])}`);
  }
  return partes.join(", ");
}

/** Tipo de días para el PDF: Normal / Progresivo / Mixto. */
export function tipoDeDias(items: Record<string, number>): string {
  const tieneProg = (items[PERIODO_PROGRESIVOS] ?? 0) > 0;
  const tieneNormal = PERIODOS_BASE.some((p) => (items[p] ?? 0) > 0);
  if (tieneProg && tieneNormal) return "Mixto (Normal + Progresivo)";
  if (tieneProg) return "Progresivo";
  return "Normal";
}

export function formatDias(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}

/** DD/MM/YYYY para PDFs y grillas (fechas ISO). */
export function fechaCl(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/* ---------------- Regla dual de períodos (cierre Nubox) ----------------
 * Inasistencias, permisos y atrasos se asignan al cierre comercial Nubox
 * (21 del mes anterior al 20 del mes). Vacaciones y licencias médicas se
 * computan por mes calendario natural. */

/** Ventana del cierre Nubox de un mes 'YYYY-MM': 21 del mes anterior al 20. */
export function ventanaCierreNubox(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number);
  const prevA = m === 1 ? a - 1 : a;
  const prevM = m === 1 ? 12 : m - 1;
  return {
    desde: `${prevA}-${String(prevM).padStart(2, "0")}-21`,
    hasta: `${a}-${String(m).padStart(2, "0")}-20`,
  };
}

/** Rango del mes calendario 'YYYY-MM'. */
export function ventanaMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

/** true si iso cae dentro de [desde, hasta] (comparación lexicográfica ISO). */
export function fechaEnRango(iso: string | null | undefined, desde: string, hasta: string): boolean {
  return !!iso && iso >= desde && iso <= hasta;
}

/**
 * Días corridos del rango [desdeIso, hastaIso] que caen dentro de [vDesde,
 * vHasta]. Para el promedio Art. 71 CT el pago se calcula sobre días corridos
 * del feriado dentro del período de cierre, no sobre días hábiles.
 */
export function diasCorridosEnVentana(
  desdeIso: string | null,
  hastaIso: string | null,
  vDesde: string,
  vHasta: string,
): number {
  if (!desdeIso || !hastaIso) return 0;
  const ini = desdeIso > vDesde ? desdeIso : vDesde;
  const fin = hastaIso < vHasta ? hastaIso : vHasta;
  if (ini > fin) return 0;
  const ms = Date.parse(fin + "T00:00:00Z") - Date.parse(ini + "T00:00:00Z");
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Aniversario del contrato en un año dado y período que devenga.
 * El período "YYYY-(YYYY+1)" se devenga AL CUMPLIRSE el aniversario del
 * segundo año (nomenclatura INICIO RAPIDO sección 2).
 */
export function aniversarioDe(fechaIngresoIso: string, anio: number): { fecha: string; periodo: string } {
  return {
    fecha: `${anio}-${fechaIngresoIso.slice(5, 10)}`,
    periodo: `${anio - 1}-${anio}`,
  };
}
