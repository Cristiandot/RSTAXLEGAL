"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { enviarCorreo, htmlCorreoDocumento } from "@/lib/enviar-correo";
import { etiquetaPeriodo } from "@/lib/periodos";
import { nombreArchivo } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

/** Link firmado de descarga del PDF, con nombre legible. */
export async function linkDescargaFactura(
  facturaId: string,
): Promise<{ ok: boolean; error?: string; url?: string }> {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("facturas")
    .select("folio, tipo, razon_social_factura, archivo_path")
    .eq("id", facturaId)
    .single();
  if (!f) return { ok: false, error: "Factura no encontrada." };

  const etiqueta = f.tipo === "nota_credito" ? "NC" : "Factura";
  const nombre = nombreArchivo(`${etiqueta} ${f.folio} - ${f.razon_social_factura}`) + ".pdf";
  const { data: firmado, error } = await supabase.storage
    .from("facturas")
    .createSignedUrl(f.archivo_path, 3600, { download: nombre });
  if (error || !firmado) {
    return { ok: false, error: `No se pudo generar el link: ${error?.message}` };
  }
  return { ok: true, url: firmado.signedUrl };
}

// ---- Carga masiva ----

const RE_FACTURA = /^\((\d+)\)\s*-?\s*(.+?)\.pdf$/i;
const RE_NC = [
  /^NC \((\d+)\)\s*-\s*\((\d+)\)\s*(.+?)(\.pdf)?$/i, // NC (64) - (664) RAZÓN
  /^\(NC (\d+)\)\s*-\s*\((\d+)\)\s*(.+?)(\.pdf)?$/i, // (NC 71) - (867) RAZÓN
  /^NC \((\d+)\)\s*-\s*(.+?)(\.pdf)?$/i, // NC (81) - RAZÓN (sin referencia)
];

const normalizarRut = (r: string) => r.toUpperCase().replace(/[^0-9K]/g, "");
const normalizarRazon = (r: string) =>
  r
    .toUpperCase()
    .replace(/[ÁÉÍÓÚÑÜ]/g, (c) => ("AEIOUNU"["ÁÉÍÓÚÑÜ".indexOf(c)] ?? c))
    .replace(/[^A-Z0-9]/g, "");

/** RUT del receptor (el primero después de "SEÑOR(ES)") y monto TOTAL del PDF. */
async function leerDatosPdf(bytes: Buffer): Promise<{ rut: string | null; monto: number | null }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const desde = text.search(/SE[ÑN]OR\(ES\)/i);
    const zona = desde >= 0 ? text.slice(desde) : text;
    const mRut = zona.match(/R\.?U\.?T\.?\s*:?\s*([\d.]{7,12})\s*-\s*([\dkK])/);
    const totales = [...text.matchAll(/TOTAL\s*\$\s*([\d.]+)/gi)];
    return {
      rut: mRut ? mRut[1].replace(/\./g, "") + "-" + mRut[2].toUpperCase() : null,
      monto: totales.length
        ? parseInt(totales[totales.length - 1][1].replace(/\./g, ""), 10)
        : null,
    };
  } catch {
    return { rut: null, monto: null };
  }
}

export type ResultadoCarga = { nombre: string; ok: boolean; detalle: string };

/**
 * Carga masiva: recibe un lote de PDFs + el mes. De cada archivo se parsea el
 * nombre "(folio) RAZÓN.pdf" (o las variantes NC), y del contenido del PDF el
 * monto TOTAL y el RUT del receptor; el cliente se vincula por RUT (fallback:
 * razón social normalizada). El front sube en tandas bajo el límite de 4MB.
 */
export async function subirFacturasLote(
  formData: FormData,
): Promise<{ ok: boolean; error?: string; resultados?: ResultadoCarga[] }> {
  const supabase = await createClient();

  const periodo = String(formData.get("periodo") ?? "");
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return { ok: false, error: "Indica el mes de los documentos." };
  }
  const archivos = formData.getAll("archivos").filter(
    (a): a is File => a instanceof File && a.size > 0,
  );
  if (archivos.length === 0) {
    return { ok: false, error: "Adjunta al menos un PDF." };
  }

  const { data: clientesData } = await supabase
    .from("clientes")
    .select("id, rut_empresa, razon_social")
    .eq("activo", true);
  const porRut = new Map<string, string>();
  const porRazon = new Map<string, string>();
  for (const c of clientesData ?? []) {
    if (c.rut_empresa) porRut.set(normalizarRut(c.rut_empresa), c.id);
    porRazon.set(normalizarRazon(c.razon_social), c.id);
  }
  const subidoPor = await usuarioActualId(supabase);
  const anio = periodo.slice(0, 4);

  const resultados: ResultadoCarga[] = [];
  for (const archivo of archivos) {
    const nombre = archivo.name;
    try {
      // 1) Parsear nombre → tipo, folio, razón, referencia
      let tipo = "factura";
      let folio = 0;
      let razon = "";
      let folioRef: number | null = null;
      let m: RegExpMatchArray | null;
      if ((m = nombre.match(RE_NC[0])) || (m = nombre.match(RE_NC[1]))) {
        tipo = "nota_credito";
        folio = Number(m[1]);
        folioRef = Number(m[2]);
        razon = m[3].trim();
      } else if ((m = nombre.match(RE_NC[2]))) {
        tipo = "nota_credito";
        folio = Number(m[1]);
        razon = m[2].trim();
      } else if ((m = nombre.match(RE_FACTURA))) {
        folio = Number(m[1]);
        razon = m[2].trim();
      } else {
        resultados.push({
          nombre,
          ok: false,
          detalle: 'Nombre no reconocido — usa "(folio) RAZÓN SOCIAL.pdf"',
        });
        continue;
      }

      // 2) Leer monto y RUT del PDF; vincular cliente
      const bytes = Buffer.from(await archivo.arrayBuffer());
      const { rut, monto } = await leerDatosPdf(bytes);
      const clienteId =
        (rut ? porRut.get(normalizarRut(rut)) : undefined) ??
        porRazon.get(normalizarRazon(razon)) ??
        null;

      // 3) Subir PDF e insertar fila
      const archivoPath = `${anio}/${tipo === "nota_credito" ? "nc-" : ""}${folio}.pdf`;
      const { error: errUp } = await supabase.storage
        .from("facturas")
        .upload(archivoPath, bytes, { contentType: "application/pdf", upsert: false });
      if (errUp && !/already exists|duplicate/i.test(errUp.message)) {
        resultados.push({ nombre, ok: false, detalle: `Error al subir: ${errUp.message}` });
        continue;
      }
      const { error: errIns } = await supabase.from("facturas").insert({
        folio,
        tipo,
        cliente_id: clienteId,
        razon_social_factura: razon,
        periodo,
        monto,
        folio_ref: folioRef,
        rut_receptor: rut,
        archivo_path: archivoPath,
        subido_por: subidoPor,
      });
      if (errIns) {
        resultados.push({
          nombre,
          ok: false,
          detalle:
            errIns.code === "23505"
              ? `Folio ${folio} ya existe — omitida`
              : errIns.message,
        });
        continue;
      }
      resultados.push({
        nombre,
        ok: true,
        detalle: `Folio ${folio}${monto ? ` · $${monto.toLocaleString("es-CL")}` : ""}${clienteId ? "" : " · sin vincular"}`,
      });
    } catch (e) {
      resultados.push({
        nombre,
        ok: false,
        detalle: e instanceof Error ? e.message : String(e),
      });
    }
  }

  revalidatePath("/facturacion");
  return { ok: true, resultados };
}

