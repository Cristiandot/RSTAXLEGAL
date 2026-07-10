import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { LiquidacionRow, UsuarioOpcion } from "@/lib/ciclos";
import { LiquidacionesClient } from "./liquidaciones-client";

export const metadata = { title: "Liquidaciones — RS Tax & Legal" };

export default async function LiquidacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  const [usuariosRes, filasRes, comRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_mensual")
      .select("*")
      .eq("periodo", periodo)
      .order("razon_social"),
    // Estado del envío de Comunicación mensual (indicador Previred de la grilla).
    supabase
      .from("ciclo_comunicacion")
      .select("cliente_id, fecha_correo_enviado")
      .eq("periodo", periodo),
  ]);

  const comunicacion: Record<string, string | null> = {};
  for (const c of comRes.data ?? []) {
    comunicacion[c.cliente_id] = c.fecha_correo_enviado;
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <LiquidacionesClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as LiquidacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        comunicacion={comunicacion}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
