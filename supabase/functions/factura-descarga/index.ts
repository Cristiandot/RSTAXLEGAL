// Edge Function: factura-descarga
//
// Devuelve una URL firmada (2 min) para descargar el PDF de una factura desde el
// portal del cliente, manteniendo el bucket privado `facturas`.
//
// Autorización propia (por eso se despliega con verify_jwt = false): la app usa
// la publishable key `sb_publishable_…`, que NO es un JWT, así que el gateway con
// verify_jwt = true la rechazaría. La función valida que la factura pertenezca al
// cliente cuyo form_token = token (y esté activo) usando el SERVICE_ROLE_KEY que
// el runtime de edge provee automáticamente.
//
// Deploy: vía MCP de Supabase (deploy_edge_function, verify_jwt = false).
// La invoca el portal con `supabase.functions.invoke("factura-descarga", { body })`.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;
    const facturaId = body?.factura_id;
    if (!token || !facturaId) return json({ error: "Faltan parámetros" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // La factura debe pertenecer al cliente cuyo form_token = token y estar activo.
    const { data: f, error } = await admin
      .from("facturas")
      .select("archivo_path, folio, tipo, clientes!inner(form_token, activo)")
      .eq("id", facturaId)
      .maybeSingle();

    if (error) return json({ error: "Error consultando la factura" }, 500);
    const cli = (f as any)?.clientes;
    if (!f || !cli || cli.form_token !== token || cli.activo !== true) {
      return json({ error: "No autorizado" }, 403);
    }

    const nombre = `${f.tipo === "nota_credito" ? "NotaCredito" : "Factura"}_${f.folio}.pdf`;
    const { data: signed, error: e2 } = await admin.storage
      .from("facturas")
      .createSignedUrl(f.archivo_path as string, 120, { download: nombre });
    if (e2 || !signed) return json({ error: "No se pudo generar el enlace de descarga" }, 500);

    return json({ url: signed.signedUrl });
  } catch {
    return json({ error: "Error inesperado" }, 500);
  }
});
