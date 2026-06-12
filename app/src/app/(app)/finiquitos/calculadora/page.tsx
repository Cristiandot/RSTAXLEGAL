import { createClient } from "@/lib/supabase/server";
import { CAUSAL_PORTAL_A_CODIGO } from "@/lib/finiquito";
import {
  CalculadoraClient,
  type GestionFiniquito,
  type IndicadorUf,
} from "./calculadora-client";

export const metadata = { title: "Calculadora de finiquito — RS Tax & Legal" };

export default async function CalculadoraFiniquitoPage({
  searchParams,
}: {
  searchParams: Promise<{ gestion?: string }>;
}) {
  const { gestion: gestionId } = await searchParams;
  const supabase = await createClient();

  // Indicadores Previred disponibles (UF para tope 90 UF, IMM para gratificación)
  const { data: indicadores } = await supabase
    .from("indicadores_previred")
    .select("periodo, uf_ultimo_dia, rmi_general")
    .order("periodo", { ascending: false })
    .limit(24);

  let gestion: GestionFiniquito | null = null;
  let errorCarga: string | null = null;

  if (gestionId) {
    const { data: g, error } = await supabase
      .from("solicitudes_rrhh")
      .select(
        "id, tipo, trabajador_id, trabajador_nombre, trabajador_rut, correo_contacto, datos, estado, observaciones, clientes(razon_social)",
      )
      .eq("id", gestionId)
      .maybeSingle();

    if (error) errorCarga = error.message;
    else if (!g || g.tipo !== "finiquito") {
      errorCarga = "No se encontró la solicitud de finiquito.";
    } else {
      const datos = (g.datos ?? {}) as Record<string, unknown>;
      const cli = g.clientes as unknown as { razon_social: string } | null;

      // Mejor esfuerzo: fecha de ingreso y remuneración desde el último
      // contrato registrado del trabajador (si vino con trabajador_id).
      let fechaIngresoContrato: string | null = null;
      let sueldoContrato: number | null = null;
      if (g.trabajador_id) {
        const { data: contrato } = await supabase
          .from("contratos")
          .select("fecha_inicio, remuneracion")
          .eq("trabajador_id", g.trabajador_id)
          .neq("estado", "anulado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contrato) {
          fechaIngresoContrato = contrato.fecha_inicio ?? null;
          const rem = (contrato.remuneracion ?? {}) as Record<string, unknown>;
          const sb = Number(rem.sueldo_base);
          if (Number.isFinite(sb) && sb > 0) sueldoContrato = sb;
        }
      }

      const str = (k: string) => (typeof datos[k] === "string" ? (datos[k] as string) : null);
      gestion = {
        id: g.id,
        trabajador: g.trabajador_nombre,
        rut: g.trabajador_rut ?? "—",
        empresa: cli?.razon_social ?? "—",
        estado: g.estado,
        observaciones: g.observaciones,
        causalCodigo: CAUSAL_PORTAL_A_CODIGO[str("causal") ?? ""] ?? "",
        fechaAviso: str("fecha_aviso"),
        fechaTermino: str("fecha_termino"),
        avisoModalidad: str("aviso_modalidad"),
        // campos del formato antiguo del portal (si existen, prellenan)
        fechaIngreso: str("fecha_ingreso") ?? fechaIngresoContrato,
        sueldoBase: str("sueldo_base") ? Number(str("sueldo_base")) : sueldoContrato,
        otrasRemuneraciones: str("otras_remuneraciones") ? Number(str("otras_remuneraciones")) : null,
        diasTomados: str("vacaciones_dias_tomados") ? Number(str("vacaciones_dias_tomados")) : null,
        diasObtenidos: str("vacaciones_dias_obtenidos") ? Number(str("vacaciones_dias_obtenidos")) : null,
        licenciaVigente: str("licencia_vigente"),
        fuero: str("fuero"),
        calculoGuardado: (datos.calculo_finiquito ?? null) as GestionFiniquito["calculoGuardado"],
      };
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <CalculadoraClient
        gestion={gestion}
        indicadores={(indicadores ?? []) as IndicadorUf[]}
        errorCarga={errorCarga}
      />
    </main>
  );
}
