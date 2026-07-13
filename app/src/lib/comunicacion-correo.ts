/**
 * Armado del correo "Resumen de pagos" de Comunicación mensual. Función pura
 * (sin Supabase): la usa la server action de envío y permite generar vistas
 * previas reales con los mismos datos.
 */

import { formatFecha, formatMonto } from "./format";
import { etiquetaPeriodo } from "./periodos";

export type EmpresaComunicacion = {
  comunicacion_id: string;
  cliente_id: string;
  razon_social: string;
  rut_empresa: string | null;
  periodo: string;
  monto_previred: number | string | null;
  plazo_previred: string | null;
  monto_f29: number | string | null;
  plazo_f29: string | null;
  dnp_declarado: boolean;
  /** Fechas del DNP: cuándo se declaró y (si ya ocurrió) cuándo se pagó. */
  fecha_dnp_declarado?: string | null;
  fecha_dnp_pagado?: string | null;
  f29_postergacion_monto: number | string | null;
  f29_comentario: string | null;
  /** Desglose del F29 — solo los conceptos con monto salen en el correo. */
  f29_iva?: number | string | null;
  f29_imp_unico?: number | string | null;
  f29_retenciones?: number | string | null;
  f29_ppm?: number | string | null;
  f29_otros?: number | string | null;
};

export type CentroComunicacion = {
  comunicacion_id: string;
  centro_costo: string;
  monto: number | string;
};

export type FacturaComunicacion = {
  cliente_id: string;
  folio: number;
  periodo: string;
  monto: number | string | null;
};

const DIAS_SEMANA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** "2026-06-22" → "lunes 22-06-2026" (sin desfase de zona horaria). */
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dow]} ${formatFecha(iso)}`;
}

/** Días desde hoy (Chile) al plazo: 0 = hoy, 1 = mañana, negativo = vencido. */
function diasAlPlazo(iso: string): number {
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
  const [y1, m1, d1] = hoy.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000,
  );
}

function etiquetaDiasRestantes(iso: string): string {
  const n = diasAlPlazo(iso);
  if (n < 0) return "plazo vencido";
  if (n === 0) return "vence hoy";
  if (n === 1) return "queda 1 día";
  return `quedan ${n} días`;
}

const tdIzq = `padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;`;
const tdDer = `padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;`;

function filaDetalle(concepto: string, monto: string, negrita = false): string {
  return `<tr><td style="${tdIzq}${negrita ? "font-weight:bold;color:#0a1a2f;" : ""}">${concepto}</td><td style="${tdDer}${negrita ? "font-weight:bold;" : ""}">${monto}</td></tr>`;
}

/**
 * Encabezado de sección. El plazo se destaca en rojo con la cuenta regresiva
 * de días calculada al momento del envío (pedido Cristian 10-07-2026).
 */
function filaSeccion(
  titulo: string,
  plazoIso: string | null,
  hora?: string,
): string {
  let plazo = "";
  if (plazoIso) {
    plazo =
      `<span style="font-weight:bold;color:#a32d2d;font-size:12px;"> — vence el ${fechaLarga(plazoIso)}${hora ? ` a las ${hora}` : ""}</span>` +
      `<span style="display:inline-block;background:#fcebeb;border:1px solid #f09595;color:#a32d2d;font-weight:bold;font-size:11px;padding:2px 9px;border-radius:10px;margin-left:8px;">${etiquetaDiasRestantes(plazoIso)}</span>`;
  }
  return `<tr><td colspan="2" style="padding:14px 0 6px;font-weight:bold;color:#0b2545;border-bottom:2px solid #0b2545;">${titulo}${plazo}</td></tr>`;
}

/**
 * Aviso de DNP dentro de la sección de imposiciones. Informa la fecha en que
 * se declaró el DNP y, si el pago ya se hizo, la fecha en que se pagó (caja
 * verde); mientras no se pague, mantiene la recomendación de pagar dentro del
 * mes (caja ámbar).
 */
