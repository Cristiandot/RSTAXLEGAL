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
    // Cuentas Previred de la oficina (registros es_oficina, p. ej. Danilo el
    // contador) — banner superior; al navegador solo viaja el booleano.
    supabase
      .from("clientes")
      .select("id, razon_social, previred_rut, previred_clave")
      .eq("es_oficina", true)
      .order("razon_social"),
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

  const cuentasOficina = (oficinaRes.data ?? [])
    .filter((c) => c.previred_rut || c.previred_clave)
    .map((c) => ({
      id: c.id,
      etiqueta: c.razon_social,
      rut: c.previred_rut,
      tieneClave: Boolean(c.previred_clave),
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
