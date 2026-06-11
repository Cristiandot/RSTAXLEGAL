import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type {
  ConciliacionRow,
  IvaEjecucionRow,
  UsuarioOpcion,
} from "@/lib/ciclos";
import {
  ContabilidadClient,
  type DocumentoContable,
} from "./contabilidad-client";

export const metadata = { title: "Contabilidad mensual — RS Tax & Legal" };

/** Rango [inicio, fin) del período YYYY-MM para filtrar fechas. */
function rangoPeriodo(periodo: string): { inicio: string; fin: string } {
  const [y, m] = periodo.split("-").map(Number);
  const sgte = new Date(y, m, 1); // primer día del mes siguiente
  const fin = `${sgte.getFullYear()}-${String(sgte.getMonth() + 1).padStart(2, "0")}-01`;
  return { inicio: `${periodo}-01`, fin };
}

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();
  const { inicio, fin } = rangoPeriodo(periodo);

  const [usuariosRes, filasRes, ivaRes, docsRes] = await Promise.all([
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
    supabase
      .from("documentos_contables")
      .select(
        "id, cliente_id, categoria, etiqueta, archivo_path, nombre_original, tamano_bytes, created_at, usuarios(nombre)",
      )
      .eq("periodo", periodo)
      .eq("activo", true)
      .order("created_at", { ascending: false }),
  ]);

  const ivaEjecuciones: IvaEjecucionRow[] = (ivaRes.data ?? []).map((e) => {
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

  const documentos: DocumentoContable[] = (docsRes.data ?? []).map((d) => {
    const u = d.usuarios as unknown as
      | { nombre: string }
      | { nombre: string }[]
      | null;
    return {
      id: d.id,
      cliente_id: d.cliente_id,
      categoria: d.categoria as DocumentoContable["categoria"],
      etiqueta: d.etiqueta,
      archivo_path: d.archivo_path,
      nombre_original: d.nombre_original,
      tamano_bytes: d.tamano_bytes,
      created_at: d.created_at,
      subido_por_nombre:
        (Array.isArray(u) ? u[0]?.nombre : u?.nombre) ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <ContabilidadClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as ConciliacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        ivaEjecuciones={ivaEjecuciones}
        documentos={documentos}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
