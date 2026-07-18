import { createClient } from "@/lib/supabase/server";
import { periodoPorDefecto, etiquetaPeriodo } from "@/lib/periodos";
import { ControlRcvClient, type EmpresaControl, type DescargaRcv, type TotalesRcv } from "./control-rcv-client";

export const metadata = { title: "Control RCV — RS Tax & Legal" };

/** Los `n` últimos períodos (YYYY-MM) terminando en el mes por defecto (mes anterior al actual). */
function ultimosPeriodos(n: number): string[] {
  const [y, m] = periodoPorDefecto().split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default async function ControlRcvPage() {
  const periodos = ultimosPeriodos(6);
  const supabase = await createClient();

  const [empresasRes, gruposRes, descargasRes, totalesRes] = await Promise.all([
    // Solo empresas a las que les llevamos el RCV/contabilidad: hacen F29 (que se
    // arma del RCV) o contabilidad completa. Excluye casa particular, solo-RRHH,
    // solo-legal y trabajos puntuales.
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, clave_sii, hace_contabilidad_completa, grupo_id")
      .eq("activo", true)
      .eq("es_oficina", false)
      .or("hace_f29.eq.true,hace_contabilidad_completa.eq.true")
      .order("razon_social"),
    supabase.from("grupos_cliente").select("id, codigo"),
    supabase
      .from("rcv_descargas")
      .select(
        "cliente_id, periodo, ventas_docs, compras_docs, ventas_docs_sii, compras_docs_sii, ventas_total_sii, compras_total_sii, alto_volumen, ultima_descarga",
      )
      .in("periodo", periodos),
    // Totales del registro por empresa y mes (ventas, compras y NC) para la
    // cuadratura visual de la contadora contra el SII.
    supabase.from("v_rcv_totales_periodo").select("*").in("periodo", periodos),
  ]);

  const codigoPorGrupo = new Map<string, string>();
  for (const g of gruposRes.data ?? []) codigoPorGrupo.set(g.id as string, (g.codigo as string) ?? "");

  // La clave SII NUNCA viaja al navegador: solo el booleano de si existe.
  const empresas: EmpresaControl[] = (empresasRes.data ?? []).map((c) => ({
    id: c.id as string,
    razon_social: (c.razon_social as string) ?? "",
    rut_empresa: (c.rut_empresa as string) ?? "",
    tieneClave: Boolean(c.clave_sii),
    contabilidad: Boolean(c.hace_contabilidad_completa),
    grupoCodigo: (c.grupo_id ? codigoPorGrupo.get(c.grupo_id as string) : "") || "",
  }));

  const descargas = (descargasRes.data ?? []) as DescargaRcv[];
  const totales = (totalesRes.data ?? []) as TotalesRcv[];

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ControlRcvClient
        periodos={periodos}
        etiquetas={periodos.map(etiquetaPeriodo)}
        empresas={empresas}
        descargas={descargas}
        totales={totales}
        errorCarga={empresasRes.error?.message ?? descargasRes.error?.message ?? null}
      />
    </main>
  );
}
