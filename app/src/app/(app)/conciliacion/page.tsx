import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type {
  ConciliacionRow,
  IvaEjecucionRow,
  UsuarioOpcion,
} from "@/lib/ciclos";
import { ConciliacionClient } from "./conciliacion-client";

export const metadata = { title: "Conciliación — RS Tax & Legal" };

/** Rango [inicio, fin) del período YYYY-MM para filtrar fechas. */
function rangoPeriodo(periodo: string): { inicio: string; fin: string } {
  const [y, m] = periodo.split("-").map(Number);
  const sgte = new Date(y, m, 1); // primer día del mes siguiente
  const fin = `${sgte.getFullYear()}-${String(sgte.getMonth() + 1).padStart(2, "0")}-01`;
  return { inicio: `${periodo}-01`, fin };
}

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();
  const { inicio, fin } = rangoPeriodo(periodo);

  const [usuariosRes, filasRes, ivaRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_conciliacion")
      .select("*")
      .eq("periodo", periodo)
      .order("razon_social"),
    supabase
      .from("iva_salud_ejecucion")
      .select("id, cliente_id, fecha_ejecutada, observaciones, usuarios(nombre)")
      .gte("fecha_ejecutada", inicio)
      .lt("fecha_ejecutada", fin)
      .order("fecha_ejecutada", { ascending: false }),
  ]);

  const ivaEjecuciones: IvaEjecucionRow[] = (ivaRes.data ?? []).map((e) => {
    // Join many-to-one: en runtime es un objeto, pero sin tipos generados
    // supabase-js lo infiere como arreglo.
    const u = e.usuarios as unknown as
      | { nombre: string }
      | { nombre: string }[]
      | null;
    return {
      id: e.id,
      cliente_id: e.cliente_id,
      fecha_ejecutada: e.fecha_ejecutada,
      observaciones: e.observaciones,
      responsable_nombre:
        (Array.isArray(u) ? u[0]?.nombre : u?.nombre) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <ConciliacionClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as ConciliacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        ivaEjecuciones={ivaEjecuciones}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
