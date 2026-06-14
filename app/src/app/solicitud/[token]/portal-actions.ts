"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas del portal del cliente para los módulos Contabilidad y RRHH, más el
 * flujo de "solicitar documento". Todo pasa por RPCs SECURITY DEFINER validadas
 * por `form_token` — el rol anónimo no toca tablas directamente.
 */

// ===================== Indicadores Previred =====================

export type IndicadoresPortal = {
  disponible: boolean;
  periodo?: string;
  mes_pago?: string | null;
  uf?: number | null;
  utm?: number | null;
  uta?: number | null;
  imm?: number | null;
  tope_afp_uf?: number | null;
  tope_afp_clp?: number | null;
};

export async function cargarIndicadores(
  token: string,
): Promise<{ ok: boolean; ind?: IndicadoresPortal; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_indicadores", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, ind: data as IndicadoresPortal };
}

// ===================== Contabilidad =====================

export type MesContab = {
  periodo: string;
  ventas_neto: number;
  compras_neto: number;
  iva_debito: number;
  iva_credito: number;
  ventas_total: number;
  compras_total: number;
};

export type ContraparteContab = { nombre: string; rut: string | null; monto: number };

export type FacturaContab = {
  fecha: string | null;
  folio: string;
  contraparte: string;
  rut: string | null;
  neto: number;
  total: number;
  tipo: "venta" | "compra";
};

export type F29Contab = {
  periodo: string;
  iva_debito: number | null;
  iva_credito: number | null;
  fecha_f29_presentado: string | null;
  monto_a_pagar: number | null;
  pago_por: string | null;
};

export type ContabilidadInfo = {
  habilitado: boolean;
  anio?: number;
  meses?: MesContab[];
  totales?: {
    ventas_neto: number;
    compras_neto: number;
    iva_debito: number;
    iva_credito: number;
    iva_pagar: number;
  };
  top_proveedores?: ContraparteContab[];
  top_clientes?: ContraparteContab[];
  ultimas_facturas?: FacturaContab[];
  f29?: F29Contab[];
};

export async function cargarContabilidad(
  token: string,
  anio: number,
): Promise<{ ok: boolean; info?: ContabilidadInfo; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_contabilidad", {
    p_token: token,
    p_anio: anio,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, info: data as ContabilidadInfo };
}

// ===================== Recursos humanos =====================

export type DotacionRow = { area: string; n: number };
export type TrabajadorRrhh = {
  nombre: string;
  cargo: string | null;
  tipo_contrato: string | null;
  fecha_ingreso: string | null;
  nuevo: boolean;
};
export type LicenciaRrhh = {
  trabajador: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  dias: number | null;
};
export type MovimientoRrhh = {
  tipo: string;
  trabajador: string | null;
  detalle: string | null;
  fecha: string | null;
};

export type RrhhInfo = {
  nomina_activa: number;
  contratos_nuevos: number;
  anexos_nuevos: number;
  licencias_vigentes: number;
  costo_remuneraciones: number;
  dotacion: DotacionRow[];
  trabajadores: TrabajadorRrhh[];
  licencias: LicenciaRrhh[];
  movimientos: MovimientoRrhh[];
};

export async function cargarRrhh(
  token: string,
  periodo: string,
): Promise<{ ok: boolean; info?: RrhhInfo; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_rrhh", {
    p_token: token,
    p_periodo: periodo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, info: data as RrhhInfo };
}

// ===================== Solicitar documento =====================

export type SolicitudDocRow = {
  id: string;
  area: "contabilidad" | "rrhh";
  tipo_documento: string;
  periodo: string | null;
  estado: "solicitada" | "en_revision" | "enviada" | "rechazada";
  created_at: string;
};

export async function listarSolicitudesDocumento(
  token: string,
): Promise<{ ok: boolean; rows?: SolicitudDocRow[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_solicitudes_documento", {
    p_token: token,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as SolicitudDocRow[] };
}

export async function solicitarDocumento(
  token: string,
  p: { area: "contabilidad" | "rrhh"; tipo_documento: string; periodo?: string; detalle?: string; correo?: string },
): Promise<{ ok: boolean; error?: string }> {
  if (!p.tipo_documento?.trim()) {
    return { ok: false, error: "Indica qué documento necesitas." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_solicitar_documento", {
    p_token: token,
    p: {
      area: p.area,
      tipo_documento: p.tipo_documento,
      periodo: p.periodo ?? null,
      detalle: p.detalle ?? null,
      correo: p.correo ?? null,
    },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo enviar la solicitud: ${error.message}`,
    };
  }
  return { ok: true };
}
