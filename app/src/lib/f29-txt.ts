/**
 * Generador del archivo UPLOAD F29 del SII.
 *
 * Formato oficial: "Estructura de archivo UPLOAD F29", Subdirección de
 * Informática del SII, 06-06-2016. El archivo es texto plano de ancho fijo
 * (81 caracteres por línea) con dos tipos de registro:
 *
 *   Tipo 0 (identificación, 1 línea): período, formulario 0029, total de
 *   registros, RUT+DV; el resto (checksums, folio, fecha, hora) va en ceros
 *   y la plataforma es "WIN".
 *
 *   Tipo 1 (detalle, N líneas): hasta 4 grupos [código 9(04)][signo X(01)]
 *   [valor X(15)] por línea. Valores numéricos alineados a la derecha con
 *   ceros (misma regla que los RUT: "tratados como enteros, rellenos de ceros
 *   a la izquierda"); fechas/período alineados a la izquierda con blancos.
 *
 * El archivo se carga en sii.cl → Impuestos Mensuales → Declarar y Pagar por
 * Caja (F29 y F50) → tipo de ingreso "Upload". Al cargarlo, el formulario del
 * SII RECALCULA LOS TOTALIZADORES (538, 537, 89/77, 595, 91), por lo que acá
 * solo se emiten los códigos de ENTRADA; los totales los arma el SII y la
 * contadora los valida en pantalla antes de presentar.
 *
 * El nombre del archivo debe ser [RUT sin DV a 8 dígitos].txt (ej: 76020032.txt).
 */

/** Resumen del RCV de un período por tipo de documento (v_f29_upload_rcv). */
export type F29DocResumen = {
  libro: "venta" | "compra";
  tipo_doc: number;
  docs: number;
  /** true si es un resumen (boletas) sin cantidad de documentos conocida. */
  docs_incompletos?: boolean;
  neto: number;
  exento: number;
  /** Ventas: monto IVA (débito). Compras: IVA recuperable (crédito). */
  iva: number;
  iva_activo_fijo?: number;
  docs_activo_fijo?: number;
  iva_no_recuperable?: number;
  iva_uso_comun?: number;
};

export type DatosF29 = {
  /** RUT de la empresa con o sin puntos, con DV: "76.020.032-8". */
  rut: string;
  razonSocial: string;
  /** Período del panel: "2026-06". */
  periodo: string;
  rcv: F29DocResumen[];
  /** Desglose del ciclo F29 del panel (lo que llenó la contadora). */
  impUnico: number | null;
  retenciones: number | null;
  ppm: number | null;
  montoIva: number | null;
  montoOtros: number | null;
  ivaPostergado: number | null;
  /** Retención de honorarios según BD (para cuadrar contra `retenciones`). */
  retencionHonorariosBd?: number | null;
};

export type CodigoF29 = {
  codigo: number;
  glosa: string;
  /** Valor legible para mostrar en el panel (el TXT lo formatea aparte). */
  valor: number | string;
};

export type ArchivoUploadF29 = {
  nombreArchivo: string;
  contenido: string;
  codigos: CodigoF29[];
  advertencias: string[];
};

/** Glosas de los códigos emitidos (plancheta F29 vigente, sii.cl). */
const GLOSAS: Record<number, string> = {
  3: "RUT contribuyente",
  1: "Razón social",
  15: "Período tributario",
  7: "Folio (lo asigna el SII)",
  585: "Exportaciones — cantidad de documentos",
  20: "Exportaciones — monto neto",
  586: "Ventas exentas o no gravadas del giro — cantidad",
  142: "Ventas exentas o no gravadas del giro — monto neto",
  503: "Facturas emitidas del giro — cantidad",
  502: "Facturas emitidas del giro — débito",
  110: "Boletas — cantidad",
  111: "Boletas — débito",
  512: "Notas de débito emitidas — cantidad",
  513: "Notas de débito emitidas — débito",
  509: "Notas de crédito emitidas — cantidad",
  510: "Notas de crédito emitidas — débito (resta)",
  519: "Facturas recibidas del giro — cantidad",
  520: "Facturas recibidas del giro — crédito",
  524: "Facturas activo fijo — cantidad",
  525: "Facturas activo fijo — crédito",
  527: "Notas de crédito recibidas — cantidad",
  528: "Notas de crédito recibidas — crédito (resta)",
  531: "Notas de débito recibidas — cantidad",
  532: "Notas de débito recibidas — crédito",
  48: "Impuesto único 2ª categoría (trabajadores)",
  151: "Retención honorarios (Art. 74 N°2 LIR)",
  563: "PPM — base imponible",
  115: "PPM — tasa",
  62: "PPM neto determinado",
  8707: "Versión del formulario",
};

