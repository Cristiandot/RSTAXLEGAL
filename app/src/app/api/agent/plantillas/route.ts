import { createServiceClient } from "@/lib/supabase/service";
import { respuestaNoAutorizada, validarTokenAgente } from "@/lib/agente";

/**
 * GET /api/agent/plantillas?cliente_id=uuid — plantillas de contrato aprobadas
 * y activas de una empresa. El agente solo puede generar contratos para
 * combinaciones que existan acá; si no hay plantilla para un cargo, el flujo
 * es proponer una nueva (que también pasa por aprobación humana).
 */
export async function GET(req: Request) {
  if (!validarTokenAgente(req)) return respuestaNoAutorizada();

  const clienteId = new URL(req.url).searchParams.get("cliente_id")?.trim();
  if (!clienteId) {
    return Response.json(
      { ok: false, error: "Falta el parámetro cliente_id." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("plantillas_contrato")
    .select(
      "id, nombre, cargo, jornada_tipo, horas_semanales, nacionalidad, tipo_contrato, tipo_documento",
    )
    .eq("cliente_id", clienteId)
    .eq("aprobada", true)
    .eq("activo", true)
    .order("cargo");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, plantillas: data ?? [] });
}
