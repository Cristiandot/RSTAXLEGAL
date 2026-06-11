/**
 * Catálogo de tipos de permiso laboral — común a todos los clientes.
 * Estructura traída del sistema de vacaciones/permisos de Red Barrera
 * (los permisos NO descuentan saldo de feriado; los sin goce descuentan
 * remuneración, los legales con goce no descuentan nada).
 *
 * `goce`: "con" | "sin" cuando el tipo lo fija (los legales son con goce por
 * ley y no se pueden pactar en contrario); null cuando lo decide el empleador.
 */
export type TipoPermiso = {
  value: string;
  label: string;
  goce: "con" | "sin" | null;
  goceDefault: "con" | "sin";
  nota?: string;
};

export const TIPOS_PERMISO: TipoPermiso[] = [
  {
    value: "sin_goce",
    label: "Permiso sin goce de remuneraciones",
    goce: "sin",
    goceDefault: "sin",
    nota: "Se descuenta de la remuneración del mes; no descuenta vacaciones.",
  },
  {
    value: "con_goce",
    label: "Permiso con goce de remuneraciones (acordado con el empleador)",
    goce: "con",
    goceDefault: "con",
  },
  {
    value: "administrativo",
    label: "Día administrativo",
    goce: null,
    goceDefault: "con",
  },
  {
    value: "matrimonio",
    label: "Matrimonio o acuerdo de unión civil (Art. 207 bis CT)",
    goce: "con",
    goceDefault: "con",
    nota: "5 días hábiles continuos con goce, irrenunciables.",
  },
  {
    value: "nacimiento",
    label: "Nacimiento de hijo/a — permiso del padre (Art. 195 CT)",
    goce: "con",
    goceDefault: "con",
    nota: "5 días pagados, a elección desde el parto o dentro del primer mes.",
  },
  {
    value: "fallecimiento",
    label: "Fallecimiento de familiar (Art. 66 CT)",
    goce: "con",
    goceDefault: "con",
    nota: "Los días dependen del parentesco — indícalo en observaciones; el equipo confirma los días que corresponden.",
  },
  {
    value: "medico",
    label: "Médico / trámite de salud",
    goce: null,
    goceDefault: "sin",
  },
  {
    value: "judicial",
    label: "Citación judicial / trámite legal",
    goce: null,
    goceDefault: "sin",
  },
  {
    value: "compensacion",
    label: "Compensación de horas extras",
    goce: "con",
    goceDefault: "con",
    nota: "No afecta remuneración: se compensa con horas ya trabajadas.",
  },
  {
    value: "otro",
    label: "Otro (detallar en observaciones)",
    goce: null,
    goceDefault: "sin",
  },
];

export const TIPO_PERMISO_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_PERMISO.map((t) => [t.value, t.label]),
);
