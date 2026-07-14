/**
 * Vistas previas REALES del aviso de F29 (módulo /f29) usando la misma librería
 * que el envío (lib/f29-correo.ts). Caso de muestra: LUCUMO SPA período 2026-06
 * (datos del panel al 14-07-2026), con desglose completo y opción de postergar
 * el IVA — ejemplo para visar la redacción con el contador.
 * Uso: npx tsx preview-correo-f29.ts <salida>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { construirCorreoAvisoF29 } from "./src/lib/f29-correo";
import { htmlCorreoDocumento } from "./src/lib/enviar-correo";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

// LUCUMO SPA · 77.947.675-8 · período 2026-06 (montos reales del módulo F29).
const lucumo = {
  razonSocial: "LUCUMO SPA",
  periodo: "2026-06",
  plazoF29: "2026-07-20",
  montoTotal: 1254677,
  desglose: {
    iva: 1245031,
    impUnico: null,
    retenciones: null,
    ppm: 12227,
    otros: -2581,
  },
};

const CASOS: {
  archivo: string;
  datos: Parameters<typeof construirCorreoAvisoF29>[0];
}[] = [
  {
    // 1) Desglose completo SIN postergación (paga el cliente → botón SII).
    archivo: "f29-1-desglose.html",
    datos: {
      ...lucumo,
      postergacionMonto: null,
      comentarioContador: null,
      pagaRs: false,
      fechaRecepcionFondos: null,
    },
  },
  {
    // 2) Con OPCIÓN DE POSTERGAR el IVA + nota del contador (ejemplo para
    //    visar la redacción con Danilo antes de usarla con clientes).
    archivo: "f29-2-postergacion.html",
    datos: {
      ...lucumo,
      postergacionMonto: 1245031,
      comentarioContador:
        "Este mes puede postergar el pago del IVA completo. Si le acomoda, respóndanos y presentamos el F29 con la postergación.",
      pagaRs: false,
      fechaRecepcionFondos: null,
    },
  },
  {
    // 3) Paga RS: caja de recepción de fondos (2 días hábiles antes).
    archivo: "f29-3-paga-rs.html",
    datos: {
      ...lucumo,
      postergacionMonto: null,
      comentarioContador: null,
      pagaRs: true,
      fechaRecepcionFondos: "2026-07-16",
    },
  },
];

for (const caso of CASOS) {
  const { titulo, cuerpo } = construirCorreoAvisoF29(caso.datos);
  const html = htmlCorreoDocumento({ titulo, cuerpo });
  writeFileSync(join(outDir, caso.archivo), html, "utf8");
  console.log(`OK ${caso.archivo} (${html.length} bytes)`);
}
