/**
 * Motor de centralización contable mensual.
 *
 * Toma los documentos del período (RCV compras/ventas, honorarios, sueldos,
 * otros gastos, F29) y genera las líneas del Libro Diario (CONTAB) siguiendo
 * las reglas de centralización del proceso de RS Tax & Legal.
 *
 * Convención de signo: las notas de crédito (60/61/112) vienen con montos
 * NEGATIVOS desde la base. Las funciones `debe()` / `haber()` invierten solos
 * el lado cuando el monto es negativo (un monto negativo en el Debe pasa al
 * Haber en positivo, y viceversa) — exactamente lo que pide el proceso para
 * las NC. Por eso NO hay que tratar las NC como caso especial acá.
 *
 * Cuadratura: cada asiento generado respeta partida doble (Σ Debe = Σ Haber).
 * Los "otros impuestos" no recuperables de compras se suman al gasto (son
 * costo); los de ventas se acreditan a 2.01.12.07 (Otros Impuestos por Pagar).
 */

export type TipoComprobante = "TRASPASO" | "EGRESO" | "INGRESO";
export type OrigenAsiento =
  | "compras"
  | "ventas"
  | "honorarios"
  | "sueldos"
  | "otros_gastos"
  | "f29";

export type LineaDiario = {
  tipo_comprobante: TipoComprobante;
  fecha: string; // YYYY-MM-DD (último día del período, salvo anticipos)
  comentario: string;
  cuenta: string; // código de cuenta
  debe: number;
  haber: number;
  rut_ficha: string | null;
  razon_ficha: string | null;
  nombre_doc: string | null;
  folio_doc: string | null;
  origen: OrigenAsiento;
  n_mov: number;
};

// ── Cuentas fijas del proceso ──
const CTA = {
  banco: "1.01.01.02",
  deudores: "1.01.05.01",
  ivaCF: "1.01.10.01",
  ppm: "1.01.10.02",
  proveedores: "2.01.07.01",
  honorariosPorPagar: "2.01.07.03",
  sueldosPorPagar: "2.01.08.01",
  imposiciones: "2.01.12.01",
  impUnico: "2.01.12.02",
  imp2daCat: "2.01.12.03",
  ivaDF: "2.01.12.04",
  impuestosPorPagar: "2.01.12.05",
  otrosImpuestos: "2.01.12.07",
  ventasAfectas: "3.01.01.01",
  gastoDefault: "4.01.01.99",
  honorariosGasto: "4.01.03.01",
} as const;

export const NOMBRE_TIPO_DOC: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura No Afecta o Exenta Electrónica",
  39: "Boleta Electrónica",
  41: "Boleta Exenta Electrónica",
  43: "Liquidación-Factura Electrónica",
  46: "Factura de Compra Electrónica",
  56: "Nota de Débito Electrónica",
  61: "Nota de Crédito Electrónica",
  110: "Factura de Exportación Electrónica",
  111: "Nota de Débito de Exportación Electrónica",
  112: "Nota de Crédito de Exportación Electrónica",
};

function nombreDoc(tipo: number): string {
  return NOMBRE_TIPO_DOC[tipo] ?? `Documento tipo ${tipo}`;
}

/** Último día del período "YYYY-MM" como "YYYY-MM-DD". */
export function ultimoDiaPeriodo(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const dia = new Date(y, m, 0).getDate(); // día 0 del mes siguiente = último del actual
  return `${periodo}-${String(dia).padStart(2, "0")}`;
}

const r = (n: number) => Math.round(n);

// ── Inputs ──
export type CompraInput = {
  tipo_doc: number;
  cuenta_codigo: string | null;
  rut_proveedor: string;
  razon_social: string | null;
  folio: string;
  monto_exento: number;
  monto_neto: number;
  iva_recuperable: number;
  iva_no_recuperable: number;
  impto_sin_credito: number;
  otro_imp_valor: number;
  monto_total: number;
  pagado_pct: number;
};

export type VentaInput = {
  tipo_doc: number;
  rut_cliente: string | null;
  razon_social: string | null;
  folio: string;
  monto_exento: number;
  monto_neto: number;
  monto_iva: number;
  otro_imp_valor: number;
  monto_total: number;
  pagado_pct: number;
};

