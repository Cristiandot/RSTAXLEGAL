/** Catálogos y helpers del módulo de licencias médicas. */

export const TIPO_LICENCIA_LABEL: Record<string, string> = {
  nueva: "Licencia nueva",
  continuacion: "Continuación",
  prenatal: "Prenatal",
  postnatal: "Postnatal",
  otra: "Otra",
};

export const ESTADO_LICENCIA_LABEL: Record<string, string> = {
  por_tramitar: "Por tramitar",
  tramitada: "Tramitada",
  rechazada: "Rechazada",
  apelada: "Apelada",
};

export function claseEstadoLicencia(estado: string): string {
  switch (estado) {
    case "tramitada":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rechazada":
      return "border-red-200 bg-red-50 text-red-600";
    case "apelada":
      return "border-violet-200 bg-violet-50 text-violet-700";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

/** Una licencia está vigente si hoy cae dentro de [inicio, término]. */
export function licenciaVigente(
  fechaInicio: string | null,
  fechaTermino: string | null,
  hoyISO: string,
): boolean {
  if (!fechaInicio || !fechaTermino) return false;
  return fechaInicio <= hoyISO && hoyISO <= fechaTermino;
}

/** Días corridos entre dos fechas ISO, ambas inclusive. */
export function diasEntre(inicioISO: string, terminoISO: string): number | null {
  const i = Date.parse(inicioISO);
  const t = Date.parse(terminoISO);
  if (Number.isNaN(i) || Number.isNaN(t) || t < i) return null;
  return Math.round((t - i) / 86400000) + 1;
}
