import { getDocumentProxy } from "unpdf";

/**
 * Parser del PDF mensual "Indicadores Previsionales PREVIRED".
 *
 * El PDF es un formulario de una página cuyo texto sale de pdfjs en orden de
 * dibujo (no de lectura), así que el parseo se hace por COORDENADAS: se agrupan
 * los ítems de texto en filas visuales (misma Y con tolerancia) y para cada
 * etiqueta conocida se toma el primer valor numérico a su derecha en la misma
 * fila. Esto es estable mientras Previred mantenga el layout de la hoja.
 *
 * Convención de período del panel: `periodo` = mes de REMUNERACIONES
 * (ej. la hoja "Pagar en Junio 2026 (Remuneraciones Mayo 2026)" → periodo
 * 2026-05, mes de pago 2026-06).
 */

export type TasaAfp = {
  nombre: string;
  tasa_trabajador: number | null; // cargo del trabajador (dependiente)
  tasa_empleador: number | null; // cargo del empleador
  tasa_total: number | null; // total a pagar dependiente
  tasa_independiente: number | null; // incluye SIS
};

export type TasaAfc = {
  contrato: string;
  empleador: number | null;
  trabajador: number | null;
};

export type TasaTrabajoPesado = {
  calificacion: string;
  total: number | null;
  empleador: number | null;
  trabajador: number | null;
};

export type TramoAsignacion = {
  tramo: string; // "A" | "B" | "C" | "D"
  monto: number;
  desde: number | null; // renta > desde
  hasta: number | null; // renta <= hasta (null = sin tope)
  glosa: string; // requisito de renta tal como viene en la hoja
};

export type IndicadoresPrevired = {
  periodo: string; // YYYY-MM (remuneraciones)
  mes_pago: string; // YYYY-MM (cotizaciones a pagar)
  uf_ultimo_dia: number | null;
  uf_ultimo_dia_anterior: number | null;
  utm: number | null;
  uta: number | null;
  tope_imponible_afp: number | null;
  tope_imponible_ips: number | null;
  tope_imponible_afc: number | null;
  tope_uf_afp: number | null;
  tope_uf_ips: number | null;
  tope_uf_afc: number | null;
  rmi_general: number | null;
  rmi_menores_mayores: number | null;
  rmi_casa_particular: number | null;
  rmi_no_remuneracional: number | null;
  tasa_sis: number | null;
  tasa_seguro_social: number | null;
  salud_ccaf: number | null;
  salud_fonasa_ccaf: number | null;
  apv_tope_mensual: number | null;
  apv_tope_anual: number | null;
  deposito_convenido_tope: number | null;
  afp: TasaAfp[];
  afc: TasaAfc[];
  trabajos_pesados: TasaTrabajoPesado[];
  asignacion_familiar: TramoAsignacion[];
  advertencias: string[]; // campos que no se pudieron leer del PDF
};

/** Fila de la tabla `indicadores_previred` tal como vuelve de Supabase. */
export type IndicadoresRow = Omit<
  IndicadoresPrevired,
  "mes_pago" | "advertencias"
> & {
  id: string;
  datos: { mes_pago?: string } & Record<string, unknown>;
  pdf_path: string | null;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
};

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

type Item = { s: string; x: number; y: number };
type Fila = { y: number; items: Item[] };

