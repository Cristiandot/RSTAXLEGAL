/**
 * Generador del archivo de carga electrónica de PREVIRED — Formato Estándar
 * Largo Variable por Separador (";"), 105 campos, versión 82 (junio 2025).
 *
 * Una línea por trabajador (línea principal, Tipo de Línea 00). Reglas del
 * instructivo: numéricos = enteros sin decimales (N/A = "0"); alfanuméricos sin
 * blancos internos (N/A = ""); no se omite ningún campo (105 separados por ";").
 *
 * ⚠️ Formato de rechazo binario: validar contra un archivo real de KAME o una
 * carga de prueba en Previred antes de uso masivo. Puntos a confirmar marcados
 * con "CONFIRMAR" abajo.
 */

import type { ResultadoLiquidacion } from "./liquidacion";

const AFP_COD: Record<string, string> = {
  Cuprum: "03", Habitat: "05", Provida: "08", PlanVital: "29",
  Capital: "33", Modelo: "34", Uno: "35",
};
const SALUD_COD: Record<string, string> = {
  "Sin Isapre": "00", "Banmédica": "01", Consalud: "02", VidaTres: "03",
  Colmena: "04", "Isapre Cruz Blanca S.A.": "05", Fonasa: "07",
  "Nueva Masvida": "10", "Cruz del Norte": "25", Esencial: "28",
};
const MUTUAL_COD: Record<string, string> = {
  ISL: "00", ACHS: "01", "Mutual CChC": "02", IST: "03",
};
const CCAF_COD: Record<string, string> = {
  "Sin CCAF": "00", "Los Andes": "01", "La Araucana": "02",
  "Los Héroes": "03", "18 de Septiembre": "04",
};
const REGIMEN_COD: Record<string, string> = { afp: "AFP", ips: "INP", sip: "SIP" };
const TIPO_TRAB_COD: Record<string, string> = {
  activo: "0", pensionado_cotiza: "2", pensionado_no_cotiza: "3", activo_mayor65: "8",
};

export type DatosPreviredTrabajador = {
  rutSinDv: string; // numérico, sin puntos ni DV
  dv: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  sexo: string | null; // 'masculino' | 'femenino'
  nacionalidad: string | null; // 'Chilena' / 'Chileno' => 0; otro => 1
  regimen: string; // afp | ips | sip
  tipoTrabajador: string; // activo | pensionado_cotiza | ...
  diasTrabajados: number;
  afp: string | null;
  afpTasaTotal: number; // % total AFP (incluye 0,1% empleador) para campo 28
  tasaSeguroSocial: number; // % seguro social 0,9% (campo 94)
  salud: string | null; // 'Fonasa' o nombre de isapre
  monedaPlan: string | null; // 'UF' | '$'
  valorPlan: number; // en $ (si UF, ya convertido a $)
  valorPlanUf: number; // valor del plan en UF (0 si el plan es en pesos)
  sueldoEmpresarial: boolean; // socio/dueño: SIS de su cargo, sin AFC (mutual sí cotiza)
  tasaSis: number; // % SIS del período (campo 29 cuando el SIS no es costo del empleador)
  tasaAfcEmpleador: number; // fracción AFC empleador vigente en el período (0.024 / 0.03 / 0.008 / 0)
  tramoAsignacion: string | null; // A/B/C/D
  cargasSimples: number;
  cargasMaternales: number;
  cargasInvalidas: number;
  jornada: string | null; // 'completa' | 'parcial'
  centroCosto: string | null;
  fechaIngreso: string | null; // ISO yyyy-mm-dd — para movimiento de personal 1 (contratación)
  fechaTermino: string | null; // ISO yyyy-mm-dd — para movimiento de personal 2 (retiro)
  /** Movimientos del mes desde novedades: licencia → 3 (subsidios), ausencia → 4 (permiso sin goce). */
  movimientos: MovimientoPersonal[];
  /** Renta imponible MENSUAL de referencia para la RIMA (mes anterior si está liquidado; si no, la renta del mes mensualizada). El campo 92 se prorratea por los días del movimiento. */
  rima: number;
  r: ResultadoLiquidacion;
};

