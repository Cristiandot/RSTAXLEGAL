/**
 * Armado del correo de aviso F29 (módulo /f29). Función pura (sin Supabase):
 * la usa la server action de envío y permite generar vistas previas reales.
 * Los helpers de desglose, postergación y nota del contador los comparte la
 * Comunicación mensual (lib/comunicacion-correo.ts) para que ambos correos
 * muestren exactamente lo mismo (regla Cristian 14-07-2026).
 */

import { formatFecha, formatMonto } from "./format";
import { etiquetaPeriodo } from "./periodos";

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
export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIAS_SEMANA[dow]} ${formatFecha(iso)}`;
}

/**
 * Fecha límite para postergar el IVA: siempre 2 meses después del vencimiento
 * del F29 (día 20 del mes siguiente al período), es decir el día 20 del mes que
 * cae 3 meses después del período. Ej.: período 2026-06 → vence 20-07-2026 →
 * postergación hasta 20-09-2026.
 */
export function fechaLimitePostergacion(periodo: string): string {
  const [y, m] = periodo.split("-").map(Number);
  const total = m - 1 + 3; // mes 0-indexado del período + 3 meses
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-20`;
}

/** Monto con signo por delante: -2581 → "-$2.581" (formatMonto da "$-2.581"). */
function montoConSigno(v: number | string): string {
  const n = Number(v);
  return n < 0 ? "-" + formatMonto(-n) : formatMonto(n);
}

const tdIzq = `padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;`;
const tdDer = `padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;`;

export function filaDetalleCorreo(
  concepto: string,
  monto: string,
  negrita = false,
): string {
  return `<tr><td style="${tdIzq}${negrita ? "font-weight:bold;color:#0a1a2f;" : ""}">${concepto}</td><td style="${tdDer}${negrita ? "font-weight:bold;" : ""}">${monto}</td></tr>`;
}

export type DesgloseF29 = {
  iva?: number | string | null;
  impUnico?: number | string | null;
  retenciones?: number | string | null;
  ppm?: number | string | null;
  otros?: number | string | null;
};

/**
 * Filas del desglose del F29: IVA, Impuesto Único, Retenciones, PPM y Otros.
 * Sale TODO concepto con monto distinto de cero — los negativos también (p. ej.
 * «Otros» con remanente a favor). Antes se filtraba con > 0 y se perdían.
 */
export function filasDesgloseF29(d: DesgloseF29): {
  filas: string;
  conDesglose: boolean;
} {
  const conceptos: [string, number | string | null | undefined][] = [
    ["IVA", d.iva],
    ["Impuesto Único", d.impUnico],
    ["Retenciones", d.retenciones],
    ["PPM", d.ppm],
    ["Otros", d.otros],
  ];
  let filas = "";
  let conDesglose = false;
  for (const [nombre, v] of conceptos) {
    if (v !== null && v !== undefined && String(v) !== "" && Number(v) !== 0) {
      filas += filaDetalleCorreo(nombre, montoConSigno(v));
      conDesglose = true;
    }
  }
  return { filas, conDesglose };
}

/**
 * Caja con la opción de postergar el pago del IVA (Régimen Pro Pyme / ventas
 * bajo el tope legal): explica cuánto se posterga, cuánto se paga ahora y el
 * nuevo plazo. Redacción pendiente de visto bueno del contador (14-07-2026).
 * Devuelve solo el <div>; cada correo lo envuelve según su layout.
 */
export function cajaPostergacionIva(
  montoPostergable: number | string,
  desglose: DesgloseF29,
  fechaLimite?: string | null,
): string {
  const postergable = Number(montoPostergable);
  // "Pagaría solo" = los conceptos NO postergables del F29 (todo menos el IVA):
  // Impuesto Único + Retenciones + PPM + Otros, sumados del desglose. NO se
  // calcula como (total − postergable): eso era frágil al formato del monto
  // postergado —un "845.117" se leía como 845,117 decimal y el pago salía mal—
  // (criterio Cristian 17-07-2026).
  const num = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === "" ? 0 : Number(v);
  const pagaAhora = Math.max(
    0,
    num(desglose.impUnico) +
      num(desglose.retenciones) +
      num(desglose.ppm) +
      num(desglose.otros),
  );
  const detallePago = ` De acogerse, este mes pagaría solo <strong>${formatMonto(pagaAhora)}</strong> (los demás impuestos del formulario —PPM, impuesto único y retenciones— no son postergables y se pagan dentro del plazo normal).`;
  // La postergación es siempre de 2 meses: si viene la fecha, se indica el nuevo
  // plazo concreto (día 20); si no, se deja la redacción genérica.
  const nuevoPlazo = fechaLimite
    ? `hasta el <strong>${fechaLarga(fechaLimite)}</strong> (2 meses después del vencimiento)`
    : "hasta 2 meses después del vencimiento original";
  return `<div style="border:1px solid #8fb8e8;background:#eaf2fb;border-radius:6px;padding:10px 12px;font-size:12px;color:#0c447c;line-height:1.55;"><strong style="color:#0b2545;">Opción de postergar el pago del IVA.</strong> Su empresa puede postergar el pago del IVA de este período por <strong>${formatMonto(postergable)}</strong>, ${nuevoPlazo}, sin multas ni intereses dentro de ese nuevo plazo.${detallePago} Si desea usar esta opción, respóndanos este correo <strong>antes del vencimiento</strong> para presentar su F29 con la postergación.</div>`;
}

