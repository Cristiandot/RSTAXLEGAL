import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { F29Row, UsuarioOpcion } from "@/lib/ciclos";
import { F29Client } from "./f29-client";

export const metadata = { title: "F29 — RS Tax & Legal" };

export default async function F29Page({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  const [usuariosRes, filasRes, clavesRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_f29")
      .select("*")
      .eq("periodo", periodo)
      .order("razon_social"),
    supabase.from("clientes").select("id, clave_sii"),
  ]);

  // Solo el booleano viaja al navegador; la clave se revela vía server action.
  const clavesSii: Record<string, boolean> = {};
  for (const c of clavesRes.data ?? []) {
    clavesSii[c.id] = Boolean(c.clave_sii);
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <F29Client
        periodo={periodo}
        filas={(filasRes.data ?? []) as F29Row[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        clavesSii={clavesSii}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
