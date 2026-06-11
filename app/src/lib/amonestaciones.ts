/**
 * Motivos estándar de carta de amonestación (sanción del Art. 154 N°10 y
 * Art. 157 CT, según Reglamento Interno). Catálogo compartido entre el portal
 * público de solicitudes y la bandeja /gestiones.
 */
export const MOTIVOS_AMONESTACION: { value: string; label: string }[] = [
  { value: "atrasos", label: "Atrasos reiterados" },
  { value: "inasistencia", label: "Inasistencia injustificada (no llegó ni avisó)" },
  { value: "abandono", label: "Abandono del puesto / se retiró antes del término del turno" },
  { value: "no_marcar", label: "No registró asistencia (o marcó por otra persona)" },
  { value: "incumplimiento", label: "Incumplimiento de instrucciones o funciones" },
  { value: "seguridad", label: "Incumplimiento de normas de seguridad / no uso de EPP" },
  { value: "celular", label: "Uso de celular o dispositivos en horario de trabajo" },
  { value: "respeto", label: "Falta de respeto a jefatura, compañeros o clientes" },
  { value: "presentacion", label: "Presentación personal / no uso de uniforme" },
  { value: "caja", label: "Faltantes o errores de procedimiento de caja" },
  { value: "otro", label: "Otro motivo (descríbelo abajo)" },
];

export const MOTIVO_AMONESTACION_LABEL: Record<string, string> =
  Object.fromEntries(MOTIVOS_AMONESTACION.map((m) => [m.value, m.label]));
