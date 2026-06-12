"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const nombre = `${etiqueta} ${f.folio} - ${f.razon_social_factura}.pdf`;
  const { data: firmado, error } = await supabase.storage
    .from("facturas")
    .createSignedUrl(f.archivo_path, 3600, { download: nombre });
  if (error || !firmado) {
    return { ok: false, error: `No se pudo generar el link: ${error?.message}` };
  }
  return { ok: true, url: firmado.signedUrl };
}

/** Sube una factura o nota de crédito nueva (PDF + datos). */
export async function subirFactura(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Adjunta el PDF de la factura." };
  }
  if (!archivo.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "El archivo debe ser un PDF." };
  }

  const tipo = String(formData.get("tipo") ?? "factura");
  const folio = Number(formData.get("folio"));
  const periodo = String(formData.get("periodo") ?? "");
  const clienteId = String(formData.get("cliente_id") ?? "") || null;
  const razon = String(formData.get("razon_social") ?? "").trim();
  const montoRaw = String(formData.get("monto") ?? "").trim();
  const folioRefRaw = String(formData.get("folio_ref") ?? "").trim();

  if (!Number.isInteger(folio) || folio <= 0) {
    return { ok: false, error: "Indica el número (folio) del documento." };
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return { ok: false, error: "Indica el mes del documento." };
  }
  if (!razon) {
    return { ok: false, error: "Indica la razón social del receptor." };
  }

  const anio = periodo.slice(0, 4);
  const archivoPath = `${anio}/${tipo === "nota_credito" ? "nc-" : ""}${folio}.pdf`;

  const bytes = Buffer.from(await archivo.arrayBuffer());
  const { error: errUp } = await supabase.storage
    .from("facturas")
    .upload(archivoPath, bytes, { contentType: "application/pdf", upsert: false });
  if (errUp && !/already exists|duplicate/i.test(errUp.message)) {
    return { ok: false, error: `No se pudo subir el PDF: ${errUp.message}` };
  }

  const { error: errIns } = await supabase.from("facturas").insert({
    folio,
    tipo,
    cliente_id: clienteId,
    razon_social_factura: razon,
    periodo,
    monto: montoRaw ? Number(montoRaw) : null,
    folio_ref: folioRefRaw ? Number(folioRefRaw) : null,
    archivo_path: archivoPath,
    subido_por: await usuarioActualId(supabase),
  });
  if (errIns) {
    if (errIns.code === "23505") {
      return {
        ok: false,
        error: `Ya existe ${tipo === "nota_credito" ? "una nota de crédito" : "una factura"} con el folio ${folio}.`,
      };
    }
    return { ok: false, error: errIns.message };
  }

  revalidatePath("/facturacion");
  return { ok: true };
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