/** "76.020.032-8" → { cuerpo: "76020032", dv: "8" } (null si no parsea). */
export function partesRut(rut: string): { cuerpo: string; dv: string } | null {
  const limpio = rut.replace(/[.\s]/g, "").toUpperCase();
  const m = limpio.match(/^(\d{1,8})-?([\dK])$/);
  if (!m) return null;
  return { cuerpo: m[1], dv: m[2] };
}

/** Texto plano para el archivo: mayúsculas, sin tildes/Ñ ni caracteres raros. */
function textoPlano(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f;
    })
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const n0 = (v: number | null | undefined): number => Number(v ?? 0) || 0;
const redondear = (v: number): number => Math.round(v);

/** Grupo [código][signo][valor] del registro tipo 1 (20 caracteres). */
type Grupo = { codigo: number; signo: string; valor15: string };

function grupoNumerico(codigo: number, valor: number): Grupo {
  const v = redondear(valor);
  return {
    codigo,
    // "+" numérico positivo, "-" negativo (el valor va siempre en positivo).
    signo: v < 0 ? "-" : "+",
    valor15: String(Math.abs(v)).padStart(15, "0"),
  };
}

function grupoAlfanumerico(codigo: number, valor: string): Grupo {
  return { codigo, signo: " ", valor15: valor.slice(0, 15).padEnd(15, " ") };
}

/**
 * Mapea los datos del panel a los códigos del F29. Solo códigos de ENTRADA con
 * valor (los totalizadores los recalcula el SII al cargar el archivo).
 */
