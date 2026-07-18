import { createClient } from "@/lib/supabase/server";
import { periodoActual, etiquetaPeriodo } from "@/lib/periodos";
import {
  ControlRcvClient,
  type EmpresaControl,
  type DescargaRcv,
  type TotalesRcv,
  type ReporteAvance,
} from "./control-rcv-client";

export const metadata = { title: "Control RCV — RS Tax & Legal" };

/** Todos los períodos (YYYY-MM) desde `desde` hasta `hasta` inclusive. */
function periodosEntre(desde: string, hasta: string): string[] {
  const [yF, mF] = hasta.split("-").map(Number);
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  while (y < yF || (y === yF && m <= mF)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (m === 12) { y++; m = 1; } else m++;
  }
  return out;
}

export default async function ControlRcvPage() {
  // Mes EN CURSO incluido: la grilla llega hasta el mes vigente (julio hoy), no
  // solo hasta el mes cerrado, para que la contadora vea el avance del mes y
  // pueda enviar el reporte del día 23. El cliente filtra por año (pestañas).
  const periodoEnCurso = periodoActual();
  const periodos = periodosEntre("2025-01", periodoEnCurso);
  const periodosConActual = periodos; // el mes en curso ya está incluido
  const supabase = await createClient();

  const [empresasRes, gruposRes, descargasRes, totalesRes, reportesRes] = await Promise.all([
    // Solo empresas a las que les llevamos el RCV/contabilidad: hacen F29 (que se
    // arma del RCV) o contabilidad completa. Excluye casa particular, solo-RRHH,
    // solo-legal y trabajos puntuales.
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, clave_sii, hace_contabilidad_completa, grupo_id, correo_empresa")
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
      .in("periodo", periodosConActual)
      // ~127 empresas × 19 meses > 1.000: hay que subir el tope de PostgREST o
      // las filas se truncan en silencio y los meses cortados salen como "falta".
      .limit(100000),
    // Totales del registro por empresa y mes (ventas, compras y NC) para la
    // cuadratura visual de la contadora contra el SII (+ el mes en curso).
    supabase.from("v_rcv_totales_periodo").select("*").in("periodo", periodosConActual).limit(100000),
    // Reportes de avance ya enviados este mes (ritual del 23).
    supabase
      .from("rcv_reporte_avance")
      .select("cliente_id, periodo, fecha_corte, fecha_correo_enviado, destinatario, observaciones")
      .eq("periodo", periodoEnCurso),
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
    correoEmpresa: (c.correo_empresa as string | null) ?? null,
  }));

  const descargas = (descargasRes.data ?? []) as DescargaRcv[];
  const totales = (totalesRes.data ?? []) as TotalesRcv[];
  const reportes = (reportesRes.data ?? []) as ReporteAvance[];

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <ControlRcvClient
        periodos={periodos}
        etiquetas={periodos.map(etiquetaPeriodo)}
        empresas={empresas}
        descargas={descargas}
        totales={totales}
        periodoEnCurso={periodoEnCurso}
        reportes={reportes}
        errorCarga={empresasRes.error?.message ?? descargasRes.error?.message ?? null}
      />
    </main>
  );
}
