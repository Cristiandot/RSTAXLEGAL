/**
 * Exportación masiva de finiquitos al CSV del Finiquito Laboral Electrónico
 * de la DT (instructivo v4.0, abril 2026). Funciones puras: el armado de cada
 * fila valida los campos obligatorios de la plantilla y reporta faltantes
 * para completar en el Excel antes de subir (máx. 100 filas por archivo).
 */

/** Encabezado EXACTO de la plantilla oficial (48 columnas, separador ";"). */
export const HEADER_DT =
  "RutEmpresa;RutTrabajador;FechaInicioContrato;FechaTerminoContrato;DeclaraNotificacionRetencionAlimento;CausalFiniquitoId;Funciones;RegionTrabajoId;ComunaId;LugarPrestacionServiciosDireccion;CantidadDiasVacaciones;IndemnizacionFeriado;IndemnizacionAvisoPrevio;IndemnizacionServicio;IndemnizacionOtras;IndemnizacionArticulo163;remuneracionPendiente;Gratificaciones;Bonos;HorasExtraordinarias;Aguinaldo;SemanaCorrida;ComisionOParticipacion;Movilizacion;Colacion;PerdidaCaja;DesgasteHerramientas;Viaticos;AsignacionesFamiliares;DescuentoSeguridadSocial;DescuentoImpuestos;DescuentoAfc;DescuentoAnticipado;DescuentoIndemnizacion;DescuentoPension;DescuentoCajaCompensacion;PrestamoAdeudado;AnticipoSueldo;VacacionesAnticipadas;Email;CodigoComunaPersonal;CallePersonal;NumeroPersonal;DepartamentoBlockPersonal;Telefono;CuentaTransferencia;BancoId;TipoCuentaId";

/** Causal interna del panel → CausalFiniquitoId de la DT (tabla 1 instructivo). */
export const CAUSAL_DT: Record<string, number> = {
  "159-1": 3,
  "159-2": 4,
  "159-3": 5,
  "159-4": 6,
  "159-5": 7,
  "159-6": 8,
  "160-1": 24, // letra a) falta de probidad — las letras b-f (24-29) se ajustan a mano si corresponde
  "160-2": 11,
  "160-3": 12,
  "160-4": 13,
  "160-5": 14,
  "160-6": 15,
  "160-7": 16,
  "161-1": 18,
  "161-2": 19,
  "163bis": 20,
};

/** Tabla 4 del instructivo. */
export const BANCOS_DT: Record<number, string> = {
  1: "BANCO DE CHILE",
  2: "BANCO INTERNACIONAL",
  3: "BANCO ESTADO",
  4: "SCOTIABANK",
  5: "BCI",
  6: "CORPBANCA",
  7: "BANCO BICE",
  8: "HSBC BANK CHILE",
  9: "BANCO SANTANDER",
  10: "BANCO ITAU",
  11: "BANCO SECURITY",
  12: "BANCO FALABELLA",
  13: "BANCO RIPLEY",
  14: "BANCO CONSORCIO",
  15: "SCOTIABANK (ex BBVA)",
  16: "BANCO DESARROLLO (SCOTIABANK)",
};

/** Tabla 5 del instructivo. */
export const TIPOS_CUENTA_DT: Record<number, string> = {
  1: "CUENTA CORRIENTE",
  3: "CUENTA VISTA",
  4: "CUENTA RUT",
};

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Comunas de la cartera (códigos de la tabla 3 del instructivo — V Región
 * completa + RM frecuentes). La DT usa la codificación antigua (Quilpué y
 * Limache en 51xx/55xx, no Marga Marga). Agregar acá cuando aparezca una
 * comuna nueva en la cartera.
 */