export function construirCodigosF29(datos: DatosF29): {
  grupos: Grupo[];
  codigos: CodigoF29[];
  advertencias: string[];
} {
  const adv: string[] = [];
  const grupos: Grupo[] = [];
  const codigos: CodigoF29[] = [];

  const pushN = (codigo: number, valor: number) => {
    grupos.push(grupoNumerico(codigo, valor));
    codigos.push({ codigo, glosa: GLOSAS[codigo] ?? `Código ${codigo}`, valor: redondear(valor) });
  };
  const pushAN = (codigo: number, valor: string) => {
    grupos.push(grupoAlfanumerico(codigo, valor));
    codigos.push({ codigo, glosa: GLOSAS[codigo] ?? `Código ${codigo}`, valor });
  };

  // ---- Identificación (códigos obligatorios 03, 01, 15, 07 + versión 8707) ----
  const rut = partesRut(datos.rut);
  if (!rut) throw new Error(`RUT de la empresa no válido: ${datos.rut}`);
  const periodoAAAAMM = datos.periodo.replace("-", "");
  if (!/^\d{6}$/.test(periodoAAAAMM)) {
    throw new Error(`Período no válido: ${datos.periodo}`);
  }
  // RUT: "tratado como entero (cuerpo + DV), relleno de ceros a la izquierda".
  grupos.push({
    codigo: 3,
    signo: " ",
    valor15: `${rut.cuerpo}${rut.dv}`.padStart(15, "0"),
  });
  codigos.push({ codigo: 3, glosa: GLOSAS[3], valor: `${rut.cuerpo}-${rut.dv}` });
  pushAN(1, textoPlano(datos.razonSocial));
  pushAN(15, periodoAAAAMM);
  pushN(7, 0); // folio: lo asigna el SII al cargar

  // ---- Ventas (débitos) ----
  const ventas = datos.rcv.filter((d) => d.libro === "venta");
  const compras = datos.rcv.filter((d) => d.libro === "compra");
  const suma = (
    docs: F29DocResumen[],
    tipos: number[],
    campo: (d: F29DocResumen) => number,
  ) => docs.filter((d) => tipos.includes(d.tipo_doc)).reduce((s, d) => s + campo(d), 0);

  // Exportaciones (facturas 110, ND 111, NC 112 — las NC vienen negativas).
  const expTipos = [110, 111, 112];
  const expDocs = suma(ventas, expTipos, (d) => d.docs);
  const expNeto = suma(ventas, expTipos, (d) => n0(d.neto) + n0(d.exento));
  if (expDocs > 0 || expNeto !== 0) {
    pushN(585, expDocs);
    pushN(20, expNeto);
  }

  // Ventas exentas o no gravadas del giro: documentos exentos (32/34/41) más
  // el monto exento que venga dentro de documentos afectos.
  const exentosTipos = [32, 34, 41];
  const exentosDocs = suma(ventas, exentosTipos, (d) => d.docs);
  const exentoNeto =
    ventas.filter((d) => !expTipos.includes(d.tipo_doc)).reduce((s, d) => s + n0(d.exento), 0) +
    suma(ventas, exentosTipos, (d) => n0(d.neto));
  if (exentosDocs > 0 || exentoNeto !== 0) {
    pushN(586, exentosDocs);
    pushN(142, exentoNeto);
  }

  // Facturas emitidas del giro (30 papel, 33 electrónica).
  const factDocs = suma(ventas, [30, 33], (d) => d.docs);
  const factIva = suma(ventas, [30, 33], (d) => n0(d.iva));
  if (factDocs > 0) {
    pushN(503, factDocs);
    pushN(502, factIva);
  }

  // Boletas (35 papel, 39 electrónica). El resumen del RCV puede venir sin
  // cantidad de documentos: en ese caso se omite el código 110 y se avisa.
  const bolFilas = ventas.filter((d) => [35, 39].includes(d.tipo_doc));
  const bolIva = bolFilas.reduce((s, d) => s + n0(d.iva), 0);
  const bolSinCantidad = bolFilas.some((d) => d.docs_incompletos);
  if (bolFilas.length > 0 && bolIva !== 0) {
    if (!bolSinCantidad) {
      pushN(110, bolFilas.reduce((s, d) => s + d.docs, 0));
    } else {
      adv.push(
        "Boletas: el RCV trae solo el resumen sin cantidad de documentos — completa el código 110 (cantidad de boletas) en la pantalla del SII.",
      );
    }
    pushN(111, bolIva);
  }

  // Notas de débito emitidas (56).
  const ndVDocs = suma(ventas, [56], (d) => d.docs);
  if (ndVDocs > 0) {
    pushN(512, ndVDocs);
    pushN(513, suma(ventas, [56], (d) => n0(d.iva)));
  }

  // Notas de crédito emitidas (60/61): el formulario las RESTA, van en positivo.
  const ncVDocs = suma(ventas, [60, 61], (d) => d.docs);
  if (ncVDocs > 0) {
    pushN(509, ncVDocs);
    pushN(510, Math.abs(suma(ventas, [60, 61], (d) => n0(d.iva))));
  }

  // Tipos de venta no mapeados (retenciones de cambio de sujeto, etc.).
  const ventasMapeadas = new Set([30, 33, 35, 39, 56, 60, 61, ...expTipos, ...exentosTipos]);
  for (const d of ventas.filter((x) => !ventasMapeadas.has(x.tipo_doc))) {
    adv.push(
      `Ventas tipo doc ${d.tipo_doc} (${d.docs} doc/s) no tiene mapeo en el TXT: revísalo en la pantalla del SII.`,
    );
  }

  // ---- Compras (créditos) ----
  // Facturas recibidas del giro (30/33/46) separando la porción de activo fijo.
  const factCompras = compras.filter((d) => [30, 33, 46].includes(d.tipo_doc));
  const afIva = factCompras.reduce((s, d) => s + n0(d.iva_activo_fijo), 0);
  const afDocs = factCompras.reduce((s, d) => s + n0(d.docs_activo_fijo), 0);
  const giroIva = factCompras.reduce((s, d) => s + n0(d.iva), 0) - afIva;
  const giroDocs = factCompras.reduce((s, d) => s + d.docs, 0) - afDocs;
  if (giroDocs > 0 && giroIva !== 0) {
    pushN(519, giroDocs);
    pushN(520, giroIva);
  }
  if (afDocs > 0 || afIva !== 0) {
    pushN(524, afDocs);
    pushN(525, afIva);
  }

  // Notas de crédito recibidas (60/61): restan crédito, van en positivo.
  const ncCDocs = suma(compras, [60, 61], (d) => d.docs);
  if (ncCDocs > 0) {
    pushN(527, ncCDocs);
    pushN(528, Math.abs(suma(compras, [60, 61], (d) => n0(d.iva))));
  }

  // Notas de débito recibidas (56).
  const ndCDocs = suma(compras, [56], (d) => d.docs);
  if (ndCDocs > 0) {
    pushN(531, ndCDocs);
    pushN(532, suma(compras, [56], (d) => n0(d.iva)));
  }

  // Compras sin crédito (exentas, IVA no recuperable, uso común): informativas,
  // no se emiten — se avisa para completarlas en pantalla si corresponde.
  const sinCredito = compras.reduce((s, d) => s + n0(d.iva_no_recuperable), 0);
  if (sinCredito !== 0) {
    adv.push(
      `Compras con IVA no recuperable por $${sinCredito.toLocaleString("es-CL")}: revisa las líneas sin derecho a crédito (códigos 564/521) en la pantalla del SII.`,
    );
  }
  const usoComun = compras.reduce((s, d) => s + n0(d.iva_uso_comun), 0);
  if (usoComun !== 0) {
    adv.push(
      `Compras con IVA de uso común por $${usoComun.toLocaleString("es-CL")}: la proporcionalidad no va en el TXT, ajústala en la pantalla del SII.`,
    );
  }

  // ---- Cuadratura del IVA contra el desglose del panel ----
  const debitos = factIva + bolIva
    + suma(ventas, [56], (d) => n0(d.iva))
    + suma(ventas, [60, 61], (d) => n0(d.iva)); // NC negativas: restan solas
  const creditos = giroIva + afIva
    + suma(compras, [56], (d) => n0(d.iva))
    + suma(compras, [60, 61], (d) => n0(d.iva));
  const ivaRcv = debitos - creditos;
  const ivaPanel = datos.montoIva;
  if (ivaPanel !== null && redondear(ivaRcv) !== redondear(Number(ivaPanel))) {
    adv.push(
      `El IVA según RCV ($${ivaRcv.toLocaleString("es-CL")}) no cuadra con el IVA del panel ($${Number(ivaPanel).toLocaleString("es-CL")}): revisa antes de presentar (¿remanente del mes anterior — código 504 — u otro ajuste?).`,
    );
  }
  if (ivaRcv < 0) {
    adv.push(
      "El período queda con remanente de crédito fiscal: verifica el código 77 (remanente período siguiente) en la pantalla del SII.",
    );
  }

  // ---- Impuestos de renta (del ciclo del panel) ----
  const impUnico = n0(datos.impUnico);
  if (impUnico !== 0) pushN(48, impUnico);

  const retenciones = n0(datos.retenciones);
  if (retenciones !== 0) pushN(151, retenciones);
  const retBd = datos.retencionHonorariosBd;
  if (
    retBd !== null &&
    retBd !== undefined &&
    redondear(retenciones) !== redondear(Number(retBd))
  ) {
    adv.push(
      `Las retenciones del panel ($${retenciones.toLocaleString("es-CL")}) no cuadran con la retención de BHE recibidas + BTE emitidas ($${Number(retBd).toLocaleString("es-CL")}): confirma el código 151.`,
    );
  }

  // PPM: base = ingresos brutos del giro según RCV (netos + exentos, las NC
  // restan solas). La tasa se deduce del monto que dejó la contadora.
  const ppm = n0(datos.ppm);
  if (ppm !== 0) {
    const base = ventas.reduce((s, d) => s + n0(d.neto) + n0(d.exento), 0);
    if (base > 0) {
      pushN(563, base);
      const tasa = deducirTasaPpm(base, ppm);
      if (tasa !== null) {
        grupos.push(grupoAlfanumerico(115, formatearTasa(tasa)));
        codigos.push({ codigo: 115, glosa: GLOSAS[115], valor: `${formatearTasa(tasa)}%` });
      } else {
        adv.push(
          "No se pudo deducir la tasa de PPM desde el monto del panel: completa el código 115 (tasa) en la pantalla del SII.",
        );
      }
    } else {
      adv.push(
        "PPM sin ventas en el RCV: se emite solo el monto (código 62); completa la base imponible (563) y la tasa (115) en la pantalla del SII.",
      );
    }
    pushN(62, ppm);
  }

  // ---- Conceptos del panel que NO tienen código automático ----
  const otros = n0(datos.montoOtros);
  if (otros !== 0) {
    adv.push(
      `El concepto «Otros» del panel ($${otros.toLocaleString("es-CL")}) no tiene código en el TXT (¿crédito SENCE, impuesto adicional, constructoras?): complétalo a mano en la pantalla del SII.`,
    );
  }
  if (n0(datos.ivaPostergado) !== 0) {
    adv.push(
      "Este F29 tiene IVA postergado: la postergación (código 755) se marca en la pantalla del SII, no viene en el TXT.",
    );
  }

  // Versión del formulario 29 (exigido por el formato UPLOAD, actualmente 2).
  pushN(8707, 2);

  return { grupos, codigos, advertencias: adv };
}

