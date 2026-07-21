import { createClient } from "@/lib/supabase/server";
import { HonorariosGrid, type FilaHonorarios } from "./honorarios-grid";

export const metadata = { title: "Honorarios — RS Tax & Legal" };

export default async function HonorariosGridPage({
  searchParams,
}: {
  searchParams: Promise<{ anio?: string }>;
}) {
  const { anio: a } = await searchParams;
  const anio = /^\d{4}$/.test(a ?? "") ? Number(a) : 2026;
  const supabase = await createClient();

  const [clientesRes, honRes, bteEmiRes, bteRecRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, activo, fecha_termino_servicio, grupo:grupos_cliente(codigo)")
      .order("razon_social"),
    supabase
      .from("honorarios_periodo")
      .select("cliente_id, brutos, retencion, liquido, cuenta_id, estado, updated_at")
      .like("periodo", `${anio}-%`)
      .limit(20000),
    supabase.from("bte_emitidas").select("cliente_id, retencion, estado").like("periodo", `${anio}-%`).limit(20000),
    supabase.from("bte_recibidas").select("cliente_id, retencion, estado").like("periodo", `${anio}-%`).limit(20000),
  ]);

  // BTE (boletas de terceros): retención vigente + N° por cliente, emitidas y recibidas.
  type AggBte = { n: number; ret: number };
  const aggBte = (rows: { cliente_id: string; retencion: number | null; estado: string | null }[] | null) => {
    const m = new Map<string, AggBte>();
    for (const b of rows ?? []) {
      if ((b.estado ?? "") === "ANULADA") continue;
      const cur = m.get(b.cliente_id) ?? { n: 0, ret: 0 };
      cur.n += 1;
      cur.ret += Number(b.retencion ?? 0);
      m.set(b.cliente_id, cur);
    }
    return m;
  };
  const bteEmi = aggBte(bteEmiRes.data as never);
  const bteRec = aggBte(bteRecRes.data as never);

  type Agg = {
    n: number;
    bruto: number;
    retencion: number;
    liquido: number;
    sinClasificar: number;
    actualizado: string | null;
  };
  const porCliente = new Map<string, Agg>();
  for (const h of honRes.data ?? []) {
    const cid = h.cliente_id as string;
    const cur =
      porCliente.get(cid) ??
      { n: 0, bruto: 0, retencion: 0, liquido: 0, sinClasificar: 0, actualizado: null };
    // las anuladas no suman a los totales
    const anulada = (h.estado as string) === "ANULADA";
    cur.n += 1;
    if (!anulada) {
      cur.bruto += Number(h.brutos ?? 0);
      cur.retencion += Number(h.retencion ?? 0);
      cur.liquido += Number(h.liquido ?? 0);
    }
    if (!h.cuenta_id) cur.sinClasificar += 1;
    const upd = h.updated_at as string | null;
    if (upd && (!cur.actualizado || upd > cur.actualizado)) cur.actualizado = upd;
    porCliente.set(cid, cur);
  }

  // El join embebido puede venir como objeto o arreglo según la relación.
  const codigoDelGrupo = (g: unknown): string | null => {
    const v = Array.isArray(g) ? g[0] : g;
    return (v as { codigo?: string } | null)?.codigo ?? null;
  };

  const filas: FilaHonorarios[] = (clientesRes.data ?? []).map((c) => {
    const a = porCliente.get(c.id as string);
    return {
      clienteId: c.id as string,
      razonSocial: c.razon_social as string,
      rutEmpresa: (c.rut_empresa as string | null) ?? null,
      grupoCodigo: codigoDelGrupo(c.grupo),
      terminado: !c.activo || c.fecha_termino_servicio != null,
      cargado: !!a,
      nBoletas: a?.n ?? 0,
      bruto: a?.bruto ?? 0,
      retencion: a?.retencion ?? 0,
      liquido: a?.liquido ?? 0,
      sinClasificar: a?.sinClasificar ?? 0,
      actualizado: a?.actualizado ?? null,
      bteEmiN: bteEmi.get(c.id as string)?.n ?? 0,
      bteEmiRet: bteEmi.get(c.id as string)?.ret ?? 0,
      bteRecN: bteRec.get(c.id as string)?.n ?? 0,
      bteRecRet: bteRec.get(c.id as string)?.ret ?? 0,
    };
  });

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-10 sm:px-6">
      <HonorariosGrid
        anio={anio}
        filas={filas}
        errorCarga={clientesRes.error?.message ?? honRes.error?.message ?? null}
      />
    </main>
  );
}