export type HonorarioInput = {
  numero: string;
  rut_emisor: string | null;
  nombre_emisor: string | null;
  cuenta_codigo: string | null;
  brutos: number;
  retencion: number;
  liquido: number;
  pagado_pct: number;
};

export type F29Input = {
  ppm: number;
  imp_unico: number;
  imp_2da_categoria: number;
};

export type CentralizacionInput = {
  periodo: string;
  compras: CompraInput[];
  ventas: VentaInput[];
  honorarios: HonorarioInput[];
  f29: F29Input | null;
};

// ── Builder de líneas con inversión automática de signo ──
class Diario {
  lineas: LineaDiario[] = [];
  private base: Omit<LineaDiario, "cuenta" | "debe" | "haber" | "n_mov">;
  private n = 0;

  constructor(base: Omit<LineaDiario, "cuenta" | "debe" | "haber" | "n_mov">) {
    this.base = base;
  }

  nuevoComprobante() {
    this.n = 0;
  }

  /** Línea cuyo monto natural va al DEBE (si es negativo, va al HABER positivo). */
  debe(cuenta: string, monto: number) {
    this.push(cuenta, monto >= 0 ? monto : 0, monto < 0 ? -monto : 0);
  }

  /** Línea cuyo monto natural va al HABER (si es negativo, va al DEBE positivo). */
  haber(cuenta: string, monto: number) {
    this.push(cuenta, monto < 0 ? -monto : 0, monto >= 0 ? monto : 0);
  }

  private push(cuenta: string, debe: number, haber: number) {
    if (r(debe) === 0 && r(haber) === 0) return; // omitir líneas en cero
    this.n += 1;
    this.lineas.push({
      ...this.base,
      cuenta,
      debe: r(debe),
      haber: r(haber),
      n_mov: this.n,
    });
  }
}

/**
 * Genera todas las líneas del libro diario del período.
 * Devuelve las líneas + un detalle de advertencias/pendientes.
 */
