import { createServiceClient } from "@/lib/supabase/service";
import { respuestaNoAutorizada, validarTokenAgente } from "@/lib/agente";

/**
 * GET /api/agent/trabajadores?cliente_id=uuid&q=texto — nómina de una empresa,
 * para reutilizar un trabajador existente en vez de duplicarlo. Devuelve solo
 * lo necesario para identificarlo (sin datos bancarios ni de salud).
 */
export async function GET(req: Request) {
  if (!validarTokenAgente(req)) return respuestaNoAutorizada();

  const url = new URL(req.url);
  const clienteId = url.searchParams.get("cliente_id")?.trim();
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!clienteId) {
    return Response.json(
      { ok: false, error: "Falta el parámetro cliente_id." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  let query = supabase
    .from("trabajadores")
    .select("id, nombres, apellidos, rut, cargo, tipo_contrato, activo")
    .eq("cliente_id", clienteId)
    .order("apellidos")
    .limit(30);
  if (q) {
    query = query.or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,rut.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, trabajadores: data ?? [] });
}