/**
 * Deduce la tasa de PPM (%) que usó la contadora: prueba tasas de 0.001% a
 * 5.000% en pasos de 0.001 y devuelve la primera cuyo redondeo calza exacto
 * con el monto (prefiriendo las tasas típicas: 0.125, 0.25, 0.5, 1…).
 */
export function deducirTasaPpm(base: number, ppm: number): number | null {
  const tipicas = [0.125, 0.2, 0.25, 0.3, 0.375, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
  for (const t of tipicas) {
    if (Math.round((base * t) / 100) === Math.round(ppm)) return t;
  }
  for (let m = 1; m <= 5000; m++) {
    const t = m / 1000;
    if (Math.round((base * t) / 100) === Math.round(ppm)) return t;
  }
  return null;
}

/** 0.125 → "0.125"; 0.25 → "0.25"; 1 → "1". */
function formatearTasa(t: number): string {
  return String(t);
}

/** Arma el contenido completo del archivo UPLOAD F29 (líneas de 81, CRLF). */
export function generarUploadF29(datos: DatosF29): ArchivoUploadF29 {
  const { grupos, codigos, advertencias } = construirCodigosF29(datos);
  const rut = partesRut(datos.rut);
  if (!rut) throw new Error(`RUT de la empresa no válido: ${datos.rut}`);

  // Registro tipo 1: 4 grupos por línea; la última se rellena con blancos.
  const lineasDetalle: string[] = [];
  for (let i = 0; i < grupos.length; i += 4) {
    const bloque = grupos.slice(i, i + 4);
    let linea = "1";
    for (const g of bloque) {
      linea += String(g.codigo).padStart(4, "0") + g.signo + g.valor15;
    }
    lineasDetalle.push(linea.padEnd(81, " "));
  }

  // Registro tipo 0: identificación (todos los campos "no aplica" en ceros).
  const totalRegistros = 1 + lineasDetalle.length;
  const linea0 =
    "0" +
    datos.periodo.replace("-", "") + // período AAAAMM 9(06)
    "0029" + // número de formulario 9(04)
    String(totalRegistros).padStart(6, "0") + // total registros 9(06)
    rut.cuerpo.padStart(8, "0") + // RUT 9(08)
    rut.dv + // DV X(01)
    "000" + // código empresa certificada X(03)
    "00" + // versión software 9(02)
    "0000000000" + // checksum contribuyente 9(10)
    "0000000000" + // checksum SII 9(10)
    "000000000" + // folio 9(09)
    "00000000" + // fecha envío 9(08)
    "000000" + // hora ingreso 9(06)
    "WIN".padEnd(7, " "); // plataforma X(07)

  return {
    nombreArchivo: `${rut.cuerpo.padStart(8, "0")}.txt`,
    contenido: [linea0, ...lineasDetalle].join("\r\n") + "\r\n",
    codigos,
    advertencias,
  };
}
