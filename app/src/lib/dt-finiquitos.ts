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
 * Catálogo COMPLETO de comunas de Chile (346) para la tabla 3 del instructivo
 * DT. La DT usa el CUT (código único territorial) ANTERIOR a 2010: Marga Marga
 * no existe (Quilpué/Villa Alemana en 51xx, Limache/Olmué en 55xx) y Ñuble
 * sigue como provincia de la VIII Región (84xx, no 16xxx). Los códigos de la
 * cartera ya validados en cargas reales a la DT se mantienen intactos.
 * Claves = nombre normalizado (sin tildes, sin guiones/apóstrofes, MAYÚSCULAS);
 * hay alias para las variantes de nombre frecuentes.
 */
const COMUNAS_DT: Record<string, number> = {
  // XV Región de Arica y Parinacota
  ARICA: 15101,
  CAMARONES: 15102,
  PUTRE: 15201,
  "GENERAL LAGOS": 15202,
  // I Región de Tarapacá
  IQUIQUE: 1101,
  "ALTO HOSPICIO": 1107,
  "POZO ALMONTE": 1401,
  CAMINA: 1402,
  COLCHANE: 1403,
  HUARA: 1404,
  PICA: 1405,
  // II Región de Antofagasta
  ANTOFAGASTA: 2101,
  MEJILLONES: 2102,
  "SIERRA GORDA": 2103,
  TALTAL: 2104,
  CALAMA: 2201,
  OLLAGUE: 2202,
  "SAN PEDRO DE ATACAMA": 2203,
  TOCOPILLA: 2301,
  "MARIA ELENA": 2302,
  // III Región de Atacama
  COPIAPO: 3101,
  CALDERA: 3102,
  "TIERRA AMARILLA": 3103,
  CHANARAL: 3201,
  "DIEGO DE ALMAGRO": 3202,
  VALLENAR: 3301,
  "ALTO DEL CARMEN": 3302,
  FREIRINA: 3303,
  HUASCO: 3304,
  // IV Región de Coquimbo
  "LA SERENA": 4101,
  COQUIMBO: 4102,
  ANDACOLLO: 4103,
  "LA HIGUERA": 4104,
  PAIHUANO: 4105,
  PAIGUANO: 4105,
  VICUNA: 4106,
  ILLAPEL: 4201,
  CANELA: 4202,
  "LOS VILOS": 4203,
  SALAMANCA: 4204,
  OVALLE: 4301,
  COMBARBALA: 4302,
  "MONTE PATRIA": 4303,
  PUNITAQUI: 4304,
  "RIO HURTADO": 4305,
  // V Región de Valparaíso (codificación antigua: sin Marga Marga)
  VALPARAISO: 5101,
  CASABLANCA: 5102,
  CONCON: 5103,
  "JUAN FERNANDEZ": 5104,
  PUCHUNCAVI: 5105,
  QUILPUE: 5106,
  QUINTERO: 5107,
  "VILLA ALEMANA": 5108,
  "VINA DEL MAR": 5109,
  "ISLA DE PASCUA": 5201,
  "RAPA NUI": 5201,
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
  "LLAY LLAY": 5703, // normalizar() convierte el guion en espacio
  LLAYLLAY: 5703,
  PANQUEHUE: 5704,
  PUTAENDO: 5705,
  "SANTA MARIA": 5706,
  // VI Región del Libertador B. O'Higgins
  RANCAGUA: 6101,
  CODEGUA: 6102,
  COINCO: 6103,
  COLTAUCO: 6104,
  DONIHUE: 6105,
  GRANEROS: 6106,
  "LAS CABRAS": 6107,
  MACHALI: 6108,
  MALLOA: 6109,
  MOSTAZAL: 6110,
  "SAN FRANCISCO DE MOSTAZAL": 6110,
  OLIVAR: 6111,
  PEUMO: 6112,
  PICHIDEGUA: 6113,
  "QUINTA DE TILCOCO": 6114,
  RENGO: 6115,
  REQUINOA: 6116,
  "SAN VICENTE": 6117,
  "SAN VICENTE DE TAGUA TAGUA": 6117,
  PICHILEMU: 6201,
  "LA ESTRELLA": 6202,
  LITUECHE: 6203,
  MARCHIHUE: 6204,
  MARCHIGUE: 6204,
  NAVIDAD: 6205,
  PAREDONES: 6206,
  "SAN FERNANDO": 6301,
  CHEPICA: 6302,
  CHIMBARONGO: 6303,
  LOLOL: 6304,
  NANCAGUA: 6305,
  PALMILLA: 6306,
  PERALILLO: 6307,
  PLACILLA: 6308,
  PUMANQUE: 6309,
  "SANTA CRUZ": 6310,
  // VII Región del Maule
  TALCA: 7101,
  CONSTITUCION: 7102,
  CUREPTO: 7103,
  EMPEDRADO: 7104,
  MAULE: 7105,
  PELARCO: 7106,
  PENCAHUE: 7107,
  "RIO CLARO": 7108,
  "SAN CLEMENTE": 7109,
  "SAN RAFAEL": 7110,
  CAUQUENES: 7201,
  CHANCO: 7202,
  PELLUHUE: 7203,
  CURICO: 7301,
  HUALANE: 7302,
  LICANTEN: 7303,
  MOLINA: 7304,
  RAUCO: 7305,
  ROMERAL: 7306,
  "SAGRADA FAMILIA": 7307,
  TENO: 7308,
  VICHUQUEN: 7309,
  LINARES: 7401,
  COLBUN: 7402,
  LONGAVI: 7403,
  PARRAL: 7404,
  RETIRO: 7405,
  "SAN JAVIER": 7406,
  "VILLA ALEGRE": 7407,
  "YERBAS BUENAS": 7408,
  // VIII Región del Biobío (codificación antigua: Ñuble como provincia 84xx)
  CONCEPCION: 8101,
  CORONEL: 8102,
  CHIGUAYANTE: 8103,
  FLORIDA: 8104,
  HUALQUI: 8105,
  LOTA: 8106,
  PENCO: 8107,
  "SAN PEDRO DE LA PAZ": 8108,
  "SANTA JUANA": 8109,
  TALCAHUANO: 8110,
  TOME: 8111,
  HUALPEN: 8112,
  LEBU: 8201,
  ARAUCO: 8202,
  CANETE: 8203,
  CONTULMO: 8204,
  CURANILAHUE: 8205,
  "LOS ALAMOS": 8206,
  TIRUA: 8207,
  "LOS ANGELES": 8301,
  ANTUCO: 8302,
  CABRERO: 8303,
  LAJA: 8304,
  MULCHEN: 8305,
  NACIMIENTO: 8306,
  NEGRETE: 8307,
  QUILACO: 8308,
  QUILLECO: 8309,
  "SAN ROSENDO": 8310,
  "SANTA BARBARA": 8311,
  TUCAPEL: 8312,
  YUMBEL: 8313,
  "ALTO BIOBIO": 8314,
  "ALTO BIO BIO": 8314,
  // Ñuble (en la tabla DT sigue bajo la VIII Región; si la DT rechazara un
  // código 84xx, probar la codificación nueva 16xxx y actualizar acá)
  CHILLAN: 8401,
  BULNES: 8402,
  COBQUECURA: 8403,
  COELEMU: 8404,
  COIHUECO: 8405,
  "CHILLAN VIEJO": 8406,
  "EL CARMEN": 8407,
  NINHUE: 8408,
  NIQUEN: 8409,
  PEMUCO: 8410,
  PINTO: 8411,
  PORTEZUELO: 8412,
  QUILLON: 8413,
  QUIRIHUE: 8414,
  RANQUIL: 8415,
  "SAN CARLOS": 8416,
  "SAN FABIAN": 8417,
  "SAN IGNACIO": 8418,
  "SAN NICOLAS": 8419,
  TREGUACO: 8420,
  TREHUACO: 8420,
  YUNGAY: 8421,
  // IX Región de La Araucanía
  TEMUCO: 9101,
  CARAHUE: 9102,
  CUNCO: 9103,
  CURARREHUE: 9104,
  FREIRE: 9105,
  GALVARINO: 9106,
  GORBEA: 9107,
  LAUTARO: 9108,
  LONCOCHE: 9109,
  MELIPEUCO: 9110,
  "NUEVA IMPERIAL": 9111,
  "PADRE LAS CASAS": 9112,
  PERQUENCO: 9113,
  PITRUFQUEN: 9114,
  PUCON: 9115,
  SAAVEDRA: 9116,
  "PUERTO SAAVEDRA": 9116,
  "TEODORO SCHMIDT": 9117,
  TOLTEN: 9118,
  VILCUN: 9119,
  VILLARRICA: 9120,
  CHOLCHOL: 9121,
  "CHOL CHOL": 9121,
  ANGOL: 9201,
  COLLIPULLI: 9202,
  CURACAUTIN: 9203,
  ERCILLA: 9204,
  LONQUIMAY: 9205,
  "LOS SAUCES": 9206,
  LUMACO: 9207,
  PUREN: 9208,
  RENAICO: 9209,
  TRAIGUEN: 9210,
  VICTORIA: 9211,
  // XIV Región de Los Ríos
  VALDIVIA: 14101,
  CORRAL: 14102,
  LANCO: 14103,
  "LOS LAGOS": 14104,
  MAFIL: 14105,
  MARIQUINA: 14106,
  "SAN JOSE DE LA MARIQUINA": 14106,
  PAILLACO: 14107,
  PANGUIPULLI: 14108,
  "LA UNION": 14201,
  FUTRONO: 14202,
  "LAGO RANCO": 14203,
  "RIO BUENO": 14204,
  // X Región de Los Lagos
  "PUERTO MONTT": 10101,
  CALBUCO: 10102,
  COCHAMO: 10103,
  FRESIA: 10104,
  FRUTILLAR: 10105,
  "LOS MUERMOS": 10106,
  LLANQUIHUE: 10107,
  MAULLIN: 10108,
  "PUERTO VARAS": 10109,
  CASTRO: 10201,
  ANCUD: 10202,
  CHONCHI: 10203,
  "CURACO DE VELEZ": 10204,
  DALCAHUE: 10205,
  PUQUELDON: 10206,
  QUEILEN: 10207,
  QUELLON: 10208,
  QUEMCHI: 10209,
  QUINCHAO: 10210,
  OSORNO: 10301,
  "PUERTO OCTAY": 10302,
  PURRANQUE: 10303,
  PUYEHUE: 10304,
  "RIO NEGRO": 10305,
  "SAN JUAN DE LA COSTA": 10306,
  "SAN PABLO": 10307,
  CHAITEN: 10401,
  FUTALEUFU: 10402,
  HUALAIHUE: 10403,
  PALENA: 10404,
  // XI Región de Aysén
  COYHAIQUE: 11101,
  COIHAIQUE: 11101,
  "LAGO VERDE": 11102,
  AYSEN: 11201,
  AISEN: 11201,
  "PUERTO AYSEN": 11201,
  CISNES: 11202,
  GUAITECAS: 11203,
  COCHRANE: 11301,
  "O HIGGINS": 11302, // normalizar() elimina el apóstrofe de O'Higgins
  OHIGGINS: 11302,
  TORTEL: 11303,
  "CHILE CHICO": 11401,
  "RIO IBANEZ": 11402,
  // XII Región de Magallanes y la Antártica Chilena
  "PUNTA ARENAS": 12101,
  "LAGUNA BLANCA": 12102,
  "RIO VERDE": 12103,
  "SAN GREGORIO": 12104,
  "CABO DE HORNOS": 12201,
  "PUERTO WILLIAMS": 12201,
  ANTARTICA: 12202,
  PORVENIR: 12301,
  PRIMAVERA: 12302,
  TIMAUKEL: 12303,
  NATALES: 12401,
  "PUERTO NATALES": 12401,
  "TORRES DEL PAINE": 12402,
  // Región Metropolitana de Santiago
  SANTIAGO: 13101,
  CERRILLOS: 13102,
  "CERRO NAVIA": 13103,
  CONCHALI: 13104,
  "EL BOSQUE": 13105,
  "ESTACION CENTRAL": 13106,
  HUECHURABA: 13107,
  INDEPENDENCIA: 13108,
  "LA CISTERNA": 13109,
  "LA FLORIDA": 13110,
  "LA GRANJA": 13111,
  "LA PINTANA": 13112,
  "LA REINA": 13113,
  "LAS CONDES": 13114,
  "LO BARNECHEA": 13115,
  "LO ESPEJO": 13116,
  "LO PRADO": 13117,
  MACUL: 13118,
  MAIPU: 13119,
  NUNOA: 13120,
  "PEDRO AGUIRRE CERDA": 13121,
  PENALOLEN: 13122,
  PROVIDENCIA: 13123,
  PUDAHUEL: 13124,
  QUILICURA: 13125,
  "QUINTA NORMAL": 13126,
  RECOLETA: 13127,
  RENCA: 13128,
  "SAN JOAQUIN": 13129,
  "SAN MIGUEL": 13130,
  "SAN RAMON": 13131,
  VITACURA: 13132,
  "PUENTE ALTO": 13201,
  PIRQUE: 13202,
  "SAN JOSE DE MAIPO": 13203,
  COLINA: 13301,
  LAMPA: 13302,
  TILTIL: 13303,
  "TIL TIL": 13303,
  "SAN BERNARDO": 13401,
  BUIN: 13402,
  "CALERA DE TANGO": 13403,
  PAINE: 13404,
  MELIPILLA: 13501,
  ALHUE: 13502,
  CURACAVI: 13503,
  "MARIA PINTO": 13504,
  "SAN PEDRO": 13505,
  TALAGANTE: 13601,
  "EL MONTE": 13602,
  "ISLA DE MAIPO": 13603,
  "PADRE HURTADO": 13604,
  PENAFLOR: 13605,
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
