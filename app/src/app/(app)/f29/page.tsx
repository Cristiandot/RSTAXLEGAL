import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { F29Row, PostergacionRow, UsuarioOpcion } from "@/lib/ciclos";
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

  const [usuariosRes, filasRes, clavesRes, postergRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_f29")
      .select("*")
      .eq("periodo", periodo)
      .order("razon_social"),
    supabase.from("clientes").select("id, clave_sii"),
    // Todas las postergaciones de IVA abiertas (cualquier período) para el panel
    // de seguimiento de cobro — independiente del período seleccionado.
    supabase
      .from("v_iva_postergado")
      .select("*")
      .is("iva_postergado_pagado_en", null)
      .order("vencimiento"),
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
        postergaciones={(postergRes.data ?? []) as PostergacionRow[]}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
