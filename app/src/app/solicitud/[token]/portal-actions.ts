"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Lecturas del portal del cliente para los módulos Contabilidad y RRHH, más el
 * flujo de "solicitar documento". Todo pasa por RPCs SECURITY DEFINER validadas
 * por `form_token` — el rol anónimo no toca tablas directamente.
 */

// ===================== Datos de la empresa =====================

export type EmpresaDatos = {
  razon_social: string;
  rut_empresa: string | null;
  giro: string | null;
  domicilio: string | null;
  comuna: string | null;
  ciudad: string | null;
  telefono_empresa: string | null;
  correo_empresa: string | null;
  representante_legal: string | null;
  representante_legal_rut: string | null;
  hace_contabilidad_completa: boolean;
};

export async function cargarEmpresa(
  token: string,
): Promise<{ ok: boolean; empresa?: EmpresaDatos; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_empresa", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, empresa: data as EmpresaDatos };
}

export async function guardarEmpresa(
  token: string,
  p: {
    giro: string;
    domicilio: string;
    comuna: string;
    ciudad: string;
    telefono_empresa: string;
    correo_empresa: string;
    representante_legal: string;
    representante_legal_rut: string;
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_guardar_empresa", { p_token: token, p });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudieron guardar los datos: ${error.message}`,
    };
  }
  return { ok: true };
}

// ===================== Sucursales =====================

export type Sucursal = {
  id: string | null;
  nombre: string;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  telefono: string | null;
};

export async function cargarSucursales(
  token: string,
): Promise<{ ok: boolean; sucursales?: Sucursal[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_sucursales", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, sucursales: (data ?? []) as Sucursal[] };
}

export async function guardarSucursal(
  token: string,
  s: Sucursal,
): Promise<{ ok: boolean; error?: string }> {
  if (!s.nombre.trim()) return { ok: false, error: "La sucursal necesita un nombre." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_guardar_sucursal", {
    p_token: token,
    p: {
      id: s.id,
      nombre: s.nombre,
      direccion: s.direccion ?? "",
      comuna: s.comuna ?? "",
      ciudad: s.ciudad ?? "",
      telefono: s.telefono ?? "",
    },
  });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("inválido")
        ? "Este link no es válido. Contacta a RS Tax & Legal."
        : `No se pudo guardar la sucursal: ${error.message}`,
    };
  }
  return { ok: true };
}

export async function eliminarSucursal(
  token: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("portal_eliminar_sucursal", { p_token: token, p_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ===================== Reglamento interno (RIHS / RIOHS) =====================

export type Reglamento = {
  tiene: boolean;
  tipo: "RIHS" | "RIOHS" | null;
  actualizado: string | null;
};

export async function cargarReglamento(
  token: string,
): Promise<{ ok: boolean; reglamento?: Reglamento; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_reglamento", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, reglamento: data as Reglamento };
}

export async function subirReglamento(
  token: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const tipo = String(formData.get("tipo") ?? "");
  if (tipo !== "RIHS" && tipo !== "RIOHS") {
    return { ok: false, error: "Indica si es RIHS o RIOHS." };
  }
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Adjunta el documento (PDF o imagen)." };
  }
  if (archivo.size > 10 * 1024 * 1024) {
    return { ok: false, error: "El archivo supera los 10 MB." };
  }

  const supabase = await createClient();
  const { data: valido, error: errTok } = await supabase.rpc("portal_token_valido", { p_token: token });
  if (errTok || !valido) {
    return { ok: false, error: "Este link no es válido. Contacta a RS Tax & Legal." };
  }

  const punto = archivo.name.lastIndexOf(".");
  const ext = punto >= 0 ? archivo.name.slice(punto + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const path = `portal/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const { error: errUp } = await supabase.storage
    .from("reglamentos")
    .upload(path, archivo, { contentType: archivo.type || undefined, upsert: false });
  if (errUp) return { ok: false, error: `No se pudo subir el archivo: ${errUp.message}` };

  const { error } = await supabase.rpc("portal_set_reglamento", {
    p_token: token,
    p: { path, tipo },
  });
  if (error) return { ok: false, error: `No se pudo registrar: ${error.message}` };
  return { ok: true };
}

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

export type MesDetalle = {
  habilitado: boolean;
  periodo?: string;
  ventas_neto?: number;
  compras_neto?: number;
  iva_debito?: number;
  iva_credito?: number;
  ventas_total?: number;
  top_proveedores?: ContraparteContab[];
  top_clientes?: ContraparteContab[];
  ultimas_facturas?: FacturaContab[];
};

export async function cargarContabilidadMes(
  token: string,
  periodo: string,
): Promise<{ ok: boolean; mes?: MesDetalle; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_contabilidad_mes", {
    p_token: token,
    p_periodo: periodo,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, mes: data as MesDetalle };
}

// ===================== Recursos humanos =====================

export type DotacionRow = { area: string; n: number };
export type TrabajadorRrhh = {
  nombre: string;
  rut: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  fecha_ingreso: string | null;
  fecha_termino: string | null;
  nuevo: boolean;
};

export type FiniquitoActivo = { trabajador: string; rut: string | null; estado: string };
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
  plazo_fijo: number;
  indefinidos: number;
  plazo_fijo_por_vencer: number;
  contratos_nuevos: number;
  anexos_nuevos: number;
  licencias_vigentes: number;
  costo_remuneraciones: number;
  finiquitos_activos: number;
  finiquitos: FiniquitoActivo[];
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

// ===================== Nómina con remuneración (para Detalle remuneraciones) =====================

export type TasaAfpRow = { nombre: string; tasa_trabajador: number };
export type IndicadoresNomina = { periodo: string; imm: number; utm: number; tasas_afp: TasaAfpRow[] };
export type RemuneracionJson = {
  sueldo_base?: number;
  colacion?: number;
  movilizacion?: number;
  perdida_caja?: number;
  gratificacion?: string;
  gratificacion_tipo?: string;
  gratificacion_monto?: number | null;
  liquido_pactado?: number;
  modalidad?: string;
  valor_dia?: number;
  observaciones?: string;
} | null;
export type TrabajadorNomina = {
  id: string;
  nombre: string;
  rut: string | null;
  cargo: string | null;
  tipo_contrato: string | null;
  fecha_ingreso: string | null;
  fecha_termino: string | null;
  afp: string | null;
  salud: string | null;
  remuneracion: RemuneracionJson;
  sueldo_base_t: number | null;
};
export type RemuneracionNomina = {
  indicadores: IndicadoresNomina | null;
  trabajadores: TrabajadorNomina[];
};

export async function cargarRemuneracionNomina(
  token: string,
): Promise<{ ok: boolean; data?: RemuneracionNomina; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_remuneracion_nomina", { p_token: token });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as RemuneracionNomina };
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
