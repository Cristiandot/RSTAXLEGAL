"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validarRut, formatearRut } from "@/lib/rut";
import {
  ESTADOS_ONBOARDING,
  GRUPOS_CARTERA,
  HITO_ESTADO,
  tipoCampo,
  type FaltanteRow,
} from "@/lib/onboarding";

type Resp = { ok: boolean; error?: string };

/** Convierte el texto del input al valor a guardar, validando por tipo. */
function coercerValor(
  campo: string,
  v: string,
): { ok: true; valor: unknown } | { ok: false; error: string } {
  switch (tipoCampo(campo)) {
    case "rut":
      if (!validarRut(v))
        return { ok: false, error: "RUT inválido (dígito verificador)" };
      return { ok: true, valor: formatearRut(v) };
    case "fecha":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
        return { ok: false, error: "Fecha inválida" };
      return { ok: true, valor: v };
    case "numero": {
      const n = Number(v.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, error: "Número inválido" };
      return { ok: true, valor: n };
    }
    case "correo":
      if (!/^\S+@\S+\.\S+$/.test(v))
        return { ok: false, error: "Correo inválido" };
      return { ok: true, valor: v };
    case "lineas": {
      const lineas = v.split("\n").map((l) => l.trim()).filter(Boolean);
      if (campo !== "socios") return { ok: true, valor: lineas };
      const socios: unknown[] = [];
      for (const l of lineas) {
        const [nombre, rut, part] = l.split(";").map((s) => s.trim());
        if (!nombre) return { ok: false, error: `Línea sin nombre: "${l}"` };
        if (rut && !validarRut(rut))
          return { ok: false, error: `RUT inválido en "${l}"` };
        socios.push({
          nombre,
          rut: rut ? formatearRut(rut) : null,
          participacion: part
            ? Number(part.replace("%", "").replace(",", "."))
            : null,
        });
      }
      return { ok: true, valor: socios };
    }
    default:
      return { ok: true, valor: v };
  }
}

/**
 * Guarda directamente el valor de un campo faltante (edición del equipo:
 * ustedes son los validadores, no pasa por `cambios_propuestos`).
 */
