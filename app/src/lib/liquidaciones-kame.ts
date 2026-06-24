/**
 * Catálogos de opciones del módulo de liquidaciones (espejan los desplegables de
 * KAME). Compartidos entre la UI de carga de empleados y la configuración de
 * empresa. Las instituciones APV usan el catálogo codificado de Previred (no acá).
 */

export const MUTUALES = [
  { value: "ISL", label: "Sin Mutual (ISL)" },
  { value: "ACHS", label: "Asociación Chilena de Seguridad (ACHS)" },
  { value: "Mutual CChC", label: "Mutual de Seguridad CChC" },
  { value: "IST", label: "Instituto de Seguridad del Trabajo (IST)" },
] as const;

export const CAJAS_COMPENSACION = [
  "Sin CCAF",
  "Los Andes",
  "La Araucana",
  "Los Héroes",
  "Gabriela Mistral",
  "18 de Septiembre",
] as const;

export const SEXOS = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
] as const;

export const TIPOS_TRABAJADOR = [
  { value: "activo", label: "Activo (No Pensionado)" },
  { value: "pensionado_cotiza", label: "Pensionado y cotiza" },
  { value: "pensionado_no_cotiza", label: "Pensionado y no cotiza" },
  { value: "activo_mayor65", label: "Activo > 65 años (nunca pensionado)" },
] as const;

export const REGIMENES_PREVISIONALES = [
  { value: "afp", label: "AFP" },
  { value: "ips", label: "IPS (ex-INP)" },
  { value: "sip", label: "SIP" },
] as const;

export const JORNADAS = [
  { value: "completa", label: "Completa" },
  { value: "parcial", label: "Parcial" },
] as const;

export const TIPOS_IMPUESTO_RENTA = [
  { value: "segunda_categoria", label: "Impuesto de Segunda Categoría" },
  { value: "unico_obrero_agricola", label: "Impuesto Único Obrero Agrícola" },
  { value: "adicional", label: "Impuesto Adicional" },
] as const;

export const DISCAPACIDAD = [
  { value: "no", label: "No" },
  { value: "discapacidad_compin", label: "Discapacidad certificada por la COMPIN" },
  { value: "asignatario_invalidez_total", label: "Asignatario pensión por invalidez total" },
  { value: "pensionado_invalidez_parcial", label: "Pensionado con invalidez parcial" },
] as const;

export const SALUD_OPCIONES = [
  "Fonasa",
  "Sin Isapre",
  "Banmédica",
  "Consalud",
  "VidaTres",
  "Colmena",
  "Isapre Cruz Blanca S.A.",
  "Chuquicamata",
  "Nueva Masvida",
  "Institución de Salud Previsional Fusat Ltda.",
  "Isapre Bco. Estado",
  "Río Blanco",
  "San Lorenzo isapre Ltda.",
  "Cruz del Norte",
  "Esencial",
  "Isapre de Codelco",
] as const;

export const NATURALEZAS_CONCEPTO = [
  { value: "haber_imponible", label: "Bono imponible" },
  { value: "haber_no_imponible", label: "Bono no imponible" },
  { value: "descuento", label: "Descuento" },
] as const;

/** Columnas LRE (DT) por naturaleza del concepto. */
export const COLUMNAS_LRE: Record<string, string[]> = {
  haber_imponible: [
    "Bonos u otras remun. fijas mensuales",
    "Bonos u otras remun. variables mensuales o superiores a un mes",
    "Comisiones",
    "Aguinaldo",
    "Semana corrida",
    "Recargo 30% día domingo",
    "Tratos",
  ],
  haber_no_imponible: [
    "Colación",
    "Movilización",
    "Viáticos",
    "Asignación de pérdida de caja",
    "Asignación de desgaste herramienta",
    "Sala cuna",
    "Asignación trabajo a distancia o teletrabajo",
    "Gastos por causa del trabajo",
    "Asignación de traslación",
    "Alojamiento por razones de trabajo",
  ],
  descuento: [
    "Otros descuentos autorizados y solicitados por el trabajador",
    "Otros descuentos",
    "Descuentos por anticipos y préstamos",
    "Pensiones de alimentos",
    "Cuota sindical",
    "Crédito Cooperativas de Ahorro",
  ],
};

export const TIPOS_MOVIMIENTO = [
  { value: "sin_movimiento", label: "Sin movimiento en el mes" },
  { value: "contratacion_indefinido", label: "Contratación a plazo indefinido" },
  { value: "retiro", label: "Retiro" },
  { value: "subsidios", label: "Subsidios" },
  { value: "permiso_sin_goce", label: "Permiso Sin Goce de Sueldos" },
  { value: "incorporacion", label: "Incorporación en el Lugar de Trabajo" },
  { value: "accidente", label: "Accidentes del Trabajo" },
  { value: "contratacion_plazo_fijo", label: "Contratación a Plazo Fijo" },
  { value: "cambio_plazo_indefinido", label: "Cambio contrato plazo fijo a indefinido" },
  { value: "otros_ausentismos", label: "Otros Movimientos (ausentismos)" },
  { value: "reliquidacion_premio_bono", label: "Reliquidación, Premio, Bono" },
] as const;
