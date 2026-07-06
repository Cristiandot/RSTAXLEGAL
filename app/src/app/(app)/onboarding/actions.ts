"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ESTADOS_ONBOARDING,
  HITO_ESTADO,
  type FaltanteRow,
} from "@/lib/onboarding";

type Resp = { ok: boolean; error?: string };

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