export function generarLibroDiario(input: CentralizacionInput): {
  lineas: LineaDiario[];
  advertencias: string[];
} {
  const { periodo, compras, ventas, honorarios, f29 } = input;
  const fecha = ultimoDiaPeriodo(periodo);
  const lineas: LineaDiario[] = [];
  const advertencias: string[] = [];
  const perTxt = periodo.replace("-", "");
  // Residuo entre el total del documento y la suma de componentes clasificados
  // (redondeos del SII + casos especiales como liquidación-factura tipo 43).
  let residualCompras = 0;
  let residualVentas = 0;
  const baseCompra = (c: CompraInput) =>
    c.monto_neto +
    c.monto_exento +
    c.iva_no_recuperable +
    c.impto_sin_credito +
    c.otro_imp_valor +
    c.iva_recuperable;
  const baseVenta = (v: VentaInput) =>
    v.monto_neto + v.monto_exento + v.monto_iva + v.otro_imp_valor;

  // Liquidación-factura (tipo 43): el contribuyente actúa como comisionista/
  // mandatario; la venta bruta es del mandante, no suya. Se EXCLUYE de la
  // centralización normal (inflaría ventas/IVA con montos que no le pertenecen)
  // y se informa aparte para su tratamiento especial (solo la comisión es ingreso).
  const TIPOS_ESPECIALES = new Set([43]);
  const ventasCent = ventas.filter((v) => !TIPOS_ESPECIALES.has(v.tipo_doc));
  const comprasCent = compras.filter((c) => !TIPOS_ESPECIALES.has(c.tipo_doc));
  const liqVentas = ventas.filter((v) => TIPOS_ESPECIALES.has(v.tipo_doc));
  const liqCompras = compras.filter((c) => TIPOS_ESPECIALES.has(c.tipo_doc));

  // ───────────────────────── COMPRAS ─────────────────────────
  for (const c of comprasCent) {
    const cuentaGasto = c.cuenta_codigo ?? CTA.gastoDefault;
    const meta = {
      tipo_comprobante: "TRASPASO" as TipoComprobante,
      fecha,
      comentario: `CENTRALIZACIÓN DEL PERÍODO ${perTxt}`,
      rut_ficha: c.rut_proveedor,
      razon_ficha: c.razon_social,
      nombre_doc: nombreDoc(c.tipo_doc),
      folio_doc: c.folio,
      origen: "compras" as OrigenAsiento,
    };
    const d = new Diario(meta);
    // Gasto: neto + exento + IVA no recuperable + impto sin crédito + otros impuestos (costo)
    const gasto =
      c.monto_neto +
      c.monto_exento +
      c.iva_no_recuperable +
      c.impto_sin_credito +
      c.otro_imp_valor;
    d.debe(cuentaGasto, gasto);
    d.debe(CTA.ivaCF, c.iva_recuperable);
    // Proveedores = suma de componentes (garantiza partida doble); el residuo
    // vs. monto_total (redondeos / liquidación-factura) se informa aparte.
    d.haber(CTA.proveedores, baseCompra(c));
    residualCompras += c.monto_total - baseCompra(c);
    lineas.push(...d.lineas);
  }
  // Pago de compras (EGRESO) según % pagado
  {
    const d = new Diario({
      tipo_comprobante: "EGRESO",
      fecha,
      comentario: `POR CENTRALIZACIÓN PAGOS DEL PERÍODO ${perTxt}`,
      rut_ficha: null,
      razon_ficha: null,
      nombre_doc: "Compras del período",
      folio_doc: perTxt,
      origen: "compras",
    });
    const pago = comprasCent.reduce(
      (a, c) => a + (baseCompra(c) * (c.pagado_pct ?? 100)) / 100,
      0,
    );
    d.debe(CTA.proveedores, pago);
    d.haber(CTA.banco, pago);
    lineas.push(...d.lineas);
  }

  // ───────────────────────── VENTAS ─────────────────────────
  for (const v of ventasCent) {
    const meta = {
      tipo_comprobante: "TRASPASO" as TipoComprobante,
      fecha,
      comentario: `CENTRALIZACIÓN DEL PERÍODO ${perTxt}`,
      rut_ficha: v.rut_cliente,
      razon_ficha: v.razon_social,
      nombre_doc: nombreDoc(v.tipo_doc),
      folio_doc: v.folio,
      origen: "ventas" as OrigenAsiento,
    };
    const d = new Diario(meta);
    // Deudores = suma de componentes (garantiza partida doble); el residuo vs.
    // monto_total (liquidación-factura tipo 43, redondeos) se informa aparte.
    d.debe(CTA.deudores, baseVenta(v));
    d.haber(CTA.ventasAfectas, v.monto_neto + v.monto_exento);
    d.haber(CTA.ivaDF, v.monto_iva);
    d.haber(CTA.otrosImpuestos, v.otro_imp_valor); // impuesto específico, etc.
    residualVentas += v.monto_total - baseVenta(v);
    lineas.push(...d.lineas);
  }
  // Cobro de ventas (INGRESO) según % pagado
  {
    const d = new Diario({
      tipo_comprobante: "INGRESO",
      fecha,
      comentario: `POR CENTRALIZACIÓN PAGOS DEL PERÍODO ${perTxt}`,
      rut_ficha: null,
      razon_ficha: null,
      nombre_doc: "Ventas del período",
      folio_doc: perTxt,
      origen: "ventas",
    });
    const cobro = ventasCent.reduce(
      (a, v) => a + (baseVenta(v) * (v.pagado_pct ?? 100)) / 100,
      0,
    );
    d.debe(CTA.banco, cobro);
    d.haber(CTA.deudores, cobro);
    lineas.push(...d.lineas);
  }

  // ─────────────────────── HONORARIOS ───────────────────────
  for (const h of honorarios) {
    const cuentaGasto = h.cuenta_codigo ?? CTA.honorariosGasto;
    const meta = {
      tipo_comprobante: "TRASPASO" as TipoComprobante,
      fecha,
      comentario: `CENTRALIZACIÓN DEL PERÍODO ${perTxt}`,
      rut_ficha: h.rut_emisor,
      razon_ficha: h.nombre_emisor,
      nombre_doc: "Boleta de Honorario",
      folio_doc: h.numero,
      origen: "honorarios" as OrigenAsiento,
    };
    const d = new Diario(meta);
    d.debe(cuentaGasto, h.brutos);
    d.haber(CTA.imp2daCat, h.retencion);
    d.haber(CTA.honorariosPorPagar, h.liquido);
    lineas.push(...d.lineas);
  }
  // Pago de honorarios (EGRESO)
  if (honorarios.length > 0) {
    const d = new Diario({
      tipo_comprobante: "EGRESO",
      fecha,
      comentario: `CENTRALIZACIÓN DE PAGOS DEL PERÍODO ${perTxt}`,
      rut_ficha: null,
      razon_ficha: null,
      nombre_doc: "Honorarios del período",
      folio_doc: perTxt,
      origen: "honorarios",
    });
    const pago = honorarios.reduce(
      (a, h) => a + (h.liquido * (h.pagado_pct ?? 100)) / 100,
      0,
    );
    d.debe(CTA.honorariosPorPagar, pago);
    d.haber(CTA.banco, pago);
    lineas.push(...d.lineas);
  }

  // ─────────────────────── F29 (mensual) ───────────────────────
  // IVA Débito = Σ IVA ventas ; IVA Crédito = Σ IVA recuperable compras (tope = débito; resto = remanente)
  const ivaDF = ventasCent.reduce((a, v) => a + v.monto_iva, 0);
  const ivaCFtotal = comprasCent.reduce((a, c) => a + c.iva_recuperable, 0);
  const ivaCFusado = ivaCFtotal > ivaDF ? ivaDF : ivaCFtotal;
  // IUT y 2da categoría se toman de los libros que crean la obligación (sueldos/honorarios),
  // para no dejar saldos descuadrados. Hoy: IUT pendiente (sin sueldos); 2da cat = Σ retención honorarios.
  const iut = 0; // pendiente: requiere Libro de Remuneraciones
  const seg2da = honorarios.reduce((a, h) => a + h.retencion, 0);
  const ppm = f29?.ppm ?? 0;
  {
    const d = new Diario({
      tipo_comprobante: "TRASPASO",
      fecha,
      comentario: `CENTRALIZACIÓN DEL F29 PERÍODO ${perTxt}`,
      rut_ficha: null,
      razon_ficha: null,
      nombre_doc: null,
      folio_doc: null,
      origen: "f29",
    });
    d.debe(CTA.ivaDF, ivaDF); // cierra el IVA débito acumulado por ventas
    d.haber(CTA.ivaCF, ivaCFusado); // cierra el IVA crédito (deja remanente si CF>DF)
    d.debe(CTA.impUnico, iut);
    d.debe(CTA.imp2daCat, seg2da); // cierra la 2da cat. acreditada en honorarios
    d.debe(CTA.ppm, ppm);
    const porPagar = ivaDF + iut + seg2da + ppm - ivaCFusado;
    d.haber(CTA.impuestosPorPagar, porPagar);
    lineas.push(...d.lineas);
  }

  // ── Pendientes (esqueleto) ──
  if (honorarios.length === 0)
    advertencias.push("Honorarios: sin datos del período (pendiente de cargar).");
  advertencias.push(
    "Sueldos / Leyes sociales: pendiente — requiere Libro de Remuneraciones y Costo Empresa (Previred).",
  );
  advertencias.push(
    "Otros gastos, pago F29 y pago Previred: pendientes — se incorporan cuando exista la data.",
  );
  if (ivaCFtotal > ivaDF)
    advertencias.push(
      `IVA Crédito ($${ivaCFtotal.toLocaleString("es-CL")}) supera al Débito ($${ivaDF.toLocaleString("es-CL")}): hay remanente de crédito fiscal a favor.`,
    );

  if (liqVentas.length > 0 || liqCompras.length > 0) {
    const totLiq = [...liqVentas, ...liqCompras].reduce(
      (a, d) => a + Math.abs(d.monto_total),
      0,
    );
    advertencias.push(
      `Liquidaciones-factura (tipo 43) EXCLUIDAS de la centralización: ${liqVentas.length + liqCompras.length} documento(s) por $${r(totLiq).toLocaleString("es-CL")}. Son operaciones de comisionista (la venta bruta pertenece al mandante) — requieren tratamiento especial; solo la comisión es ingreso propio.`,
    );
  }

  if (Math.abs(residualVentas) >= 1 || Math.abs(residualCompras) >= 1)
    advertencias.push(
      `Diferencias documento vs. componentes clasificados: ventas $${r(residualVentas).toLocaleString("es-CL")}, compras $${r(residualCompras).toLocaleString("es-CL")}. Incluye la liquidación-factura (tipo 43) y redondeos del SII — requiere tratamiento especial. NO afecta la cuadratura del libro.`,
    );

  return { lineas, advertencias };
}
