/**
 * Genera vistas previas REALES del correo de Comunicación mensual usando la
 * misma librería que el envío (lib/comunicacion-correo.ts) con datos reales
 * de la base (periodo 2026-06). Uso: npx tsx preview-correos.ts <salida>
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  construirCorreoComunicacion,
  type EmpresaComunicacion,
} from "./src/lib/comunicacion-correo";
import { htmlCorreoDocumento } from "./src/lib/enviar-correo";

const outDir = process.argv[2] ?? ".";
mkdirSync(outDir, { recursive: true });

const base = {
  periodo: "2026-06",
  plazo_previred: "2026-07-13",
  plazo_f29: "2026-07-20",
  dnp_declarado: false,
  monto_previred: null as number | string | null,
  monto_f29: null as number | string | null,
  f29_postergar_iva: false,
  f29_comentario: null as string | null,
};

// Datos REALES de la BD al 10-07-2026 (v_comunicacion_mensual periodo 2026-06).
// Los montos F29 marcados "SIMULADO" aún no están digitados en el módulo F29.
const CASOS: {
  archivo: string;
  empresas: EmpresaComunicacion[];
  centros: { comunicacion_id: string; centro_costo: string; monto: number }[];
  facturas: { cliente_id: string; folio: number; periodo: string; monto: number }[];
}[] = [
  {
    // 1) SOLO PREVIRED — GASTRONÓMICA ASTE & DÍAZ (100% real)
    archivo: "1-solo-previred.html",
    empresas: [{
      ...base,
      comunicacion_id: "930f4c06-e061-4d6a-badc-0f6724fdbcd6",
      cliente_id: "c6c2fe5a-d1f8-4254-b744-1d32befdb2f7",
      razon_social: "GASTRONÓMICA ASTE & DÍAZ SOCIEDAD DE RESPONSABILIDAD LIMITADA",
      rut_empresa: "77.417.616-0",
      monto_previred: 648240,
    }],
    centros: [],
    facturas: [],
  },
  {
    // 2) SOLO F29 — AARR SERVICIOS MÉDICOS (monto F29 SIMULADO $450.000)
    archivo: "2-solo-f29.html",
    empresas: [{
      ...base,
      comunicacion_id: "3a7c3228-7665-4929-98f5-948cf750fbdb",
      cliente_id: "a43e2528-7773-44da-ac18-0b89e48292f6",
      razon_social: "AARR SERVICIOS MÉDICOS LIMITADA",
      rut_empresa: "78.134.887-2",
      monto_f29: 450000,
      f29_iva: 300000,
      f29_ppm: 150000,
    }],
    centros: [],
    facturas: [],
  },
  {
    // 3) SOLO FACTURAS — Alvarado Andrade (100% real, factura 1268)
    archivo: "3-solo-facturas.html",
    empresas: [{
      ...base,
      comunicacion_id: "b01a1d33-1d02-4489-97af-795b74a8f5ed",
      cliente_id: "94961266-8dfa-431e-b67c-db1cba050dfb",
      razon_social: "Alvarado Andrade Inversiones Inmobiliarias SPA",
      rut_empresa: "78.403.035-0",
    }],
    centros: [],
    facturas: [{
      cliente_id: "94961266-8dfa-431e-b67c-db1cba050dfb",
      folio: 1268,
      periodo: "2026-07",
      monto: 122469,
    }],
  },
  {
    // 4) PREVIRED + F29 SIN FACTURAS — DAVID GUZMAN STOREY
    //    (previred real $227.725; F29 SIMULADO $180.000)
    archivo: "4-previred-f29.html",
    empresas: [{
      ...base,
      comunicacion_id: "4d11de53-d5ee-4610-9127-a4fbe2772eb4",
      cliente_id: "60e12565-bcb5-407e-a09d-5c5dd20b5549",
      razon_social: "DAVID GUZMAN STOREY",
      rut_empresa: "15.677.073-6",
      monto_previred: 227725,
      monto_f29: 180000,
    }],
    centros: [],
    facturas: [],
  },
  {
    // 5) TODO — ARBORISMO SPA (previred real $1.030.823 con centro TODOS,
    //    factura real 1278; F29 SIMULADO $350.000 con postergación y nota)
    archivo: "5-todo.html",
    empresas: [{
      ...base,
      comunicacion_id: "025be377-589e-41ac-bc63-6eaa436e9471",
      cliente_id: "456d3409-70eb-4c4f-90ae-4be56340bb6d",
      razon_social: "ARBORISMO SPA",
      rut_empresa: "77.209.041-2",
      monto_previred: 1030823,
      monto_f29: 350000,
      f29_iva: 220000,
      f29_imp_unico: 45000,
      f29_retenciones: 25000,
      f29_ppm: 60000,
      f29_postergar_iva: true,
      f29_comentario:
        "Puede postergar parte del IVA de este mes; si le interesa, conversemos antes del 18.",
    }],
    centros: [{
      comunicacion_id: "025be377-589e-41ac-bc63-6eaa436e9471",
      centro_costo: "TODOS",
      monto: 1030823,
    }],
    facturas: [{
      cliente_id: "456d3409-70eb-4c4f-90ae-4be56340bb6d",
      folio: 1278,
      periodo: "2026-07",
      monto: 204115,
    }],
  },
  {
    // 6) PLANILLA CON DNP — DENTOLAB SPA (100% real: previred $492.960,
    //    fecha_dnp_declarado marcada en Liquidaciones)
    archivo: "6-dnp.html",
    empresas: [{
      ...base,
      comunicacion_id: "89d4db40-ae67-49d2-b529-b536cf6e446f",
      cliente_id: "7ea862ec-51ff-47dd-a5ac-26ebf6022ba0",
      razon_social: "DENTOLAB SPA",
      rut_empresa: "77.981.676-1",
      monto_previred: 492960,
      dnp_declarado: true,
      fecha_dnp_declarado: "2026-07-10",
    }],
    centros: [],
    facturas: [],
  },
  {
    // 7) DNP YA PAGADO — misma empresa, después de registrar «DNP pagado» en
    //    Liquidaciones: el correo informa fecha de declaración y de pago.
    archivo: "7-dnp-pagado.html",
    empresas: [{
      ...base,
      comunicacion_id: "89d4db40-ae67-49d2-b529-b536cf6e446f",
      cliente_id: "7ea862ec-51ff-47dd-a5ac-26ebf6022ba0",
      razon_social: "DENTOLAB SPA",
      rut_empresa: "77.981.676-1",
      monto_previred: 492960,
      dnp_declarado: true,
      fecha_dnp_declarado: "2026-07-10",
      fecha_dnp_pagado: "2026-07-24",
    }],
    centros: [],
    facturas: [],
  },
];

for (const caso of CASOS) {
  const { cuerpo } = construirCorreoComunicacion({
    empresas: caso.empresas,
    centros: caso.centros,
    facturas: caso.facturas,
    incluirFacturas: true,
  });
  if (!cuerpo) throw new Error(`Caso ${caso.archivo}: sin cuerpo`);
  const html = htmlCorreoDocumento({
    titulo: "Resumen de pagos · Junio 2026",
    cuerpo,
  });
  writeFileSync(join(outDir, caso.archivo), html, "utf8");
  console.log(`OK ${caso.archivo} (${html.length} bytes)`);
}