const COMUNAS_DT: Record<string, number> = {
  VALPARAISO: 5101,
  CASABLANCA: 5102,
  CONCON: 5103,
  "JUAN FERNANDEZ": 5104,
  PUCHUNCAVI: 5105,
  QUILPUE: 5106,
  QUINTERO: 5107,
  "VILLA ALEMANA": 5108,
  "VINA DEL MAR": 5109,
  "LOS ANDES": 5301,
  "CALLE LARGA": 5302,
  RINCONADA: 5303,
  "SAN ESTEBAN": 5304,
  "LA LIGUA": 5401,
  CABILDO: 5402,
  PAPUDO: 5403,
  PETORCA: 5404,
  ZAPALLAR: 5405,
  QUILLOTA: 5501,
  "LA CALERA": 5502,
  CALERA: 5502,
  HIJUELAS: 5503,
  "LA CRUZ": 5504,
  LIMACHE: 5505,
  NOGALES: 5506,
  OLMUE: 5507,
  "SAN ANTONIO": 5601,
  ALGARROBO: 5602,
  CARTAGENA: 5603,
  "EL QUISCO": 5604,
  "EL TABO": 5605,
  "SANTO DOMINGO": 5606,
  "SAN FELIPE": 5701,
  CATEMU: 5702,
  "LLAY-LLAY": 5703,
  LLAYLLAY: 5703,
  PANQUEHUE: 5704,
  PUTAENDO: 5705,
  "SANTA MARIA": 5706,
  SANTIAGO: 13101,
  "LAS CONDES": 13114,
  MAIPU: 13119,
  NUNOA: 13120,
  PROVIDENCIA: 13123,
  "PUENTE ALTO": 13201,
  "SAN BERNARDO": 13401,
  MELIPILLA: 13501,
  CURACAVI: 13503,
  TALAGANTE: 13601,
  // VI Región del Libertador B. O'Higgins (CUT) — agregar a medida que aparezcan
  "SAN VICENTE DE TAGUA TAGUA": 6117,
};

/** Código DT de una comuna por nombre (null si no está en el catálogo). */
export function comunaIdDt(nombre: string | null | undefined): number | null {
  if (!nombre) return null;
  return COMUNAS_DT[normalizar(nombre)] ?? null;
}

/** Región DT desde el código de comuna (los primeros dígitos del código). */
export function regionDeComuna(codigoComuna: number): number {
  return Math.floor(codigoComuna / 1000);
}

/** "76.443.634-2" → "76443634-2" (sin puntos, con guion). */
export function rutDt(rut: string | null | undefined): string {
  return (rut ?? "").replace(/\./g, "").trim();
}

