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

  const [usuariosRes, filasRes, comRes, clavesRes, oficinaRes] = await Promise.all([
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
    supabase.from("clientes").select("id, previred_clave"),
    // Cuentas de oficina (p. ej. la Previred del contador) — la clave no viaja.
    supabase
      .from("credenciales_oficina")
      .select("id, etiqueta, rut, clave")
      .order("orden"),
  ]);

  const comunicacion: Record<string, string | null> = {};
  for (const c of comRes.data ?? []) {
    comunicacion[c.cliente_id] = c.fecha_correo_enviado;
  }

  // Solo el booleano viaja al navegador; la clave se revela vía server action.
  const clavesPrevired: Record<string, boolean> = {};
  for (const c of clavesRes.data ?? []) {
    clavesPrevired[c.id] = Boolean(c.previred_clave);
  }

  const cuentasOficina = (oficinaRes.data ?? []).map((c) => ({
    id: c.id as string,
    etiqueta: c.etiqueta as string,
    rut: (c.rut as string | null) ?? null,
    tieneClave: Boolean(c.clave),
  }));

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <LiquidacionesClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as LiquidacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        comunicacion={comunicacion}
        clavesPrevired={clavesPrevired}
        cuentasOficina={cuentasOficina}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
