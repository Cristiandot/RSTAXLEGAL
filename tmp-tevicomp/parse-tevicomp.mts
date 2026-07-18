// Harness de carga Tevicomp: parsea los 15 CSV del RCV (compras, ventas
// factura, ventas boleta) SIN tocar la BD. Imprime totales por archivo y deja
// el resultado parseado en JSON para la etapa de inserción.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  decodificarCsv,
  parsearRcv,
  periodoDesdeNombre,
} from "file:///C:/Proyectos/RSTAXLEGAL/app/src/lib/contabilidad/rcv.ts";

const BASE =
  "C:/Users/CristianLópezThienel/OneDrive - Rodríguez Samith Tax & Legal Limitada/RSTL - Clientes/C.20 - Mauricio Miranda/TEVICOMP/02-Contab";
const OUT = "C:/Proyectos/RSTAXLEGAL/app/tmp-tevicomp";
mkdirSync(OUT, { recursive: true });

const PERIODOS = ["202601", "202602", "202603", "202604", "202605"];
const grupos = [
  { dir: "Compras", patron: (p: string) => `RCV_COMPRA_REGISTRO_76819340-1_${p}.csv`, esperado: "compra" },
  { dir: "Ventas/Ventas Factura", patron: (p: string) => `RCV_VENTA_76819340-1_${p}.csv`, esperado: "venta" },
  { dir: "Ventas/Ventas Boleta", patron: (p: string) => `RCV_VENTA_76819340_${p}.csv`, esperado: "venta" },
];

let errores = 0;
for (const g of grupos) {
  console.log(`\n#### ${g.dir} ####`);
  for (const p of PERIODOS) {
    const nombre = g.patron(p);
    const ruta = join(BASE, g.dir, nombre);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(ruta));
    } catch {
      console.log(`${p}: ARCHIVO NO ENCONTRADO (${nombre})`);
      errores++;
      continue;
    }
    const r = parsearRcv(decodificarCsv(bytes));
    if (!r.ok) {
      console.log(`${p}: ERROR PARSER → ${r.error}`);
      errores++;
      continue;
    }
    if (r.libro !== g.esperado) {
      console.log(`${p}: LIBRO INESPERADO (${r.libro}, se esperaba ${g.esperado})`);
      errores++;
      continue;
    }
    const detectado = periodoDesdeNombre(nombre);
    const filas = r.filas as Record<string, unknown>[];
    const sum = (k: string) =>
      filas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const porTipo: Record<string, number> = {};
    for (const f of filas) {
      const t = String(f.tipo_doc);
      porTipo[t] = (porTipo[t] ?? 0) + 1;
    }
    const iva = r.libro === "compra" ? sum("iva_recuperable") : sum("monto_iva");
    console.log(
      `${p} → periodo ${detectado} | ${filas.length} docs | tipos ${JSON.stringify(porTipo)} | exento ${sum("monto_exento").toLocaleString("es-CL")} | neto ${sum("monto_neto").toLocaleString("es-CL")} | IVA ${iva.toLocaleString("es-CL")} | total ${sum("monto_total").toLocaleString("es-CL")} | advertencias ${r.advertencias.length}`,
    );
    if (r.advertencias.length) console.log("   " + r.advertencias.join(" / "));
    const salida = {
      libro: r.libro,
      periodo: `${detectado!.slice(0, 7)}`,
      archivo: nombre,
      filas,
    };
    const tag = g.dir.includes("Boleta") ? "boleta" : g.esperado;
    writeFileSync(join(OUT, `${tag}-${p}.json`), JSON.stringify(salida));
  }
}
console.log(errores === 0 ? "\nTODO PARSEADO SIN ERRORES" : `\n${errores} PROBLEMAS — NO CARGAR`);