/** "$ 3.654.962" → 3654962 · "$ 40.610,69" → 40610.69 · "11,44%" → 11.44 · "4,2% R.I." → 4.2 */
function num(texto: string): number | null {
  const m = texto.replace(/\s/g, "").match(/-?[\d.]+(?:,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function esNumerico(s: string): boolean {
  return /[\d]/.test(s) && /^[$\s]*-?[\d.,]+(?:\s*%(\s*R\.I\.)?)?$/i.test(s.trim());
}

/** Agrupa los ítems de texto en filas visuales (Y con tolerancia). */
function agruparFilas(items: Item[], tolerancia = 4): Fila[] {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const filas: Fila[] = [];
  for (const it of orden) {
    const fila = filas.find((f) => Math.abs(f.y - it.y) <= tolerancia);
    if (fila) fila.items.push(it);
    else filas.push({ y: it.y, items: [it] });
  }
  for (const f of filas) f.items.sort((a, b) => a.x - b.x);
  return filas;
}

/** Primer valor numérico a la derecha de la etiqueta, en su misma fila. */
function valorDerecha(filas: Fila[], etiqueta: RegExp): number | null {
  for (const f of filas) {
    const i = f.items.findIndex((it) => etiqueta.test(it.s));
    if (i === -1) continue;
    const label = f.items[i];
    const val = f.items.find((it) => it.x > label.x && esNumerico(it.s));
    if (val) return num(val.s);
  }
  return null;
}

/** Todos los valores numéricos a la derecha de la etiqueta, en su misma fila. */
function valoresDerecha(filas: Fila[], etiqueta: RegExp): (number | null)[] {
  for (const f of filas) {
    const i = f.items.findIndex((it) => etiqueta.test(it.s));
    if (i === -1) continue;
    const label = f.items[i];
    return f.items
      .filter((it) => it.x > label.x && (esNumerico(it.s) || it.s.trim() === "-"))
      .map((it) => (it.s.trim() === "-" ? null : num(it.s)));
  }
  return [];
}

function mesATexto(mes: string, anio: string): string | null {
  const mm = MESES[mes.toLowerCase()];
  return mm ? `${anio}-${mm}` : null;
}

/**
 * Parsea el PDF de indicadores Previred. Lanza Error solo si el archivo no es
 * la hoja de Previred (no se encuentra el título con los períodos); cualquier
 * campo individual ilegible queda en null y se reporta en `advertencias`.
 */
export async function parsearPdfPrevired(
  archivo: Uint8Array,
): Promise<IndicadoresPrevired> {
  const pdf = await getDocumentProxy(archivo);
  const pagina = await pdf.getPage(1);
  const contenido = await pagina.getTextContent();
  const items: Item[] = (
    contenido.items as { str: string; transform: number[] }[]
  )
    .map((i) => ({
      s: i.str.trim(),
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
    }))
    .filter((i) => i.s.length > 0);

  const filas = agruparFilas(items);
  const textoCompleto = items.map((i) => i.s).join(" ");

  // ── Períodos desde el título ──────────────────────────────────────────────
  const titulo = textoCompleto.match(
    /Pagar en\s+(\p{L}+)\s+(?:de[l]?\s+)?(\d{4}).*?Remuneraciones\s+(\p{L}+)\s+(?:de[l]?\s+)?(\d{4})/iu,
  );
  if (!titulo) {
    throw new Error(
      "El archivo no parece ser la hoja de Indicadores Previsionales de Previred (no se encontró el título con los períodos).",
    );
  }
  const mes_pago = mesATexto(titulo[1], titulo[2]);
  const periodo = mesATexto(titulo[3], titulo[4]);
  if (!periodo || !mes_pago) {
    throw new Error(`No se reconocieron los meses del título ("${titulo[0]}").`);
  }

  const advertencias: string[] = [];
  const req = <T>(valor: T | null, campo: string): T | null => {
    if (valor === null) advertencias.push(campo);
    return valor;
  };

  // ── Valores simples (etiqueta → valor a la derecha) ───────────────────────
  const uf_ultimo_dia = req(valorDerecha(filas, /^Al 3[01] de .+ del? \d{4}/), "UF último día del mes");
  // La segunda fila "Al ..." es la UF del mes anterior: misma etiqueta, fila siguiente
  const filasUf = filas.filter((f) => f.items.some((it) => /^Al \d+ de .+ del? \d{4}/.test(it.s)));
  const uf_ultimo_dia_anterior = req(
    filasUf.length >= 2
      ? (filasUf[1].items.find((it) => esNumerico(it.s)) ? num(filasUf[1].items.find((it) => esNumerico(it.s))!.s) : null)
      : null,
    "UF último día del mes anterior",
  );

  // UTM/UTA: fila que contiene la etiqueta "Mes YYYY" bajo el encabezado UTM/UTA
  let utm: number | null = null;
  let uta: number | null = null;
  for (const f of filas) {
    const i = f.items.findIndex((it) => /^\p{L}+ \d{4}$/u.test(it.s) && MESES[it.s.split(" ")[0].toLowerCase()]);
    if (i === -1) continue;
    const nums = f.items.filter((it) => it.x > f.items[i].x && esNumerico(it.s));
    if (nums.length >= 2) {
      utm = num(nums[0].s);
      uta = num(nums[1].s);
      break;
    }
  }
  req(utm, "UTM");
  req(uta, "UTA");

  // Topes imponibles: el N° de UF viene en la etiqueta misma
  const etiquetaTope = (re: RegExp) => {
    for (const f of filas) {
      const it = f.items.find((i2) => re.test(i2.s));
      if (it) {
        const uf = it.s.match(/\(([\d.,]+)\s*UF\)/);
        return uf ? num(uf[1]) : null;
      }
    }
    return null;
  };
  const tope_imponible_afp = req(valorDerecha(filas, /afiliados a una AFP/), "Tope imponible AFP");
  const tope_imponible_ips = req(valorDerecha(filas, /afiliados al INP|afiliados al IPS/), "Tope imponible INP/IPS");
  const tope_imponible_afc = req(valorDerecha(filas, /Para Seguro de Cesant/), "Tope imponible AFC");
  const tope_uf_afp = etiquetaTope(/afiliados a una AFP/);
  const tope_uf_ips = etiquetaTope(/afiliados al INP|afiliados al IPS/);
  const tope_uf_afc = etiquetaTope(/Para Seguro de Cesant/);

  const rmi_general = req(valorDerecha(filas, /^Trab\.? Dependientes e Independientes/), "Renta mínima dep./indep.");
  const rmi_menores_mayores = req(valorDerecha(filas, /^Menores de 18 y Mayores de 65/), "Renta mínima <18/>65");
  const rmi_casa_particular = req(valorDerecha(filas, /^Trabajadores de Casa Particular/), "Renta mínima casa particular");
  const rmi_no_remuneracional = req(valorDerecha(filas, /^Para fines no remuneracionales/), "Renta mínima fines no remuneracionales");

  const tasa_sis = req(valorDerecha(filas, /^Tasa SIS/), "Tasa SIS");
  const tasa_seguro_social = req(valorDerecha(filas, /^Expectativa de Vida/), "Seguro social (expectativa de vida)");
  const salud_ccaf = req(valorDerecha(filas, /^CCAF$/), "Salud CCAF");
  const salud_fonasa_ccaf = req(valorDerecha(filas, /^FONASA$/), "Salud FONASA (CCAF)");

  const apv_tope_mensual = req(valorDerecha(filas, /^Tope Mensual \(50 UF\)/), "APV tope mensual");
  const apv_tope_anual = req(valorDerecha(filas, /^Tope Anual \(600 UF\)/), "APV tope anual");
  const deposito_convenido_tope = req(valorDerecha(filas, /^Tope Anual \(900 UF\)/), "Depósito convenido tope anual");

  // ── Tabla AFP: filas bajo el encabezado "AFP" con 4 porcentajes a la izquierda ──
  const afp: TasaAfp[] = [];
  const filaHeaderAfp = filas.find((f) => f.items.some((it) => it.s === "AFP"));
  if (filaHeaderAfp) {
    for (const f of filas) {
      if (f.y >= filaHeaderAfp.y) continue;
      const primero = f.items[0];
      if (!primero || primero.x > 60 || !/^[A-ZÁÉÍÓÚ][\w ÁÉÍÓÚáéíóúñ]*$/u.test(primero.s)) continue;
      const pcts = f.items.filter((it) => it.x > primero.x && it.x < 290 && /%/.test(it.s));
      if (pcts.length < 4) continue;
      afp.push({
        nombre: primero.s,
        tasa_trabajador: num(pcts[0].s),
        tasa_empleador: num(pcts[1].s),
        tasa_total: num(pcts[2].s),
        tasa_independiente: num(pcts[3].s),
      });
    }
  }
  if (afp.length === 0) advertencias.push("Tabla de tasas AFP");

  // ── AFC ───────────────────────────────────────────────────────────────────
  const afc: TasaAfc[] = [];
  const contratosAfc: [RegExp, string][] = [
    [/^Plazo Indefinido$/, "Plazo indefinido"],
    [/^Plazo Fijo$/, "Plazo fijo"],
    [/^Plazo Indefinido 11/, "Plazo indefinido 11 años o más"],
    [/^Trabajador de Casa Particular/, "Trabajador de casa particular"],
  ];
  for (const [re, nombre] of contratosAfc) {
    const vals = valoresDerecha(filas, re);
    if (vals.length > 0) {
      afc.push({ contrato: nombre, empleador: vals[0] ?? null, trabajador: vals[1] ?? null });
    }
  }
  if (afc.length === 0) advertencias.push("Tabla seguro de cesantía (AFC)");

  // ── Trabajos pesados ──────────────────────────────────────────────────────
  const trabajos_pesados: TasaTrabajoPesado[] = [];
  for (const [re, nombre] of [
    [/^Trabajo Pesado$/, "Trabajo pesado"],
    [/^Trabajo Menos Pesado$/, "Trabajo menos pesado"],
  ] as [RegExp, string][]) {
    const vals = valoresDerecha(filas, re);
    if (vals.length >= 3) {
      trabajos_pesados.push({
        calificacion: nombre,
        total: vals[0],
        empleador: vals[1],
        trabajador: vals[2],
      });
    }
  }

  // ── Asignación familiar ───────────────────────────────────────────────────
  const asignacion_familiar: TramoAsignacion[] = [];
  for (const f of filas) {
    const i = f.items.findIndex((it) => /^\d \([A-D]\)$/.test(it.s));
    if (i === -1) continue;
    const tramo = f.items[i].s.match(/\(([A-D])\)/)![1];
    const resto = f.items.filter((it) => it.x > f.items[i].x);
    const montoItem = resto.find((it) => esNumerico(it.s) || it.s.trim() === "-");
    const glosa = resto
      .filter((it) => it !== montoItem)
      .map((it) => it.s)
      .join(" ");
    // "Renta > $ 631.976 < = $ 923.067" → desde/hasta; "Renta < ó = $ 631.976" → solo hasta
    const montos = glosa.match(/\$\s*[\d.]+/g)?.map((s) => num(s)) ?? [];
    const tieneDesde = /Renta\s*>/.test(glosa);
    const tieneHasta = /<\s*=|<\s*ó\s*=|≤/.test(glosa);
    asignacion_familiar.push({
      tramo,
      monto: montoItem && montoItem.s.trim() !== "-" ? (num(montoItem.s) ?? 0) : 0,
      desde: tieneDesde ? (montos[0] ?? null) : null,
      hasta: tieneHasta ? (montos[tieneDesde ? 1 : 0] ?? null) : null,
      glosa,
    });
  }
  if (asignacion_familiar.length === 0) advertencias.push("Tramos de asignación familiar");

  return {
    periodo,
    mes_pago,
    uf_ultimo_dia,
    uf_ultimo_dia_anterior,
    utm,
    uta,
    tope_imponible_afp,
    tope_imponible_ips,
    tope_imponible_afc,
    tope_uf_afp,
    tope_uf_ips,
    tope_uf_afc,
    rmi_general,
    rmi_menores_mayores,
    rmi_casa_particular,
    rmi_no_remuneracional,
    tasa_sis,
    tasa_seguro_social,
    salud_ccaf,
    salud_fonasa_ccaf,
    apv_tope_mensual,
    apv_tope_anual,
    deposito_convenido_tope,
    afp,
    afc,
    trabajos_pesados,
    asignacion_familiar,
    advertencias,
  };
}