export async function guardarCampo(
  entidad: "cliente" | "trabajador",
  registroId: string,
  campo: string,
  valor: string,
): Promise<Resp> {
  const v = valor.trim();
  if (!v) return { ok: false, error: "Valor vacío" };
  const supabase = await createClient();

  // El campo debe existir en el catálogo (anti escritura arbitraria).
  const { data: def } = await supabase
    .from("onboarding_campos")
    .select("campo, selector, inmutable")
    .eq("entidad", entidad)
    .eq("campo", campo)
    .eq("activo", true)
    .maybeSingle();
  if (!def) return { ok: false, error: `Campo "${campo}" no permitido` };

  let guardar: unknown = v;
  if (def.selector) {
    const { data: op } = await supabase
      .from("catalogo_valores")
      .select("codigo")
      .eq("tipo", def.selector)
      .eq("codigo", v)
      .eq("activo", true)
      .maybeSingle();
    if (!op) return { ok: false, error: "Valor fuera del selector" };
  } else {
    const c = coercerValor(campo, v);
    if (!c.ok) return { ok: false, error: c.error };
    guardar = c.valor;
  }

  const tabla = entidad === "cliente" ? "clientes" : "trabajadores";

  // Los inmutables solo se pueden llenar mientras están vacíos.
  if (def.inmutable) {
    const { data: fila } = await supabase
      .from(tabla)
      .select(campo)
      .eq("id", registroId)
      .maybeSingle();
    const actual = (fila as Record<string, unknown> | null)?.[campo];
    if (actual !== null && actual !== undefined && actual !== "")
      return { ok: false, error: "Campo inmutable: ya tiene valor" };
  }

  const { error } = await supabase
    .from(tabla)
    .update({ [campo]: guardar })
    .eq("id", registroId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  revalidatePath("/clientes");
  revalidatePath("/empresas");
  return { ok: true };
}

/**
 * Inserta un cliente (grupo) nuevo asignándole el correlativo siguiente de
 * su letra según los códigos ya usados, con la carpeta OneDrive solicitada
 * (la crea el proceso local; si el código chocara con una carpeta existente,
 * el script lo reasigna — OneDrive manda).
 */
async function insertarGrupo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nombre: string | undefined,
  letra: string | undefined,
  correo?: string,
  telefono?: string,
): Promise<{ ok: true; id: string; codigo: string } | { ok: false; error: string }> {
  const n = nombre?.trim();
  if (!n) return { ok: false, error: "El nombre del cliente es obligatorio" };
  if (!GRUPOS_CARTERA.some((g) => g.codigo === letra))
    return { ok: false, error: "Letra de cartera no válida" };
  if (correo?.trim() && !/^\S+@\S+\.\S+$/.test(correo.trim()))
    return { ok: false, error: "Correo del cliente inválido" };

  const { data: dup } = await supabase
    .from("grupos_cliente")
    .select("codigo")
    .ilike("nombre", n)
    .maybeSingle();
  if (dup)
    return { ok: false, error: `Ya existe un cliente "${n}" (${dup.codigo})` };

  const { data: codigos } = await supabase
    .from("grupos_cliente")
    .select("codigo")
    .like("codigo", `${letra}.%`);
  let max = 0;
  for (const c of codigos ?? []) {
    const num = Number(c.codigo?.split(".")[1]);
    if (Number.isInteger(num) && num > max) max = num;
  }
  const codigo = `${letra}.${max + 1}`;

  const { data: g, error } = await supabase
    .from("grupos_cliente")
    .insert({
      codigo,
      nombre: n,
      correo: correo?.trim() || null,
      telefono: telefono?.trim() || null,
      carpeta_solicitada_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: g.id, codigo };
}

/**
 * Crea un cliente nuevo (sin empresas todavía): queda con su código
 * correlativo y la carpeta OneDrive se crea automáticamente.
 */
export async function crearCliente(
  nombre: string,
  letra: string,
  correo?: string,
  telefono?: string,
): Promise<Resp & { codigo?: string }> {
  const supabase = await createClient();
  const g = await insertarGrupo(supabase, nombre, letra, correo, telefono);
  if (!g.ok) return g;
  revalidatePath("/onboarding");
  return { ok: true, codigo: g.codigo };
}

export type NuevaEmpresaInput = {
  /** Cliente existente (grupos_cliente.id)… */
  grupo_id?: string;
  /** …o cliente nuevo: nombre + letra de cartera (el correlativo se asigna solo). */
  nuevo_cliente_nombre?: string;
  nuevo_cliente_letra?: string;
  nuevo_cliente_correo?: string;
  nuevo_cliente_telefono?: string;
  rut_empresa: string;
  razon_social: string;
  nombre_fantasia?: string;
  tipo_sociedad?: string;
  regimen_tributario?: string;
  giro?: string;
  contacto_nombre?: string;
  contacto_correo?: string;
  contacto_telefono?: string;
  comuna?: string;
  domicilio?: string;
  /** Servicios: definen los ciclos mensuales que el panel le abre a la empresa. */
  hace_f29?: boolean;
  hace_liquidaciones?: boolean;
  /** Dotación declarada (obligatoria si hace_liquidaciones). */
  n_trabajadores_esperados?: number;
};

/**
 * Crea una empresa colgando de un cliente (grupo) existente o nuevo.
 * Cliente nuevo: se le asigna el correlativo siguiente de su letra
 * ("D" → D.47) y queda con la carpeta OneDrive solicitada; la empresa
 * queda en `pendiente_contacto` y con su subcarpeta solicitada (ambas
 * las crea el proceso local del equipo).
 */
export async function crearEmpresa(
  input: NuevaEmpresaInput,
): Promise<Resp & { id?: string }> {
  const razon = input.razon_social?.trim();
  if (!razon) return { ok: false, error: "La razón social es obligatoria" };
  if (!validarRut(input.rut_empresa))
    return { ok: false, error: "RUT inválido (dígito verificador)" };
  const rut = formatearRut(input.rut_empresa);

  const supabase = await createClient();
  const { data: dup } = await supabase
    .from("clientes")
    .select("id, razon_social")
    .eq("rut_empresa", rut)
    .maybeSingle();
  if (dup)
    return { ok: false, error: `Ese RUT ya existe: ${dup.razon_social}` };

  // Resolver el cliente (grupo): existente o nuevo.
  let grupoId = input.grupo_id || null;
  if (!grupoId) {
    const g = await insertarGrupo(
      supabase,
      input.nuevo_cliente_nombre,
      input.nuevo_cliente_letra,
      input.nuevo_cliente_correo,
      input.nuevo_cliente_telefono,
    );
    if (!g.ok) return g;
    grupoId = g.id;
  } else {
    const { data: g } = await supabase
      .from("grupos_cliente")
      .select("id")
      .eq("id", grupoId)
      .maybeSingle();
    if (!g) return { ok: false, error: "Cliente no encontrado" };
  }

  // Selectores opcionales: si vienen, deben estar en catálogo.
  const selectores: Array<[string, string | undefined]> = [
    ["tipo_sociedad", input.tipo_sociedad],
    ["regimen_tributario", input.regimen_tributario],
    ["comuna", input.comuna],
  ];
  for (const [tipo, val] of selectores) {
    if (!val) continue;
    const { data: op } = await supabase
      .from("catalogo_valores")
      .select("codigo")
      .eq("tipo", tipo)
      .eq("codigo", val)
      .eq("activo", true)
      .maybeSingle();
    if (!op)
      return { ok: false, error: `Valor fuera del selector (${tipo})` };
  }
  if (input.contacto_correo && !/^\S+@\S+\.\S+$/.test(input.contacto_correo))
    return { ok: false, error: "Correo de contacto inválido" };

  // Si hace liquidaciones, la dotación declarada es obligatoria (>0) —
  // es el contraste para que no se pase ninguna liquidación.
  const nTrab = input.hace_liquidaciones
    ? input.n_trabajadores_esperados
    : null;
  if (input.hace_liquidaciones) {
    if (!Number.isInteger(nTrab) || (nTrab as number) < 1)
      return {
        ok: false,
        error: "Indique cuántos trabajadores tiene la empresa",
      };
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      razon_social: razon,
      rut_empresa: rut,
      grupo_id: grupoId,
      nombre_fantasia: input.nombre_fantasia?.trim() || null,
      tipo_sociedad: input.tipo_sociedad || null,
      regimen_tributario: input.regimen_tributario || null,
      giro: input.giro?.trim() || null,
      contacto_nombre: input.contacto_nombre?.trim() || null,
      contacto_correo: input.contacto_correo?.trim() || null,
      contacto_telefono: input.contacto_telefono?.trim() || null,
      comuna: input.comuna || null,
      domicilio: input.domicilio?.trim() || null,
      hace_f29: Boolean(input.hace_f29),
      hace_liquidaciones: Boolean(input.hace_liquidaciones),
      n_trabajadores_esperados: nTrab,
      activo: true,
      onboarding_estado: "pendiente_contacto",
      carpeta_solicitada_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true, id: data.id };
}

/** Campos faltantes de una empresa: su ficha + la de cada uno de sus trabajadores. */
export async function faltantesDeEmpresa(
  clienteId: string,
): Promise<FaltanteRow[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("v_onboarding_completitud")
    .select("entidad, registro_id, cliente_id, campo, etiqueta, grupo, fuente")
    .eq("cliente_id", clienteId)
    .eq("falta", true);

  if (!rows?.length) return [];

  const { data: cli } = await supabase
    .from("clientes")
    .select("razon_social, rut_empresa")
    .eq("id", clienteId)
    .maybeSingle();

  const trabIds = [
    ...new Set(
      rows.filter((r) => r.entidad === "trabajador").map((r) => r.registro_id),
    ),
  ];
  const trabMap = new Map<string, { nombre: string; rut: string | null }>();
  if (trabIds.length) {
    const { data: trabs } = await supabase
      .from("trabajadores")
      .select("id, nombres, apellidos, rut")
      .in("id", trabIds);
    trabs?.forEach((t) =>
      trabMap.set(t.id, {
        nombre: `${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim(),
        rut: t.rut,
      }),
    );
  }

  return rows.map((r) => ({
    ...(r as Omit<FaltanteRow, "registro_nombre" | "registro_rut">),
    registro_nombre:
      r.entidad === "cliente"
        ? (cli?.razon_social ?? "")
        : (trabMap.get(r.registro_id)?.nombre ?? "—"),
    registro_rut:
      r.entidad === "cliente"
        ? (cli?.rut_empresa ?? null)
        : (trabMap.get(r.registro_id)?.rut ?? null),
  }));
}

/** Registros (de toda la cartera) a los que les falta un campo concreto. */
export async function registrosFaltanCampo(
  entidad: "cliente" | "trabajador",
  campo: string,
): Promise<FaltanteRow[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("v_onboarding_completitud")
    .select("entidad, registro_id, cliente_id, campo, etiqueta, grupo, fuente")
    .eq("entidad", entidad)
    .eq("campo", campo)
    .eq("falta", true);

  if (!rows?.length) return [];

  // Nombres de empresas (para contexto y para el propio registro si es cliente).
  const cliIds = [
    ...new Set(rows.map((r) => r.cliente_id).filter(Boolean) as string[]),
  ];
  const cliMap = new Map<string, { nombre: string; rut: string | null }>();
  if (cliIds.length) {
    const { data: clis } = await supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa")
      .in("id", cliIds);
    clis?.forEach((c) =>
      cliMap.set(c.id, { nombre: c.razon_social, rut: c.rut_empresa }),
    );
  }

  const trabMap = new Map<string, { nombre: string; rut: string | null }>();
  if (entidad === "trabajador") {
    const ids = [...new Set(rows.map((r) => r.registro_id))];
    const { data: trabs } = await supabase
      .from("trabajadores")
      .select("id, nombres, apellidos, rut")
      .in("id", ids);
    trabs?.forEach((t) =>
      trabMap.set(t.id, {
        nombre: `${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim(),
        rut: t.rut,
      }),
    );
  }

  return rows.map((r) => ({
    ...(r as Omit<FaltanteRow, "registro_nombre" | "registro_rut">),
    registro_nombre:
      entidad === "cliente"
        ? (cliMap.get(r.registro_id)?.nombre ?? "—")
        : (trabMap.get(r.registro_id)?.nombre ?? "—"),
    registro_rut:
      entidad === "cliente"
        ? (cliMap.get(r.registro_id)?.rut ?? null)
        : (trabMap.get(r.registro_id)?.rut ?? null),
  }));
}

/** Campos faltantes de TODAS las empresas (y sus trabajadores) de un cliente. */
export async function faltantesDeGrupo(grupoId: string): Promise<FaltanteRow[]> {
  const supabase = await createClient();
  const { data: empresas } = await supabase
    .from("clientes")
    .select("id")
    .eq("grupo_id", grupoId);
  const ids = (empresas ?? []).map((e) => e.id);
  if (!ids.length) return [];

  const listas = await Promise.all(ids.map((id) => faltantesDeEmpresa(id)));
  return listas.flat();
}

/** Actualiza el correo del cliente (grupo). */
export async function actualizarContactoCliente(
  grupoId: string,
  correo: string,
): Promise<Resp> {
  const c = correo.trim();
  if (c && !/^\S+@\S+\.\S+$/.test(c))
    return { ok: false, error: "Correo inválido" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("grupos_cliente")
    .update({ correo: c || null })
    .eq("id", grupoId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/clientes");
  return { ok: true };
}

/** Cambia la etapa de onboarding de una empresa y estampa el hito de la etapa. */
export async function setOnboardingEstado(
  clienteId: string,
  estado: string,
): Promise<Resp> {
  if (!ESTADOS_ONBOARDING.includes(estado as never)) {
    return { ok: false, error: "Estado no válido" };
  }
  const supabase = await createClient();
  const patch: Record<string, unknown> = { onboarding_estado: estado };
  const hito = HITO_ESTADO[estado];
  if (hito) patch[hito] = new Date().toISOString();

  const { error } = await supabase
    .from("clientes")
    .update(patch)
    .eq("id", clienteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true };
}

/** Aprueba un cambio propuesto: aplica el valor a la tabla productiva. */
export async function aprobarCambio(id: string): Promise<Resp> {
  const supabase = await createClient();
  const { data: cambio, error: e0 } = await supabase
    .from("cambios_propuestos")
    .select("entidad, registro_id, campo, valor_propuesto")
    .eq("id", id)
    .maybeSingle();
  if (e0) return { ok: false, error: e0.message };
  if (!cambio) return { ok: false, error: "Cambio no encontrado" };

  // El campo debe existir en el catálogo de onboarding (anti escritura arbitraria).
  const { data: def } = await supabase
    .from("onboarding_campos")
    .select("campo")
    .eq("entidad", cambio.entidad)
    .eq("campo", cambio.campo)
    .maybeSingle();
  if (!def) return { ok: false, error: `Campo "${cambio.campo}" no permitido` };

  const tabla = cambio.entidad === "cliente" ? "clientes" : "trabajadores";
  const { error: e1 } = await supabase
    .from(tabla)
    .update({ [cambio.campo]: cambio.valor_propuesto })
    .eq("id", cambio.registro_id);
  if (e1) return { ok: false, error: e1.message };

  const { error: e2 } = await supabase
    .from("cambios_propuestos")
    .update({ estado: "aprobado", resuelto_at: new Date().toISOString() })
    .eq("id", id);
  if (e2) return { ok: false, error: e2.message };

  revalidatePath("/onboarding");
  return { ok: true };
}

/** Devuelve un cambio propuesto con una observación (no toca lo oficial). */
export async function devolverCambio(
  id: string,
  observacion: string,
): Promise<Resp> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cambios_propuestos")
    .update({
      estado: "devuelto",
      observacion: observacion || null,
      resuelto_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/onboarding");
  return { ok: true };
}