/** ISO "2026-06-12" → "12-06-2026". */
export function fechaDt(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export type EntradaFilaDt = {
  trabajadorNombre: string;
  rutEmpresa: string | null;
  rutTrabajador: string | null;
  fechaInicio: string | null; // ISO
  fechaTermino: string | null; // ISO
  causal: string; // código interno ("161-1")
  funciones: string | null; // cargo
  comunaTrabajo: string | null; // nombre (comuna de la empresa)
  direccionTrabajo: string | null;
  diasVacaciones: number | null; // días corridos del cálculo
  indemFeriado: number | null;
  indemAvisoPrevio: number | null;
  indemServicio: number | null;
  remuneracionPendiente: number | null;
  email: string | null;
  comunaPersonal: string | null; // nombre (domicilio del trabajador)
  direccionPersonal: string | null; // "calle número"
  telefono: string | null;
  cuentaNumero: string | null;
  bancoNombre: string | null;
  tipoCuentaNombre: string | null;
};

export type FilaDt = {
  trabajador: string;
  campos: string[]; // 48 columnas en orden
  faltantes: string[]; // obligatorios DT que quedaron vacíos
};

function bancoIdDt(nombre: string | null | undefined): number | null {
  if (!nombre) return null;
  const n = normalizar(nombre);
  for (const [id, glosa] of Object.entries(BANCOS_DT)) {
    if (normalizar(glosa).includes(n) || n.includes(normalizar(glosa))) return Number(id);
  }
  if (n.includes("ESTADO")) return 3;
  if (n.includes("CHILE")) return 1;
  if (n.includes("SANTANDER")) return 9;
  if (n.includes("ITAU")) return 10;
  if (n.includes("BCI")) return 5;
  if (n.includes("FALABELLA")) return 12;
  return null;
}

function tipoCuentaIdDt(nombre: string | null | undefined): number | null {
  if (!nombre) return null;
  const n = normalizar(nombre);
  if (n.includes("RUT")) return 4;
  if (n.includes("VISTA")) return 3;
  if (n.includes("CORRIENTE")) return 1;
  return null;
}

/** Separa "Pasaje Coigüe 943" → calle + número (heurística simple). */
function separarDireccion(dir: string | null | undefined): { calle: string; numero: string } {
  if (!dir) return { calle: "", numero: "" };
  const limpia = dir.replace(/\s+/g, " ").trim();
  const m = limpia.match(/^(.*?)[,\s]+(?:n[°º]\s*|#\s*)?(\d+[a-zA-Z]?)$/);
  if (m) return { calle: m[1].replace(/,\s*$/, "").trim(), numero: m[2] };
  return { calle: limpia, numero: "" };
}

/** La DT exige número entero en TODOS los campos de monto: 0 si no aplica. */
function monto(n: number | null | undefined): string {
  if (n === null || n === undefined) return "0";
  return String(Math.round(n));
}

/** Arma la fila de 48 columnas y reporta los obligatorios que faltan. */
export function construirFilaDt(e: EntradaFilaDt): FilaDt {
  const faltantes: string[] = [];
  const req = (valor: string, campo: string): string => {
    if (!valor) faltantes.push(campo);
    return valor;
  };

  const causalDt = CAUSAL_DT[e.causal];
  const comunaTrabajoId = comunaIdDt(e.comunaTrabajo);
  const comunaPersonalId = comunaIdDt(e.comunaPersonal);
  const region = comunaTrabajoId ? regionDeComuna(comunaTrabajoId) : null;
  const dirPersonal = separarDireccion(e.direccionPersonal);
  const bancoId = bancoIdDt(e.bancoNombre);
  const tipoCuentaId = tipoCuentaIdDt(e.tipoCuentaNombre);
  const telefono = (e.telefono ?? "").replace(/\D/g, "").slice(-9);
  const cuenta = (e.cuentaNumero ?? "").replace(/\D/g, "");

  const campos: string[] = [
    req(rutDt(e.rutEmpresa), "RutEmpresa"),
    req(rutDt(e.rutTrabajador), "RutTrabajador"),
    req(fechaDt(e.fechaInicio), "FechaInicioContrato"),
    req(fechaDt(e.fechaTermino), "FechaTerminoContrato"),
    "No", // DeclaraNotificacionRetencionAlimento (Ley 21.389) — ajustar a mano si hay retención
    req(causalDt ? String(causalDt) : "", "CausalFiniquitoId"),
    req((e.funciones ?? "").slice(0, 100), "Funciones"),
    req(region ? String(region) : "", "RegionTrabajoId"),
    req(comunaTrabajoId ? String(comunaTrabajoId) : "", "ComunaId (lugar de trabajo)"),
    (e.direccionTrabajo ?? "").slice(0, 100), // opcional
    String(Math.max(0, Math.round(e.diasVacaciones ?? 0))), // obligatorio (0 si no hay)
    monto(e.indemFeriado),
    monto(e.indemAvisoPrevio),
    monto(e.indemServicio),
    "0", // IndemnizacionOtras
    "0", // IndemnizacionArticulo163
    monto(e.remuneracionPendiente),
    "0", // Gratificaciones
    "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", // Bonos…AsignacionesFamiliares (19-29)
    "0", // DescuentoSeguridadSocial
    "0", // DescuentoImpuestos
    "0", // DescuentoAfc — el instructivo manda digitar 0 (lo calcula el sistema)
    "0", "0", "0", "0", "0", "0", "0", // DescuentoAnticipado…VacacionesAnticipadas (33-39)
    req((e.email ?? "").trim(), "Email"),
    req(comunaPersonalId ? String(comunaPersonalId) : "", "CodigoComunaPersonal"),
    req(dirPersonal.calle.slice(0, 50), "CallePersonal"),
    req(dirPersonal.numero.slice(0, 10), "NumeroPersonal"),
    "", // DepartamentoBlockPersonal
    telefono, // opcional
    req(cuenta.slice(0, 15), "CuentaTransferencia"),
    req(bancoId ? String(bancoId) : "", "BancoId"),
    req(tipoCuentaId ? String(tipoCuentaId) : "", "TipoCuentaId"),
  ];

  return { trabajador: e.trabajadorNombre, campos, faltantes };
}

/** CSV completo con el encabezado oficial (separador ";", saltos CRLF). */
export function csvDt(filas: FilaDt[]): string {
  const lineas = filas.map((f) =>
    f.campos.map((c) => c.replace(/;/g, ",")).join(";"),
  );
  return [HEADER_DT, ...lineas].join("\r\n") + "\r\n";
}