function filaAvisoDnp(
  fechaDeclarado?: string | null,
  fechaPagado?: string | null,
): string {
  const declaradoTxt = fechaDeclarado
    ? ` con fecha <strong>${formatFecha(fechaDeclarado)}</strong>`
    : "";
  if (fechaPagado) {
    return `<tr><td colspan="2" style="padding:8px 0 2px;"><div style="border:1px solid #34a06a;background:#e7f6ee;border-radius:6px;padding:10px 12px;font-size:12px;color:#14532d;line-height:1.55;"><strong style="color:#166534;">Planilla DNP pagada.</strong> Sus cotizaciones de este período se declararon sin pago (DNP)${declaradoTxt} y quedaron <strong>pagadas con fecha ${formatFecha(fechaPagado)}</strong>. No tiene nada pendiente por este concepto.</div></td></tr>`;
  }
  return `<tr><td colspan="2" style="padding:8px 0 2px;"><div style="border:1px solid #ef9f27;background:#faeeda;border-radius:6px;padding:10px 12px;font-size:12px;color:#633806;line-height:1.55;"><strong style="color:#854f0b;">Planilla declarada sin pago (DNP).</strong> Sus cotizaciones de este período <strong>ya quedaron declaradas</strong>${declaradoTxt}, por lo que <strong>no es necesario que las pague de inmediato</strong>. Lo recomendable es pagarlas dentro del mes, para no tener problemas con las cotizaciones previsionales de sus trabajadores.</div></td></tr>`;
}

/** Fila con botón de pago directo al portal correspondiente (Previred / SII). */
function filaBoton(texto: string, url: string): string {
  return `<tr><td colspan="2" style="padding:10px 0 2px;"><a href="${url}" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:6px;">${texto} →</a></td></tr>`;
}

/** Banda de encabezado por empresa (solo correos de grupo con varias empresas). */
function filaEmpresa(razon: string, rut: string | null): string {
  return `<tr><td colspan="2" style="padding:10px 12px;background:#0b2545;color:#ffffff;font-weight:bold;font-size:14px;">${razon}${rut ? `<span style="font-weight:normal;color:#b9c6dc;font-size:12px;"> · RUT ${rut}</span>` : ""}</td></tr>`;
}

const URL_PREVIRED = "https://www.previred.com/";
const URL_PAGO_F29 =
  "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html?https://www4.sii.cl/propuestaf29ui/index.html#/default";

/**
 * Construye el cuerpo HTML del resumen de pagos. Solo incluye las secciones
 * con monto (Previred / F29 / facturas); una empresa del grupo sin nada que
 * cobrar queda fuera. Devuelve `cuerpo: null` si no hay nada que comunicar.
 */