/** Marca o desmarca el pago de una factura, con fecha elegida por el equipo. */
export async function marcarPago(
  facturaId: string,
  pagada: boolean,
  fecha?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (pagada && fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return { ok: false, error: "Fecha de pago inválida." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("facturas")
    .update({
      pagada,
      fecha_pago: pagada ? (fecha ?? new Date().toISOString().slice(0, 10)) : null,
    })
    .eq("id", facturaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/facturacion");
  return { ok: true };
}

/**
 * Guarda la suscripción de pago automático del cliente (atributo del cliente).
 * El día de pago es opcional — hay suscritos cuya fecha de cargo no se conoce.
 */
export async function guardarSuscripcion(
  clienteId: string,
  suscrito: boolean,
  diaPago: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (suscrito && diaPago !== null && (diaPago < 1 || diaPago > 31)) {
    return { ok: false, error: "El día del pago debe estar entre 1 y 31 (o déjalo vacío si no se conoce)." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      suscripcion_pago: suscrito,
      suscripcion_dia_pago: suscrito ? diaPago : null,
    })
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/facturacion");
  return { ok: true };
}

/**
 * Envía la factura por correo al cliente vinculado (correo_empresa), con el
 * PDF adjunto. Sale a nombre del usuario conectado (reply-to + copia oculta).
 */
export async function enviarFacturaAlCliente(
  facturaId: string,
): Promise<{ ok: boolean; error?: string; enviadoA?: string }> {
  const supabase = await createClient();
  const { data: f } = await supabase
    .from("facturas")
    .select("folio, tipo, periodo, razon_social_factura, archivo_path, cliente_id, clientes(razon_social, correo_empresa)")
    .eq("id", facturaId)
    .single();
  if (!f) return { ok: false, error: "Factura no encontrada." };

  const cli = f.clientes as unknown as { razon_social: string; correo_empresa: string | null } | null;
  if (!f.cliente_id || !cli) {
    return { ok: false, error: "La factura no está vinculada a un cliente de la cartera — vincúlala primero." };
  }
  if (!cli.correo_empresa) {
    return { ok: false, error: `${cli.razon_social} no tiene correo asignado en su ficha. Cárgalo y reintenta.` };
  }

  const { data: pdf, error: errPdf } = await supabase.storage
    .from("facturas")
    .download(f.archivo_path);
  if (errPdf || !pdf) {
    return { ok: false, error: `No se pudo leer el PDF: ${errPdf?.message}` };
  }

  const etiqueta = f.tipo === "nota_credito" ? "Nota de crédito" : "Factura";
  const usuario = await getUsuarioActual();
  const res = await enviarCorreo({
    para: cli.correo_empresa,
    asunto: `${etiqueta} N° ${f.folio} · ${etiquetaPeriodo(f.periodo)} — RS Tax & Legal`,
    html: htmlCorreoDocumento({
      titulo: `${etiqueta} N° ${f.folio}`,
      cuerpo: `<p>Estimados,</p><p>Adjuntamos la ${etiqueta.toLowerCase()} N° ${f.folio}, correspondiente a ${etiquetaPeriodo(f.periodo)}, emitida a <strong>${f.razon_social_factura}</strong>.</p>`,
    }),
    adjuntos: [
      {
        filename: nombreArchivo(`${etiqueta} ${f.folio} - ${f.razon_social_factura}`) + ".pdf",
        content: Buffer.from(await pdf.arrayBuffer()).toString("base64"),
      },
    ],
    de: { nombre: usuario.nombre, correo: usuario.correo },
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, enviadoA: cli.correo_empresa };
}

/** Vincula (o desvincula con null) una factura a un cliente de la cartera. */
export async function vincularCliente(
  facturaId: string,
  clienteId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("facturas")
    .update({ cliente_id: clienteId })
    .eq("id", facturaId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/facturacion");
  return { ok: true };
}