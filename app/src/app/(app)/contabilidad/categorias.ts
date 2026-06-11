/**
 * Catálogo de categorías documentales del módulo Contabilidad mensual.
 * Las 4 "principales" forman el mini-checklist de la grilla; el resto se
 * agrupa como adicionales. Mantener sincronizado con el CHECK de la tabla
 * `documentos_contables`.
 */
export type CategoriaDocumento =
  | "fact_compras"
  | "fact_ventas"
  | "boleta_ventas"
  | "boleta_compras"
  | "honorarios"
  | "otro_gasto"
  | "otro_ingreso"
  | "otro";

export type CategoriaInfo = {
  value: CategoriaDocumento;
  label: string;
  /** Sigla para el mini-checklist de la grilla. */
  corta: string;
  descripcion: string;
};

export const CATEGORIAS_DOCUMENTO: CategoriaInfo[] = [
  {
    value: "fact_compras",
    label: "Facturas de compras",
    corta: "FC",
    descripcion: "RCV de compras del SII (facturas, NC/ND recibidas).",
  },
  {
    value: "fact_ventas",
    label: "Facturas de ventas",
    corta: "FV",
    descripcion: "RCV de ventas del SII (facturas, NC/ND emitidas).",
  },
  {
    value: "boleta_ventas",
    label: "Ventas con boleta",
    corta: "BV",
    descripcion: "Resumen de ventas con boleta del mes.",
  },
  {
    value: "boleta_compras",
    label: "Compras con boleta",
    corta: "BC",
    descripcion: "Compras del mes respaldadas con boleta.",
  },
  {
    value: "honorarios",
    label: "Boletas de honorarios",
    corta: "BH",
    descripcion: "Boletas de honorarios recibidas o emitidas del mes.",
  },
  {
    value: "otro_gasto",
    label: "Otros gastos",
    corta: "OG",
    descripcion: "Otros egresos del mes (respaldo libre).",
  },
  {
    value: "otro_ingreso",
    label: "Otros ingresos",
    corta: "OI",
    descripcion: "Otros ingresos del mes (respaldo libre).",
  },
];

/** Las que se muestran como checklist en la grilla principal. */
export const CATEGORIAS_PRINCIPALES = CATEGORIAS_DOCUMENTO.slice(0, 4);

/** Las adicionales (cuentan en el "+N" de la grilla). */
export const CATEGORIAS_ADICIONALES = CATEGORIAS_DOCUMENTO.slice(4);

export const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS_DOCUMENTO.map((c) => [c.value, c.label]),
);
