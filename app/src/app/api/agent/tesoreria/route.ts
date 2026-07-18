import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validarTokenAgente, respuestaNoAutorizada } from "@/lib/agente";
import { conciliarAutomaticoCore } from "@/lib/banco/conciliacion";

/**
 * Cruce automático de toda la cartera con tesorería activa. Lo llama el skill
 * contabilidad-sii al terminar de cargar RCV/honorarios nuevos, para que los
 * documentos recién bajados del SII se concilien solos contra las cartolas ya
 * subidas (sin esperar a que alguien apriete el botón).
 *
 * Auth: Authorization: Bearer <AGENT_API_TOKEN> (patrón /api/agent/*).
 * Body opcional: { "clienteId": "<uuid>" } para limitar a una empresa.
 */
export async function POST(req: Request) {
  if (!validarTokenAgente(req)) return respuestaNoAutorizada();

  let clienteId: string | null = null;
  try {
    const body = await req.json();
    clienteId = body?.clienteId ? String(body.clienteId) : null;
  } catch {
    // sin body = toda la cartera
  }

  const supabase = createServiceClient();
  let q = supabase
    .from("banco_cuenta")
    .select("id, cliente_id, alias, clientes!inner(hace_tesoreria)")
    .eq("activo", true)
    .eq("clientes.hace_tesoreria", true);
  if (clienteId) q = q.eq("cliente_id", clienteId);
  const { data: cuentas, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const resultados: Array<{ cuenta: string; conciliados: number; revisar: number }> = [];
  let totalConciliados = 0;
  for (const c of cuentas ?? []) {
    const r = await conciliarAutomaticoCore(supabase, c.id as string);
    if (r.ok) {
      totalConciliados += r.conciliados ?? 0;
      resultados.push({
        cuenta: (c.alias as string) ?? (c.id as string),
        conciliados: r.conciliados ?? 0,
        revisar: r.revisar ?? 0,
      });
    }
  }

  return NextResponse.json({ ok: true, cuentas: resultados.length, conciliados: totalConciliados, detalle: resultados });
}