/** Nota personalizada del contador (comentario del módulo F29). */
export function cajaNotaContador(texto: string): string {
  return `<div style="border:1px solid #b5d4f4;background:#e6f1fb;border-radius:6px;padding:9px 12px;font-size:12px;color:#0c447c;line-height:1.55;"><strong>Nota de su contador:</strong> ${texto.trim()}</div>`;
}

export type DatosAvisoF29 = {
  razonSocial: string;
  periodo: string; // "2026-06"
  montoTotal: number | string; // monto_a_pagar (0 = declarado sin pago)
  desglose: DesgloseF29;
  postergacionMonto: number | string | null;
  comentarioContador: string | null;
  plazoF29: string | null; // ya corrido al día hábil
  /** 2 días hábiles antes del vencimiento (la calcula la action vía RPC). */
  fechaRecepcionFondos: string | null;
};

/**
 * Construye asunto, título y cuerpo del aviso de F29 presentado. Incluye el
 * desglose completo (IVA, Impuesto Único, Retenciones, PPM, Otros — solo los
 * con monto), la opción de postergar el IVA y la nota del contador, igual que
 * la Comunicación mensual.
 */
export function construirCorreoAvisoF29(d: DatosAvisoF29): {
  asunto: string;
  titulo: string;
  cuerpo: string;
} {
  const etiqueta = etiquetaPeriodo(d.periodo);
  const esMontoCero = Number(d.montoTotal) === 0;

  const { filas: filasDesglose, conDesglose } = filasDesgloseF29(d.desglose);

  const filaTotal = filaDetalleCorreo(
    conDesglose ? "Monto TOTAL a pagar (F29)" : "Monto total a pagar (F29)",
    formatMonto(d.montoTotal),
    true,
  );

  const filaPlazo = esMontoCero
    ? ""
    : `<tr><td style="padding:9px 0;color:#445;">Fecha límite de pago</td><td style="padding:9px 0;text-align:right;"><strong>${d.plazoF29 ? fechaLarga(d.plazoF29) : "—"}</strong></td></tr>`;

  // Opción de postergar el IVA: sale con explicación completa (no solo el monto).
  const cajaPostergacion =
    !esMontoCero &&
    d.postergacionMonto !== null &&
    Number(d.postergacionMonto) > 0
      ? `<div style="margin:0 0 16px;">${cajaPostergacionIva(d.postergacionMonto, d.desglose, fechaLimitePostergacion(d.periodo))}</div>`
      : "";

  const notaContador = (d.comentarioContador ?? "").trim()
    ? `<div style="margin:0 0 16px;">${cajaNotaContador(d.comentarioContador!)}</div>`
    : "";

  const cajaSinPago = esMontoCero
    ? `<div style="border:1px solid #34a06a;background:#e7f6ee;border-radius:8px;padding:14px 16px;margin:0 0 18px;">
         <p style="margin:0;font-weight:bold;color:#0f6e56;font-size:15px;">F29 declarado sin pago</p>
         <p style="margin:6px 0 0;color:#0f6e56;font-size:13px;line-height:1.55;">Su Formulario 29 de este período quedó presentado con <strong>$0 a pagar</strong>. Este correo es solo informativo: no requiere ninguna acción de su parte.</p>
       </div>`
    : "";

  const notaVencimiento = esMontoCero
    ? ""
    : `<p style="margin:0 0 16px;font-size:12px;color:#64748b;">El vencimiento legal del F29 es el día 20; si cae sábado, domingo o feriado, el plazo se traslada al siguiente día hábil.</p>`;

  // Se ofrecen SIEMPRE las dos formas de pago (cuando hay monto): el cliente
  // elige y luego confirmamos con el comprobante. Ya no se decide por adelantado
  // "quién paga".
  const encabezadoPago = !esMontoCero
    ? `<p style="margin:0 0 8px;font-weight:bold;color:#0b2545;font-size:14px;">¿Cómo pagar su F29?</p>
       <p style="margin:0 0 12px;font-size:13px;color:#445;line-height:1.55;">Puede pagarlo de cualquiera de estas dos formas:</p>`
    : "";

  // Opción 1 — pago directo en el portal del SII.
  const linkPagoSii = !esMontoCero
    ? `<p style="margin:0 0 6px;font-size:13px;color:#0b2545;"><strong>1) Usted mismo, en el portal del SII.</strong></p>
       <p style="margin:0 0 16px;"><a href="https://www4.sii.cl/propuestaf29ui/index.html#/default" style="display:inline-block;background:#0b2545;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:8px;">Pagar el F29 en el SII</a></p>`
    : "";

  // Opción 2 — transferir a RS para que la oficina pague por el cliente.
  const cajaFondos =
    !esMontoCero && d.fechaRecepcionFondos
      ? `<div style="border:1px solid #ef9f27;background:#faeeda;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
           <p style="margin:0 0 6px;font-weight:bold;color:#854f0b;font-size:14px;">2) Que lo paguemos nosotros por usted.</p>
           <p style="margin:0 0 12px;color:#633806;font-size:13px;line-height:1.55;">Si prefiere que RS Tax &amp; Legal pague su F29, transfiéranos los fondos a más tardar <strong>2 días hábiles antes</strong> del vencimiento, es decir el <strong>${fechaLarga(d.fechaRecepcionFondos)}</strong>, y envíenos el comprobante. Pasada esa fecha no podemos garantizar el pago dentro de plazo y el F29 podría quedar afecto a multas e intereses de cargo del contribuyente.</p>
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
         </div>`
      : "";

  // Con opción de postergar, el F29 aún NO está presentado (la postergación se
  // ejerce al declarar): el intro habla de "preparado", no de "presentado".
  const conPostergacion = cajaPostergacion !== "";
  const intro = conPostergacion
    ? `Les informamos que hemos preparado el Formulario 29 de <strong>${d.razonSocial}</strong> correspondiente al período <strong>${etiqueta}</strong>. A continuación, el detalle a declarar:`
    : `Les informamos que hemos presentado el Formulario 29 de <strong>${d.razonSocial}</strong> correspondiente al período <strong>${etiqueta}</strong>. A continuación, el detalle de lo declarado:`;

  const cuerpo = `
    ${cajaSinPago}
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">${intro}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      <tr><td style="${tdIzq}">Empresa</td><td style="${tdDer}">${d.razonSocial}</td></tr>
      ${filasDesglose}
      ${filaTotal}
      ${filaPlazo}
    </table>
    ${cajaPostergacion}
    ${notaContador}
    ${notaVencimiento}
    ${encabezadoPago}
    ${linkPagoSii}
    ${cajaFondos}
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;

  return {
    asunto: esMontoCero
      ? `F29 ${etiqueta} declarado sin pago — RS Tax & Legal`
      : `F29 ${etiqueta} — RS Tax & Legal`,
    titulo: esMontoCero
      ? `F29 período ${etiqueta} — Sin monto a pagar`
      : `F29 período ${etiqueta}`,
    cuerpo,
  };
}

export type DatosF29Pagado = {
  razonSocial: string;
  periodo: string; // "2026-06"
  montoPagado: number | string;
  fechaPago: string; // YYYY-MM-DD
  numeroOperacion: string;
};

/**
 * Comprobante de F29 pagado por la oficina: se envía cuando el cliente transfirió
 * los fondos a RS y nosotros pagamos el F29. Función pura (la usa la server action
 * y las vistas previas).
 */
export function construirCorreoF29Pagado(d: DatosF29Pagado): {
  asunto: string;
  titulo: string;
  cuerpo: string;
} {
  const etiqueta = etiquetaPeriodo(d.periodo);
  const cuerpo = `
    <div style="border:1px solid #1d9e75;background:#e6f6ef;border-radius:8px;padding:14px 16px;margin:0 0 18px;">
      <p style="margin:0;font-weight:bold;color:#0f6e56;font-size:15px;">Su F29 quedó pagado</p>
      <p style="margin:6px 0 0;color:#0f6e56;font-size:13px;line-height:1.55;">El pago fue gestionado por RS Tax &amp; Legal dentro de plazo. No requiere ninguna acción de su parte.</p>
    </div>
    <p style="margin:0 0 12px;">Estimados,</p>
    <p style="margin:0 0 16px;">Les confirmamos que hemos pagado, a través de nuestra oficina, el Formulario 29 de <strong>${d.razonSocial}</strong> correspondiente al período <strong>${etiqueta}</strong>. A continuación, el comprobante:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Empresa</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${d.razonSocial}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Período</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${etiqueta}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Monto total pagado</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;font-weight:bold;">${formatMonto(d.montoPagado)}</td></tr>
      <tr><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;color:#445;">Fecha de pago</td><td style="padding:9px 0;border-bottom:1px solid #e6e9f0;text-align:right;">${fechaLarga(d.fechaPago)}</td></tr>
      <tr><td style="padding:9px 0;color:#445;">N° de operación</td><td style="padding:9px 0;text-align:right;font-weight:bold;">${d.numeroOperacion}</td></tr>
    </table>
    <p style="margin:0 0 16px;font-size:12px;color:#64748b;">Conserve este correo como respaldo del pago. El número de operación corresponde a la transacción con que se enteró el F29.</p>
    <p style="margin:0 0 4px;">Quedamos atentos a cualquier consulta.</p>`;
  return {
    asunto: `F29 ${etiqueta} pagado — RS Tax & Legal`,
    titulo: `F29 período ${etiqueta} — Pagado`,
    cuerpo,
  };
}
