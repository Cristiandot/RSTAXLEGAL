import { timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Autenticación y trazabilidad del agente de IA (API /api/agent/*).
 *
 * Diseño del candado: el agente SOLO puede consultar catálogos y crear
 * solicitudes en estado borrador. La aprobación y el envío al cliente viven
 * exclusivamente en el panel, detrás de una sesión humana — no existe endpoint
 * de agente para esas transiciones, y la identidad "Agente RSTL" tiene
 * activo=false en `usuarios`, por lo que tampoco puede iniciar sesión.
 */

/** Identidad del agente en `usuarios` (activo=false: sin login posible). */
export const AGENTE_CORREO = "agente@rstaxlegal.cl";

/** Canal con que quedan marcadas las gestiones creadas por el agente. */
export const CANAL_AGENTE = "agente";

/**
 * Valida el header `Authorization: Bearer <AGENT_API_TOKEN>`. Sin la variable
 * de entorno configurada, la API del agente queda apagada (todo se rechaza).
 */
export function validarTokenAgente(req: Request): boolean {
  const esperado = process.env.AGENT_API_TOKEN;
  if (!esperado) return false;
  const header = req.headers.get("authorization") ?? "";
  const recibido = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function respuestaNoAutorizada(): Response {
  return Response.json(
    { ok: false, error: "No autorizado: token de agente inválido o ausente." },
    { status: 401 },
  );
}

/** id de la identidad del agente en `usuarios`, para `creado_por`. */
export async function idUsuarioAgente(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", AGENTE_CORREO)
    .maybeSingle();
  return data?.id ?? null;
}
