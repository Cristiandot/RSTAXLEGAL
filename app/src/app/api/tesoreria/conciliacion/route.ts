import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  sugerenciasParaMovimiento,
  conciliarMovimientoCore,
  categorizarMovimientoCore,
  desconciliarMovimientoCore,
  conciliarAutomaticoCore,
  buscarDocumentosCore,
  type DocTipoConciliacion,
  type ParConciliacion,
} from "@/lib/banco/conciliacion";

/**
 * Conciliación desde el portal del cliente (público, por token). El cliente
 * concilia SUS movimientos con el apoyo del equipo: mismas reglas que el panel
 * interno (lib compartida), acotado por token a su empresa y condicionado a que
 * tenga contratado el servicio de tesorería (clientes.hace_tesoreria).
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
  const token = String(body.token ?? "");
  const accion = String(body.accion ?? "");
  if (!token || !accion) return NextResponse.json({ ok: false, error: "Faltan datos." }, { status: 400 });

  const supabase = createServiceClient();
  const { data: cli } = await supabase
    .from("clientes")
    .select("id, hace_tesoreria")
    .eq("form_token", token)
    .eq("activo", true)
    .maybeSingle();
  if (!cli) return NextResponse.json({ ok: false, error: "Link no válido." }, { status: 403 });
  if (!cli.hace_tesoreria)
    return NextResponse.json({ ok: false, error: "El servicio de tesorería no está activo para esta empresa." }, { status: 403 });

  const clienteId = cli.id as string;

  // Ping liviano: ¿la empresa tiene tesorería activa? (para mostrar el acceso
  // en el portal del cliente solo cuando corresponde)
  if (accion === "estado") {
    return NextResponse.json({ ok: true });
  }

  if (accion === "sugerencias") {
    const res = await sugerenciasParaMovimiento(supabase, String(body.movimientoId ?? ""), clienteId);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  // Búsqueda manual de documentos para un movimiento (folio / nombre / monto).
  if (accion === "buscar") {
    const res = await buscarDocumentosCore(supabase, String(body.movimientoId ?? ""), String(body.q ?? ""), clienteId);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  // Pares sugeridos SIN conciliar (pestaña "Sugerencias" estilo Chipax).
  if (accion === "sugerencias_lote") {
    const { data: cuentas } = await supabase
      .from("banco_cuenta")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("activo", true);
    const pares: ParConciliacion[] = [];
    for (const c of cuentas ?? []) {
      const r = await conciliarAutomaticoCore(supabase, c.id as string, { clienteId, dryRun: true });
      if (r.ok && r.pares) pares.push(...r.pares);
    }
    return NextResponse.json({ ok: true, pares });
  }
  if (accion === "conciliar") {
    const res = await conciliarMovimientoCore(supabase, {
      movimientoId: String(body.movimientoId ?? ""),
      docTipo: String(body.docTipo ?? "") as DocTipoConciliacion,
      docId: body.docId ? String(body.docId) : null,
      docRef: body.docRef ? String(body.docRef) : null,
      monto: Number(body.monto ?? 0),
      clienteId,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (accion === "categorizar") {
    const categoria = String(body.categoria ?? "");
    if (!["transferencia_interna", "comision", "sin_documento"].includes(categoria))
      return NextResponse.json({ ok: false, error: "Categoría inválida." }, { status: 400 });
    const res = await categorizarMovimientoCore(supabase, {
      movimientoId: String(body.movimientoId ?? ""),
      categoria: categoria as "transferencia_interna" | "comision" | "sin_documento",
      clienteId,
    });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (accion === "deshacer") {
    const res = await desconciliarMovimientoCore(supabase, String(body.movimientoId ?? ""), clienteId);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  if (accion === "auto") {
    const res = await conciliarAutomaticoCore(supabase, String(body.cuentaId ?? ""), { clienteId });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }
  return NextResponse.json({ ok: false, error: "Acción desconocida." }, { status: 400 });
}
