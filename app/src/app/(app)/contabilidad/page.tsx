import { createClient } from "@/lib/supabase/server";
import { normalizarPeriodo } from "@/lib/periodos";
import type { ConciliacionRow, UsuarioOpcion } from "@/lib/ciclos";
import {
  ContabilidadClient,
  type DocumentoContable,
  type RcvResumenFila,
} from "./contabilidad-client";

export const metadata = { title: "Contabilidad — RS Tax & Legal" };

export default async function ContabilidadPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: p } = await searchParams;
  const periodo = normalizarPeriodo(p);
  const supabase = await createClient();

  const [usuariosRes, filasRes, docsRes, pilotosRes, rcvRes, f29Res, honRes] =
    await Promise.all([
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
      supabase
        .from("clientes")
        .select("id")
        .eq("hace_contabilidad_completa", true),
      supabase
        .from("v_rcv_resumen")
        .select("cliente_id, docs_compras, docs_ventas, iva_credito_rcv, iva_debito_rcv")
        .eq("periodo", periodo),
      supabase
        .from("ciclo_f29")
        .select("cliente_id, iva_debito, iva_credito")
        .eq("periodo", periodo),
      supabase
        .from("honorarios_periodo")
        .select("cliente_id")
        .eq("periodo", periodo)
        .limit(20000),
    ]);

  const f29PorCliente = new Map(
    (f29Res.data ?? []).map((f) => [f.cliente_id, f]),
  );
  const rcvPorCliente = new Map(
    (rcvRes.data ?? []).map((r) => [r.cliente_id, r]),
  );
  const honPorCliente = new Map<string, number>();
  for (const h of honRes.data ?? []) {
    honPorCliente.set(
      h.cliente_id as string,
      (honPorCliente.get(h.cliente_id as string) ?? 0) + 1,
    );
  }
  const rcvResumen: RcvResumenFila[] = (pilotosRes.data ?? []).map((p) => {
    const r = rcvPorCliente.get(p.id);
    const f = f29PorCliente.get(p.id);
    return {
      cliente_id: p.id,
      docs_compras: r?.docs_compras ?? 0,
      docs_ventas: r?.docs_ventas ?? 0,
      docs_honorarios: honPorCliente.get(p.id) ?? 0,
      iva_credito_rcv: r?.iva_credito_rcv ?? 0,
      iva_debito_rcv: r?.iva_debito_rcv ?? 0,
      f29_iva_debito: f?.iva_debito ?? null,
      f29_iva_credito: f?.iva_credito ?? null,
    };
  });

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
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ContabilidadClient
        periodo={periodo}
        filas={(filasRes.data ?? []) as ConciliacionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        documentos={documentos}
        rcvResumen={rcvResumen}
        errorCarga={filasRes.error?.message ?? null}
      />
    </main>
  );
}
