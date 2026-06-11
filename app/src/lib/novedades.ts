/**
 * Catálogo de novedades de remuneraciones del mes — lo que el cliente informa
 * por el portal y que NO viaja por gestiones (permisos, vacaciones y
 * finiquitos van por el panel de solicitudes y acá solo se muestran).
 * Estructura tomada del Excel de remuneraciones compartido (hojas Ausencias /
 * Horas Especiales / consolidado mensual).
 */
export type TipoNovedad = {
  value: string;
  label: string;
  /** Qué campos pide: horas (fecha + cantidad), rango (desde/hasta), monto ($). */
  campos: "horas" | "rango" | "monto";
  hint?: string;
};

export const TIPOS_NOVEDAD: TipoNovedad[] = [
  {
    value: "hora_extra",
    label: "Horas extra",
    campos: "horas",
    hint: "Horas trabajadas sobre la jornada pactada (recargo legal 50%).",
  },
  {
    value: "feriado",
    label: "Horas trabajadas en día feriado",
    campos: "horas",
    hint: "Se pagan con el recargo pactado de la empresa.",
  },
  {
    value: "domingo",
    label: "Horas trabajadas en día domingo",
    campos: "horas",
    hint: "Se pagan con el recargo pactado de la empresa.",
  },
  {
    value: "licencia",
    label: "Licencia médica",
    campos: "rango",
    hint: "Indica desde y hasta según el documento de la licencia.",
  },
  {
    value: "anticipo",
    label: "Anticipo de sueldo",
    campos: "monto",
  },
  {
    value: "bono",
    label: "Bono (indica cuál en el comentario)",
    campos: "monto",
  },
  {
    value: "descuento",
    label: "Descuento (ej. pérdida de caja)",
    campos: "monto",
  },
];

export const TIPO_NOVEDAD_LABEL: Record<string, string> = Object.fromEntries(
  TIPOS_NOVEDAD.map((t) => [t.value, t.label]),
);
