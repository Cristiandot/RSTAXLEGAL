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
  tramoAsignacion: string | null; // A/B/C/D
  cargasSimples: number;
  cargasMaternales: number;
  cargasInvalidas: number;
  jornada: string | null; // 'completa' | 'parcial'
  centroCosto: string | null;
  fechaIngreso: string | null; // ISO yyyy-mm-dd — para movimiento de personal 1 (contratación)
  fechaTermino: string | null; // ISO yyyy-mm-dd — para movimiento de personal 2 (retiro)
  ausenciaDesde: string | null; // ISO yyyy-mm-dd — para movimiento de personal 4 (permiso/ausencia sin goce)
  ausenciaHasta: string | null;
  r: ResultadoLiquidacion;
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
  // Movimiento de personal: 1 = contratación (fecha desde) / 2 = retiro (fecha hasta).
  // Sin fechas de ausentismo en la BD, los días <30 por inasistencia van sin movimiento
  // (Previred lo acepta con advertencia). CONFIRMAR códigos 3-8 cuando se modelen.
  const pIni = `${periodo}-01`;
  const pFin = `${periodo}-31`;
  const enPeriodo = (iso: string | null): boolean => {
    const s = (iso ?? "").slice(0, 10);
    return !!s && s >= pIni && s <= pFin;
  };
  const ingresoMes = enPeriodo(t.fechaIngreso);
  const retiroMes = enPeriodo(t.fechaTermino);
  const ausenciaMes = enPeriodo(t.ausenciaDesde) && enPeriodo(t.ausenciaHasta);
  if (retiroMes) {
    A(15, "2"); A(16, ingresoMes ? fmtFechaPrev(t.fechaIngreso) : ""); A(17, fmtFechaPrev(t.fechaTermino));
  } else if (ingresoMes) {
    A(15, "1"); A(16, fmtFechaPrev(t.fechaIngreso)); A(17, "");
  } else if (ausenciaMes) {
    A(15, "4"); A(16, fmtFechaPrev(t.ausenciaDesde)); A(17, fmtFechaPrev(t.ausenciaHasta)); // permiso/ausencia sin goce
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
  N(28, esAfp ? Math.round(r.baseImponible * (t.afpTasaTotal || 0) / 100) : 0); // Cotización Obligatoria AFP (tasa TOTAL)
  N(29, esAfp ? r.sisEmpleador : 0); // SIS (cargo empleador)
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
  N(79, esIsapre ? t.valorPlan : 0); // cotización pactada (plan, en $)
  N(80, esIsapre ? r.saludLegal : 0); // cotización obligatoria isapre (7%)
  N(81, esIsapre ? r.saludAdicional : 0); // cotización adicional isapre
  // 82 GES: 0 (uso futuro)

  // 8- CCAF (83..91)
  A(83, CCAF_COD[emp.ccaf ?? ""] ?? "00");
  A(86, ""); // descuento dental CCAF (blanco)
  // 84,85,87..91 montos CCAF: 0

  // RIMA / Jornada / Expectativa / Rentabilidad (92..95)
  N(92, 0); // RIMA (solo mov. 3/6)
  A(93, t.jornada === "parcial" ? "2" : "1"); // Tipo de jornada (obligatorio)
  N(94, esAfp && t.tipoTrabajador === "activo" ? Math.round(r.baseImponible * (t.tasaSeguroSocial || 0) / 100) : 0); // Cotización 0,9% seguro social
  A(95, "1"); // Rentabilidad protegida

  // 9- Mutualidad (96..99)
  A(96, mutualCod);
  N(97, esIsl ? 0 : r.baseImponible); // renta imponible mutual (privada)
  N(98, esIsl ? 0 : r.mutualEmpleador); // cotización accidente mutual privada
  A(99, ""); // sucursal

  // 10- Seguro de Cesantía (100..102)
  N(100, r.baseImponibleAfc); // renta imponible seguro cesantía (con tope)
  N(101, r.afcTrabajador);
  N(102, r.afcEmpleador);

  // 11- Pagador de Subsidios (103..104): no aplica
  A(103, "0"); A(104, "");

  // 12- Otros (105)
  A(105, alfa(t.centroCosto));

  return f.slice(1, 106).join(";");
}

/** Archivo completo: una línea por trabajador, separadas por salto de línea. */
export function generarNominaPrevired(
  periodo: string,
  emp: DatosPreviredEmpresa,
  trabajadores: DatosPreviredTrabajador[],
): string {
  return trabajadores.map((t) => lineaPrevired(periodo, emp, t)).join("\r\n") + "\r\n";
}
