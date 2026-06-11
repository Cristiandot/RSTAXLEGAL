import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { ConciliacionRow, UsuarioOpcion } from "@/lib/ciclos";
import {
  ContabilidadClient,
  type DocumentoContable,
} from "./contabilidad-client";

export const metadata = { title: "Contabilidad mensual — RS Tax & Legal" };

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  const [usuariosRes, filasRes, docsRes] = await Promise.all([
    supabase.from("usuarios").select("id, nombre").eq("activo", true).order("nombre"),
    supabase
      .from("v_checklist_conciliacion")
      .select("*")
      .eq("periodo", periodo)
      .order("razon_social"),
    supabase
      .from("documentos_contables")
      .select("id, cliente_id, categoria, etiqueta, archivo_path, nombre_original, tamano_bytes, created_at")
      .eq("periodo", periodo)
      .eq("activo", true),
  ]);

  const documentos: DocumentoContable[] = (docsRes.data ?? []).map((d) => ({
    id: d.id,
    cliente_id: d.cliente_id,
    categoria: d.categoria as DocumentoContable["categoria"],
    etiqueta: d.etiqueta,
    archivo_path: d.archivo_path,
    nombre_original: d.nombre_original,
    tamano_bytes: d.tamano_bytes,
    created_at: d.created_at,
    subido_por_nombre: null,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <ContabilidadClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as ConciliacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        documentos={documentos}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
