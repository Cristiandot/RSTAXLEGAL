// Genera los INSERT SQL para la carga Tevicomp desde los JSON parseados.
// ON CONFLICT DO NOTHING sobre la llave única por documento.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "C:/Proyectos/RSTAXLEGAL/app/tmp-tevicomp";
const OUT = join(DIR, "sql");
mkdirSync(OUT, { recursive: true });
const CLIENTE = "30d7d596-fc67-4033-a334-1b0b34df955d"; // Tevicomp

const lit = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

const COLS_COMPRA = [
  "tipo_doc", "tipo_compra", "rut_proveedor", "razon_social", "folio",
  "fecha_docto", "fecha_recepcion", "fecha_acuse",
  "monto_exento", "monto_neto", "iva_recuperable", "iva_no_recuperable",
  "codigo_iva_no_rec", "monto_total", "neto_activo_fijo", "iva_activo_fijo",
  "iva_uso_comun", "impto_sin_credito", "iva_no_retenido",
  "otro_imp_codigo", "otro_imp_valor", "otro_imp_tasa",
];
const COLS_VENTA = [
  "tipo_doc", "tipo_venta", "rut_cliente", "razon_social", "folio",
  "fecha_docto", "fecha_recepcion", "fecha_acuse", "fecha_reclamo",
  "monto_exento", "monto_neto", "monto_iva", "monto_total",
  "iva_retenido_total", "iva_retenido_parcial", "iva_no_retenido",
  "iva_propio", "iva_terceros", "iva_fuera_plazo", "credito_constructoras",
  "otro_imp_codigo", "otro_imp_valor", "otro_imp_tasa",
];

for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".json") && /^(compra|venta|boleta)-/.test(f))) {
  const { libro, periodo, archivo: origen, filas } = JSON.parse(
    readFileSync(join(DIR, archivo), "utf-8"),
  ) as { libro: string; periodo: string; archivo: string; filas: Record<string, unknown>[] };

  const tabla = libro === "compra" ? "rcv_compras" : "rcv_ventas";
  const cols = libro === "compra" ? COLS_COMPRA : COLS_VENTA;
  const conflicto =
    libro === "compra"
      ? "(cliente_id, periodo, tipo_doc, rut_proveedor, folio)"
      : "(cliente_id, periodo, tipo_doc, folio)";

  const sentencias: string[] = [];
  for (let i = 0; i < filas.length; i += 120) {
    const valores = filas
      .slice(i, i + 120)
      .map(
        (f) =>
          `('${CLIENTE}','${periodo}',${cols.map((c) => lit(f[c])).join(",")},${lit(origen)})`,
      )
      .join(",\n");
    sentencias.push(
      `insert into ${tabla} (cliente_id, periodo, ${cols.join(", ")}, archivo_origen)\nvalues\n${valores}\non conflict ${conflicto} do nothing;`,
    );
  }
  const nombre = archivo.replace(".json", ".sql");
  writeFileSync(join(OUT, nombre), sentencias.join("\n\n"));
  console.log(`${nombre}: ${filas.length} filas, ${sentencias.length} sentencias`);
}
