import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { parseCartola } from "@/lib/banco/parsers";
import { upsertCuenta, insertarMovimientos, actualizarSaldoCuenta } from "@/lib/banco/ingesta";
import { conciliarAutomaticoCore } from "@/lib/banco/conciliacion";

/**
 * Subida de cartola desde el portal del cliente (público, por token). Valida el
 * token contra clientes.form_token, parsea el archivo y guarda los movimientos
 * de esa empresa. Usa service key en el servidor (nunca llega al navegador) y
 * TODO queda acotado al cliente del token.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 });
  }
  const token = String(form.get("token") ?? "");
  const fuente = String(form.get("fuente") ?? "");
  const alias = String(form.get("alias") ?? "").trim() || null;
  const archivo = form.get("archivo");

  if (!token || !fuente) return NextResponse.json({ ok: false, error: "Faltan datos." }, { status: 400 });
  if (!(archivo instanceof File) || archivo.size === 0)
    return NextResponse.json({ ok: false, error: "No se recibió ningún archivo." }, { status: 400 });
  if (archivo.size > 15 * 1024 * 1024)
    return NextResponse.json({ ok: false, error: "El archivo supera los 15 MB." }, { status: 400 });

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

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const parsed = parseCartola({ fuente, filename: archivo.name, buffer });
  if (parsed.error) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (!parsed.movimientos.length)
    return NextResponse.json({ ok: false, error: "No se detectaron movimientos en el archivo." }, { status: 400 });

  const cuenta = await upsertCuenta(supabase, cli.id as string, fuente, alias);
  if ("error" in cuenta) return NextResponse.json({ ok: false, error: cuenta.error }, { status: 500 });
  const res = await insertarMovimientos(
    supabase,
    { cuentaId: cuenta.id, clienteId: cli.id as string, fuente, filename: archivo.name },
    parsed.movimientos,
  );
  if (res.error) return NextResponse.json({ ok: false, error: res.error }, { status: 500 });

  // Saldo de la cuenta al día con el saldo corrido de la cartola (si lo trae).
  await actualizarSaldoCuenta(supabase, cuenta.id);
  // Cruce automático al tiro (estilo Chipax): lo inequívoco se concilia solo.
  const auto = await conciliarAutomaticoCore(supabase, cuenta.id, { clienteId: cli.id as string });

  return NextResponse.json({
    ok: true,
    insertados: res.insertados,
    total: res.total,
    conciliados: auto.ok ? (auto.conciliados ?? 0) : 0,
  });
}