export type MovimientoPersonal = {
  codigo: string; // '3' subsidios (licencia) | '4' permiso sin goce (ausencia)
  desde: string | null; // ISO yyyy-mm-dd
  hasta: string | null;
};

export type DatosPreviredEmpresa = {
  mutual: string | null; // ISL | ACHS | Mutual CChC | IST
  ccaf: string | null; // 'Sin CCAF' | ...
};

const ent = (n: number): string => String(Math.max(0, Math.round(n || 0)));
// Alfanumérico: sin tildes/diacríticos (Previred/KAME no los aceptan) y sin espacios extremos.
const alfa = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Búsqueda tolerante en los mapas de códigos: sin mayúsculas/tildes/espacios ni
// prefijo "AFP" ("Planvital", "AFP Plan Vital" y "PlanVital" son el mismo código).
const clave = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").replace(/^afp/, "");
const codigoDe = (mapa: Record<string, string>, nombre: string | null | undefined): string | undefined => {
  const k = clave(nombre);
  if (!k) return undefined;
  for (const [n, cod] of Object.entries(mapa)) if (clave(n) === k) return cod;
  return undefined;
};

const fmtFechaPrev = (iso: string | null | undefined): string => {
  const s = (iso ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
};

/** Movimientos de personal del mes, en orden cronológico: retiro (2) / contratación (1) automáticos desde el contrato + licencias (3) y ausencias (4) desde novedades. */
function movimientosDelMes(periodo: string, t: DatosPreviredTrabajador): MovimientoPersonal[] {
  const pIni = `${periodo}-01`;
  const pFin = `${periodo}-31`;
  const en = (iso: string | null): boolean => {
    const s = (iso ?? "").slice(0, 10);
    return !!s && s >= pIni && s <= pFin;
  };
  const movs: MovimientoPersonal[] = [];
  if (en(t.fechaTermino)) {
    movs.push({ codigo: "2", desde: en(t.fechaIngreso) ? t.fechaIngreso : null, hasta: t.fechaTermino });
  } else if (en(t.fechaIngreso)) {
    movs.push({ codigo: "1", desde: t.fechaIngreso, hasta: null });
  }
  for (const m of t.movimientos ?? []) if (en(m.desde)) movs.push(m);
  // Los movimientos 3/6 van PRIMERO: la RIMA (campo 92) y la cotización del campo 94
  // solo se aceptan en la línea principal (00), así que el subsidio debe ocuparla.
  const prio = (m: MovimientoPersonal): number => (m.codigo === "3" || m.codigo === "6" ? 0 : 1);
  movs.sort((a, b) => prio(a) - prio(b) || (a.desde ?? "").localeCompare(b.desde ?? ""));
  return movs;
}

/** RIMA (campo 92): renta imponible de los DÍAS del movimiento — renta mensual de referencia prorrateada. */
function rimaDe(mov: MovimientoPersonal, rimaMensual: number): number {
  const d0 = Date.parse((mov.desde ?? "").slice(0, 10));
  const d1 = Date.parse((mov.hasta ?? mov.desde ?? "").slice(0, 10));
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return 0;
  const dias = Math.max(1, Math.round((d1 - d0) / 86400000) + 1);
  return Math.round((rimaMensual * Math.min(30, dias)) / 30);
}

/** Una línea de 105 campos (línea principal, tipo 00). */
export function lineaPrevired(
  periodo: string, // 'YYYY-MM'
  emp: DatosPreviredEmpresa,
  t: DatosPreviredTrabajador,
): string {
  const r = t.r;
  const mmaaaa = `${periodo.slice(5, 7)}${periodo.slice(0, 4)}`;
  const esAfp = t.regimen === "afp";
  const esFonasa = (t.salud ?? "").toLowerCase() === "fonasa";
  const esIsapre = !!t.salud && !esFonasa && (t.salud ?? "").toLowerCase() !== "sin isapre";
  const mutualCod = MUTUAL_COD[emp.mutual ?? ""] ?? "00";
  const esIsl = mutualCod === "00";
  const cargas = (t.cargasSimples || 0) + (t.cargasMaternales || 0) + (t.cargasInvalidas || 0);

  const f: string[] = new Array(106).fill("0"); // 1..105 (índice 0 sin uso)
  const A = (i: number, v: string) => { f[i] = v; }; // alfanumérico
  const N = (i: number, v: number) => { f[i] = ent(v); }; // numérico

  // 1- Datos del Trabajador
  A(1, t.rutSinDv); A(2, t.dv.toUpperCase());
  A(3, alfa(t.apellidoPaterno)); A(4, alfa(t.apellidoMaterno)); A(5, alfa(t.nombres));
  A(6, (t.sexo ?? "").toLowerCase().startsWith("f") ? "F" : "M");
  A(7, (t.nacionalidad ?? "").toLowerCase().startsWith("chil") || (t.nacionalidad ?? "") === "" ? "0" : "1");
  A(8, "1"); // Tipo Pago: Remuneraciones del mes
  A(9, mmaaaa); A(10, "0"); // Período hasta: 0 (solo se usa en multiperíodo)
  A(11, REGIMEN_COD[t.regimen] ?? "AFP");
  A(12, TIPO_TRAB_COD[t.tipoTrabajador] ?? "0");
  N(13, Math.min(30, Math.max(0, t.diasTrabajados)));
  A(14, "00"); // Línea principal
  // Movimiento de personal (campos 15-17): el primero del mes va en la línea
  // principal; los demás salen como líneas adicionales (tipo 01) en lineasPrevired.
  const movs = movimientosDelMes(periodo, t);
  const m0 = movs[0];
  if (m0) {
    A(15, m0.codigo); A(16, fmtFechaPrev(m0.desde)); A(17, fmtFechaPrev(m0.hasta));
  } else {
    A(15, "0"); A(16, ""); A(17, ""); // sin movimiento en el mes
  }
  A(18, t.tramoAsignacion ?? "D"); // tramo asig. familiar (D = sin derecho)
  N(19, t.cargasSimples); N(20, t.cargasMaternales); N(21, t.cargasInvalidas);
  N(22, r.asignacionFamiliar);
  N(23, 0); N(24, 0); A(25, "N"); // retroactiva / reintegro / subsidio joven (N=No)

  // 2- Datos de la AFP
  A(26, esAfp ? (codigoDe(AFP_COD, t.afp) ?? "00") : "00");
  N(27, esAfp ? r.baseImponible : 0); // Renta Imponible AFP/Seguro Social
  // Cotización Obligatoria AFP: cotización del trabajador (ya redondeada en la
  // liquidación) + 0,1% del empleador redondeado APARTE — así la entera KAME/Previred
  // (dos redondeos separados, verificado contra planillas pagadas jun-2026).
  // Con sueldo empresarial, afpMonto trae el SIS incluido (de cargo del socio): se resta
  // porque el SIS se declara en el campo 29.
  const afpTrabajadorMonto = t.sueldoEmpresarial
    ? r.afpMonto - Math.round(r.baseImponible * (t.tasaSis || 0) / 100)
    : r.afpMonto;
  N(28, esAfp ? afpTrabajadorMonto + Math.round(r.baseImponible * 0.001) : 0);
  // SIS: se declara siempre que cotice AFP. Con sueldo empresarial el monto es de
  // cargo del socio (no es costo del empleador), pero Previred lo exige informado.
  // En períodos con subsidio (mov. 3) el empleador además entera SIS sobre la RIMA.
  const rimaSubsidios = movimientosDelMes(periodo, t)
    .filter((m) => m.codigo === "3" || m.codigo === "6")
    .reduce((s, m) => s + rimaDe(m, t.rima), 0);
  // Una sola multiplicación sobre (base + RIMA): Previred valida monto = tasa × renta
  // total y el redondeo por partes puede diferir en $1.
  const cotizaSis = r.sisEmpleador > 0 || t.sueldoEmpresarial;
  const sisMonto = cotizaSis ? Math.round((r.baseImponible + rimaSubsidios) * (t.tasaSis || 0) / 100) : 0;
  N(29, esAfp ? sisMonto : 0);
  // 30..39 cuenta ahorro / sustitutiva / trabajo pesado: 0 (no aplica)

  // 3- APVI (40..44) / 4- APVC (45..49): no aplica (KAME deja N° contrato APVI = 1)
  A(41, "1"); A(46, ""); // n° contratos

  // 5- Afiliado Voluntario (50..61): no aplica (KAME deja fechas 01/01/1900 y N° períodos 1)
  A(51, ""); A(52, ""); A(53, ""); A(54, "");
  A(56, "01/01/1900"); A(57, "01/01/1900"); A(58, ""); A(61, "1");

  // 6- IPS / ISL / Fonasa (62..74)
  A(62, "0"); // no pertenece al IPS (AFP)
  N(64, esFonasa || esIsl ? r.baseImponible : 0); // Renta Imponible IPS/ISL/Fonasa
  A(67, ""); // código ex-caja desahucio (blanco)
  N(70, esFonasa ? r.saludLegal : 0); // Cotización Fonasa (7%)
  N(71, esIsl ? r.mutualEmpleador : 0); // Acc. trabajo ISL (si no hay mutual privada)

  // 7- Datos Salud (75..82)
  A(75, esIsapre ? (codigoDe(SALUD_COD, t.salud) ?? "00") : esFonasa ? "07" : "00");
  A(76, ""); // N° FUN
  N(77, esFonasa || esIsapre ? r.baseImponible : 0); // Renta imponible (KAME la informa también para Fonasa)
  A(78, esIsapre && t.monedaPlan === "UF" ? "2" : "1"); // moneda plan (1 = pesos por defecto)
  // Cotización pactada: si la moneda es UF, el valor va EN UF con 2 decimales
  // (Previred topea en 99 UF); en pesos va el monto entero.
  if (esIsapre && t.monedaPlan === "UF") A(79, (t.valorPlanUf || 0).toFixed(2));
  else N(79, esIsapre ? t.valorPlan : 0);
  N(80, esIsapre ? r.saludLegal : 0); // cotización obligatoria isapre (7%)
  N(81, esIsapre ? r.saludAdicional : 0); // cotización adicional isapre
  // 82 GES: 0 (uso futuro)

  // 8- CCAF (83..91)
  A(83, CCAF_COD[emp.ccaf ?? ""] ?? "00");
  A(86, ""); // descuento dental CCAF (blanco)
  // 84,85,87..91 montos CCAF: 0

  // RIMA / Jornada / Expectativa / Rentabilidad (92..95)
  N(92, rimaSubsidios); // RIMA total de los subsidios del mes — SOLO en la línea principal
  A(93, t.jornada === "parcial" ? "2" : "1"); // Tipo de jornada (obligatorio)
  // Cotización 0,9% seguro social (expectativa de vida): sobre la renta del mes MÁS la
  // RIMA — durante el subsidio el empleador sigue enterando esta cotización.
  N(94, esAfp && t.tipoTrabajador === "activo" ? Math.round((r.baseImponible + rimaSubsidios) * (t.tasaSeguroSocial || 0) / 100) : 0);
  A(95, "1"); // Rentabilidad protegida

  // 9- Mutualidad (96..99)
  A(96, mutualCod);
  // Mutual privada: renta y cotización solo si efectivamente cotiza (el socio con
  // sueldo empresarial no cotiza accidentes del trabajo — renta en 0).
  N(97, esIsl || r.mutualEmpleador === 0 ? 0 : r.baseImponible);
  N(98, esIsl ? 0 : r.mutualEmpleador); // cotización accidente mutual privada
  A(99, ""); // sucursal

  // 10- Seguro de Cesantía (100..102): sin cotizaciones (socio/pensionado) la renta va en 0.
  // Durante subsidios el empleador sigue pagando su AFC sobre la RIMA — la renta SC
  // incluye la RIMA para mantener la proporción tasa × renta que valida Previred.
  const afcEmpleadorTotal = r.afcEmpleador > 0
    ? Math.round((r.baseImponibleAfc + rimaSubsidios) * (t.tasaAfcEmpleador || 0))
    : 0;
  N(100, r.afcTrabajador > 0 || afcEmpleadorTotal > 0 ? r.baseImponibleAfc + (rimaSubsidios > 0 && afcEmpleadorTotal > 0 ? rimaSubsidios : 0) : 0);
  N(101, r.afcTrabajador);
  N(102, afcEmpleadorTotal);

  // 11- Pagador de Subsidios (103..104): no aplica
  A(103, "0"); A(104, "");

  // 12- Otros (105)
  A(105, alfa(t.centroCosto));

  return f.slice(1, 106).join(";");
}

/**
 * Línea adicional (tipo 01) para el 2° y siguientes movimientos de personal del
 * mes: identifica al trabajador y lleva solo el movimiento con sus fechas (los
 * montos y cotizaciones van únicamente en la línea principal). CONFIRMAR contra
 * archivo KAME en la primera carga con multi-movimiento.
 */
function lineaAdicionalPrevired(
  periodo: string,
  emp: DatosPreviredEmpresa,
  t: DatosPreviredTrabajador,
  mov: MovimientoPersonal,
): string {
  const mmaaaa = `${periodo.slice(5, 7)}${periodo.slice(0, 4)}`;
  const mutualCod = codigoDe(MUTUAL_COD, emp.mutual) ?? MUTUAL_COD[emp.mutual ?? ""] ?? "00";
  const f: string[] = new Array(106).fill("0");
  const A = (i: number, v: string) => { f[i] = v; };
  const N = (i: number, v: number) => { f[i] = ent(v); };
  A(1, t.rutSinDv); A(2, t.dv.toUpperCase());
  A(3, alfa(t.apellidoPaterno)); A(4, alfa(t.apellidoMaterno)); A(5, alfa(t.nombres));
  A(6, (t.sexo ?? "").toLowerCase().startsWith("f") ? "F" : "M");
  A(7, (t.nacionalidad ?? "").toLowerCase().startsWith("chil") || (t.nacionalidad ?? "") === "" ? "0" : "1");
  A(8, "1"); A(9, mmaaaa); A(10, "0");
  A(11, REGIMEN_COD[t.regimen] ?? "AFP");
  A(12, TIPO_TRAB_COD[t.tipoTrabajador] ?? "0");
  N(13, 0); // los días trabajados van solo en la línea principal
  A(14, "01"); // línea adicional
  A(15, mov.codigo); A(16, fmtFechaPrev(mov.desde)); A(17, fmtFechaPrev(mov.hasta));
  A(18, t.tramoAsignacion ?? "D");
  A(25, "N");
  A(41, "1"); A(46, "");
  A(51, ""); A(52, ""); A(53, ""); A(54, "");
  A(56, "01/01/1900"); A(57, "01/01/1900"); A(58, ""); A(61, "1");
  A(62, "0"); A(67, "");
  A(75, "00"); A(76, ""); A(78, "1");
  A(83, "00"); A(86, "");
  N(92, 0); // la RIMA NO se informa en líneas adicionales (solo línea 00 o 02)
  A(93, t.jornada === "parcial" ? "2" : "1");
  N(94, 0); // la cotización expectativa de vida tampoco va en líneas adicionales
  A(95, "1");
  A(96, mutualCod); A(99, "");
  A(103, "0"); A(104, "");
  A(105, alfa(t.centroCosto));
  return f.slice(1, 106).join(";");
}

/** Todas las líneas de un trabajador: principal + una adicional por cada movimiento extra. */
export function lineasPrevired(
  periodo: string,
  emp: DatosPreviredEmpresa,
  t: DatosPreviredTrabajador,
): string[] {
  const movs = movimientosDelMes(periodo, t);
  return [
    lineaPrevired(periodo, emp, t),
    ...movs.slice(1).map((m) => lineaAdicionalPrevired(periodo, emp, t, m)),
  ];
}

/** Archivo completo: una o más líneas por trabajador, separadas por salto de línea. */
export function generarNominaPrevired(
  periodo: string,
  emp: DatosPreviredEmpresa,
  trabajadores: DatosPreviredTrabajador[],
): string {
  return trabajadores.flatMap((t) => lineasPrevired(periodo, emp, t)).join("\r\n") + "\r\n";
}
