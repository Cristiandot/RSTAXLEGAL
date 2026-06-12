/**
 * Liquidación de ejemplo de un mes normal (sin novedades) para un contrato:
 * muestra el líquido estimado con las tasas reales del período (indicadores
 * Previred del panel). Referencial — la liquidación real depende del software
 * de remuneraciones y de las novedades del mes.
 */

export type TasaAfpPeriodo = { nombre: string; tasa_trabajador: number };

export type EntradaLiquidacionEjemplo = {
  sueldoBase: number;
  gratificacionTipo: string; // 'sin' | '25' | 'tope' | 'manual'
  gratificacionMonto: number;
  colacion: number;
  movilizacion: number;
  afp: string | null; // nombre de la AFP del trabajador
  salud: string | null; // 'Fonasa' o nombre de isapre
  tipoContrato: string; // 'plazo_fijo' | 'indefinido'
  imm: number; // ingreso mínimo mensual del período
  utm: number | null;
  tasasAfp: TasaAfpPeriodo[];
};

export type LiquidacionEjemplo = {
  sueldoBase: number;
  gratificacion: number;
  totalImponible: number;
  afpNombre: string | null;
  afpTasa: number | null;
  afpMonto: number;
  saludMonto: number;
  afcMonto: number;
  impuestoUnico: number;
  totalDescuentos: number;
  colacion: number;
  movilizacion: number;
  liquido: number;
  notas: string[];
};

/** Tramos mensuales del impuesto único de segunda categoría (en UTM). */
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
    if (tributable > piso) {
      impuesto += (Math.min(tributable, techo) - piso) * t.tasa;
    }
    piso = techo;
    if (tributable <= techo) break;
  }
  return Math.round(impuesto);
}

export function calcularLiquidacionEjemplo(
  e: EntradaLiquidacionEjemplo,
): LiquidacionEjemplo {
  const notas: string[] = [];

  const topeGratif = Math.round((4.75 * e.imm) / 12);
  const gratificacion =
    e.gratificacionTipo === "sin"
      ? 0
      : e.gratificacionTipo === "tope"
        ? topeGratif
        : e.gratificacionTipo === "manual"
          ? Math.round(e.gratificacionMonto)
          : Math.min(Math.round(e.sueldoBase * 0.25), topeGratif);
  if (e.gratificacionTipo === "25" && e.sueldoBase * 0.25 > topeGratif) {
    notas.push("Gratificación topada en 4,75 IMM ÷ 12.");
  }

  const totalImponible = e.sueldoBase + gratificacion;

  // AFP del trabajador, con la tasa real del período
  const buscado = (e.afp ?? "").toLowerCase().replace("afp", "").trim();
  const tasaAfp = buscado
    ? e.tasasAfp.find((t) => t.nombre.toLowerCase().includes(buscado) || buscado.includes(t.nombre.toLowerCase()))
    : undefined;
  const afpMonto = tasaAfp ? Math.round((totalImponible * tasaAfp.tasa_trabajador) / 100) : 0;
  if (!tasaAfp) {
    notas.push(
      e.afp
        ? `AFP "${e.afp}" no identificada en los indicadores — el ejemplo no descuenta AFP.`
        : "Trabajador sin AFP registrada — el ejemplo no descuenta AFP (¿pensionado?).",
    );
  }

  const saludMonto = Math.round(totalImponible * 0.07);
  if (e.salud && e.salud.toLowerCase() !== "fonasa") {
    notas.push(
      `Salud calculada con el 7% legal; el plan de ${e.salud} puede ser mayor (diferencia es descuento adicional).`,
    );
  }

  const esIndefinido = e.tipoContrato !== "plazo_fijo";
  const afcMonto = esIndefinido ? Math.round(totalImponible * 0.006) : 0;
  if (!esIndefinido) {
    notas.push("Plazo fijo: el trabajador no cotiza AFC (el 3% es íntegro del empleador).");
  }

  const tributable = totalImponible - afpMonto - saludMonto - afcMonto;
  const impuesto = e.utm ? impuestoUnico(tributable, e.utm) : 0;
  if (!e.utm) notas.push("Sin UTM del período cargada — no se estimó impuesto único.");

  const totalDescuentos = afpMonto + saludMonto + afcMonto + impuesto;
  const liquido = totalImponible - totalDescuentos + e.colacion + e.movilizacion;

  return {
    sueldoBase: e.sueldoBase,
    gratificacion,
    totalImponible,
    afpNombre: tasaAfp?.nombre ?? e.afp,
    afpTasa: tasaAfp?.tasa_trabajador ?? null,
    afpMonto,
    saludMonto,
    afcMonto,
    impuestoUnico: impuesto,
    totalDescuentos,
    colacion: e.colacion,
    movilizacion: e.movilizacion,
    liquido,
    notas,
  };
}