export function construirCorreoComunicacion({
  empresas,
  centros: todosCentros,
  facturas: todasFacturas,
  incluirFacturas,
}: {
  empresas: EmpresaComunicacion[];
  centros: CentroComunicacion[];
  facturas: FacturaComunicacion[];
  incluirFacturas: boolean;
}): { cuerpo: string | null; idsIncluidos: string[]; total: number } {
  const esGrupo = empresas.length > 1;
  const etiqueta = etiquetaPeriodo(empresas[0]?.periodo ?? "");
  let cuerpoTabla = "";
  let total = 0;
  let hayPrevired = false;
  let hayF29 = false;
  const idsIncluidos: string[] = [];

  for (const emp of empresas) {
    const centros = todosCentros.filter(
      (c) => c.comunicacion_id === emp.comunicacion_id,
    );
    const facturas = incluirFacturas
      ? todasFacturas.filter((f) => f.cliente_id === emp.cliente_id)
      : [];
    const montoPrevired =
      emp.monto_previred !== null ? Number(emp.monto_previred) : null;
    const montoF29 = emp.monto_f29 !== null ? Number(emp.monto_f29) : null;
    const totalFacturas = facturas.reduce((s, f) => s + Number(f.monto ?? 0), 0);

    // Solo se comunica lo que la empresa tiene: las secciones sin monto se
    // omiten, y una empresa del grupo sin nada que cobrar queda fuera.
    if (!montoPrevired && !montoF29 && facturas.length === 0) continue;
    idsIncluidos.push(emp.comunicacion_id);
    let subtotal = 0;

    if (esGrupo) {
      cuerpoTabla += filaEmpresa(emp.razon_social, emp.rut_empresa);
    }

    if (montoPrevired !== null && montoPrevired > 0) {
      subtotal += montoPrevired;
      hayPrevired = true;
      // Con DNP no se muestra el vencimiento en rojo (la planilla ya quedó
      // declarada y no es necesario pagarla de inmediato) — el aviso lo explica.
      cuerpoTabla += filaSeccion(
        emp.dnp_declarado
          ? `Imposiciones (Previred)<span style="font-weight:normal;color:#854f0b;font-size:12px;"> — declarada sin pago (DNP)</span>`
          : "Imposiciones (Previred)",
        emp.dnp_declarado ? null : emp.plazo_previred,
        "13:45 hrs",
      );
      if (centros.length > 0) {
        for (const c of centros) {
          cuerpoTabla += filaDetalle(
            c.centro_costo || "Centro de costo",
            formatMonto(c.monto),
          );
        }
        if (centros.length > 1) {
          cuerpoTabla += filaDetalle(
            "Subtotal imposiciones",
            formatMonto(montoPrevired),
            true,
          );
        }
      } else {
        cuerpoTabla += filaDetalle(
          "Imposiciones del período",
          formatMonto(montoPrevired),
        );
      }
      if (emp.dnp_declarado)
        cuerpoTabla += filaAvisoDnp(emp.fecha_dnp_declarado, emp.fecha_dnp_pagado);
      if (!esGrupo) cuerpoTabla += filaBoton("Pagar en Previred", URL_PREVIRED);
    }

    if (montoF29 !== null && montoF29 > 0) {
      subtotal += montoF29;
      hayF29 = true;
      cuerpoTabla += filaSeccion(
        "Formulario 29 (SII)",
        emp.plazo_f29,
        "23:59 hrs",
      );
      // Desglose por concepto: solo los que tienen monto (los demás se omiten).
      const conceptos: [string, number | string | null | undefined][] = [
        ["IVA", emp.f29_iva],
        ["Impuesto Único", emp.f29_imp_unico],
        ["Retenciones", emp.f29_retenciones],
        ["PPM", emp.f29_ppm],
        ["Otros", emp.f29_otros],
      ];
      const conDesglose = conceptos.some(
        ([, v]) => v !== null && v !== undefined && Number(v) > 0,
      );
      for (const [nombre, v] of conceptos) {
        if (v !== null && v !== undefined && Number(v) > 0) {
          cuerpoTabla += filaDetalle(nombre, formatMonto(v));
        }
      }
      cuerpoTabla += filaDetalle(
        conDesglose ? "TOTAL F29 a pagar" : "Monto a pagar F29",
        formatMonto(montoF29),
        conDesglose,
      );
      // Opción de postergar IVA y comentario del contador (módulo F29).
      if (emp.f29_postergacion_monto !== null && Number(emp.f29_postergacion_monto) > 0) {
        cuerpoTabla += filaDetalle(
          "Opción de postergar",
          formatMonto(emp.f29_postergacion_monto),
        );
      }
      if ((emp.f29_comentario ?? "").trim()) {
        cuerpoTabla += `<tr><td colspan="2" style="padding:8px 0 2px;"><div style="border:1px solid #b5d4f4;background:#e6f1fb;border-radius:6px;padding:9px 12px;font-size:12px;color:#0c447c;line-height:1.55;"><strong>Nota de su contador:</strong> ${emp.f29_comentario!.trim()}</div></td></tr>`;
      }
      if (!esGrupo) cuerpoTabla += filaBoton("Pagar el F29 en el SII", URL_PAGO_F29);
    }

    if (facturas.length > 0) {
      subtotal += totalFacturas;
      cuerpoTabla += filaSeccion("Facturas RS Tax & Legal pendientes de pago", null);
      for (const f of facturas) {
        cuerpoTabla += filaDetalle(
          `Factura N° ${f.folio} · ${etiquetaPeriodo(f.periodo)}`,
          formatMonto(f.monto),
        );
      }
      if (facturas.length > 1) {
        cuerpoTabla += filaDetalle(
          "Subtotal facturas",
          formatMonto(totalFacturas),
          true,
        );
      }
    }

    if (esGrupo) {
      cuerpoTabla += filaDetalle(
        `Subtotal ${emp.razon_social}`,
        formatMonto(subtotal),
        true,
      );
    }
    total += subtotal;
  }

  if (idsIncluidos.length === 0) {
    return { cuerpo: null, idsIncluidos, total: 0 };
  }

  cuerpoTabla += `<tr><td style="padding:12px 0;font-weight:bold;font-size:15px;color:#0a1a2f;">Total a pagar${esGrupo ? " (todas las empresas)" : ""}</td><td style="padding:12px 0;text-align:right;font-weight:bold;font-size:15px;">${formatMonto(total)}</td></tr>`;

  // En correos de grupo los botones van una sola vez, al final del detalle.
  if (esGrupo && hayPrevired) {
    cuerpoTabla += filaBoton("Pagar en Previred", URL_PREVIRED);
  }
  if (esGrupo && hayF29) {
    cuerpoTabla += filaBoton("Pagar el F29 en el SII", URL_PAGO_F29);
  }

  const cajaTransferencia = `
    <div style="border:1px solid #ef9f27;background:#faeeda;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:14px;">Importante — pagos gestionados por RS Tax &amp; Legal</p>
      <p style="margin:0 0 12px;color:#633806;font-size:13px;line-height:1.55;">Para los pagos que gestionamos por usted (imposiciones y F29), debemos recibir los fondos a más tardar <strong>2 días hábiles antes</strong> del vencimiento respectivo. Pasada esa fecha no podemos garantizar el pago dentro de plazo.</p>
      <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:13px;">Datos para la transferencia:</p>
      <div style="background:#ffffff;border:1px solid #f0d9a8;border-radius:6px;padding:10px 12px;font-size:13px;color:#3a2a10;line-height:1.7;">
        <div><span style="color:#7a5a18;">Titular:</span> Rodríguez Samith Servicios Legales y Contables II Limitada</div>
        <div><span style="color:#7a5a18;">RUT:</span> 78.073.973-8</div>
        <div><span style="color:#7a5a18;">Banco:</span> Mercado Pago</div>
        <div><span style="color:#7a5a18;">Tipo de cuenta:</span> Cuenta Vista</div>
        <div><span style="color:#7a5a18;">N° de cuenta:</span> <strong>1093709982</strong></div>
        <div><span style="color:#7a5a18;">Correo:</span> admin@rstaxlegal.cl</div>
      </div>
      <p style="margin:12px 0 0;"><a href="https://rstaxlegal-panel.vercel.app/datos-transferencia" style="display:inline-block;background:#854f0b;color:#ffffff;text-decoration:none;font-weight:bold;font-size:13px;padding:9px 16px;border-radius:6px;">Copiar datos para transferir →</a></p>
    </div>`;

  const intro = esGrupo
    ? `Les compartimos el resumen de los pagos del período <strong>${etiqueta}</strong> de sus empresas, con el detalle separado por cada una:`
    : `Les compartimos el resumen de los pagos del período <strong>${etiqueta}</strong> de <strong>${empresas[0]?.razon_social ?? ""}</strong>:`;

  const cuerpo = `
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      ${cuerpoTabla}
    </table>
    <div style="border:1px solid #9fb3d1;background:#eef2f8;border-radius:8px;padding:12px 16px;margin:0 0 16px;text-align:center;">
      <p style="margin:0;font-weight:bold;color:#0b2545;font-size:14px;">Si usted ya pagó o depositó a nuestra cuenta, por favor omita este correo.</p>
    </div>
    ${cajaTransferencia}
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

  return { cuerpo, idsIncluidos, total };
}
