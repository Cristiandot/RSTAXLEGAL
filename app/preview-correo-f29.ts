/**
 * Vistas previas REALES de los correos del módulo /f29 usando la misma librería
 * que el envío (lib/f29-correo.ts). Caso de muestra: LUCUMO SPA período 2026-06.
 * Genera 4 ejemplos: (1) aviso con detalle, (2) aviso con opción de postergar,
 * (3) comprobante de F29 pagado por la oficina, (4) comprobante con el IVA
 * postergado (se pagó solo lo no postergable).
 * Uso: npx tsx preview-correo-f29.ts <salida>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  construirCorreoAvisoF29,
  construirCorreoF29Pagado,
} from "./src/lib/f29-correo";
import { htmlCorreoDocumento } from "./src/lib/enviar-correo";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

// LUCUMO SPA · 77.947.675-8 · período 2026-06 (montos de referencia).
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
  // 2 días hábiles antes del vencimiento (lo calcula la action vía RPC).
  fechaRecepcionFondos: "2026-07-16",
};

const archivos: { archivo: string; titulo: string; cuerpo: string }[] = [];

// 1) Aviso de F29 con detalle (ofrece las dos formas de pago).
{
  const { titulo, cuerpo } = construirCorreoAvisoF29({
    ...lucumo,
    postergarIva: false,
    comentarioContador: null,
  });
  archivos.push({ archivo: "f29-1-detalle.html", titulo, cuerpo });
}

// 2) Aviso con OPCIÓN DE POSTERGAR el IVA (fecha límite = 2 meses).
{
  const { titulo, cuerpo } = construirCorreoAvisoF29({
    ...lucumo,
    postergarIva: true,
    comentarioContador:
      "Este mes puede postergar el pago del IVA completo. Si le acomoda, respóndanos y presentamos el F29 con la postergación.",
  });
  archivos.push({ archivo: "f29-2-postergacion.html", titulo, cuerpo });
}

// 3) Comprobante de F29 pagado por la oficina (nos depositaron y pagamos).
{
  const { titulo, cuerpo } = construirCorreoF29Pagado({
    razonSocial: lucumo.razonSocial,
    periodo: lucumo.periodo,
    montoPagado: lucumo.montoTotal,
    fechaPago: "2026-07-17",
    numeroOperacion: "104839271",
  });
  archivos.push({ archivo: "f29-3-pagado.html", titulo, cuerpo });
}

// 4) Comprobante con IVA POSTERGADO: se pagó solo lo no postergable (caso real
//    Lúcumo 2026-06 — postergó 1.242.450 y pagó solo el PPM 12.227; el plazo
//    del IVA lo corre al hábil la action: 20-09-2026 domingo → 21-09-2026).
{
  const ivaPostergado = 1242450;
  const { titulo, cuerpo } = construirCorreoF29Pagado({
    razonSocial: lucumo.razonSocial,
    periodo: lucumo.periodo,
    montoPagado: lucumo.montoTotal - ivaPostergado,
    fechaPago: "2026-07-20",
    numeroOperacion: "104839271",
    ivaPostergado,
    plazoIvaPostergado: "2026-09-21",
  });
  archivos.push({ archivo: "f29-4-pagado-postergado.html", titulo, cuerpo });
}

for (const { archivo, titulo, cuerpo } of archivos) {
  const html = htmlCorreoDocumento({ titulo, cuerpo });
  writeFileSync(join(outDir, archivo), html, "utf8");
  console.log(`OK ${archivo} (${html.length} bytes)`);
}
