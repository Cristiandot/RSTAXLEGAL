import { createServiceClient } from "@/lib/supabase/service";
import { respuestaNoAutorizada, validarTokenAgente } from "@/lib/agente";

/**
 * GET /api/agent/empresas?q=texto — busca empresas activas por razón social,
 * nombre de fantasía o RUT. Devuelve SOLO datos no sensibles (nunca claves
 * SII/Previred ni datos bancarios).
 */
export async function GET(req: Request) {
  if (!validarTokenAgente(req)) return respuestaNoAutorizada();

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const supabase = createServiceClient();

  let query = supabase
    .from("clientes")
    .select("id, razon_social, nombre_fantasia, rut_empresa, comuna, tipo_cliente")
    .eq("activo", true)
    .order("razon_social")
    .limit(15);
  if (q) {
    query = query.or(
      `razon_social.ilike.%${q}%,nombre_fantasia.ilike.%${q}%,rut_empresa.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, empresas: data ?? [] });
}
