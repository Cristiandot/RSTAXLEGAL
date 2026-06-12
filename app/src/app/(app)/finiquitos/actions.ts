"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { EntradaFiniquito } from "@/lib/finiquito";
import {
  generarYSubirCartaAviso,
  type ParametrosCartaAviso,
  type ResultadoCartaAviso,
} from "@/lib/carta-aviso";

/**
 * Genera la carta de aviso de término (Art. 162 CT) con los datos de la
 * solicitud + el cálculo vigente, y devuelve el link de descarga.
 */
export async function generarCartaAviso(
  gestionId: string,
  parametros: ParametrosCartaAviso,
): Promise<ResultadoCartaAviso> {
  const supabase = await createClient();
  const res = await generarYSubirCartaAviso(supabase, gestionId, parametros);
  if (res.ok) revalidatePath("/finiquitos");
  return res;
}

export type ResumenCalculo = {
  total: number;
  remuneracionPendiente: number;
  indemAviso: number;
  indemAnios: number;
  vacacionesMonto: number;
  vacacionesDias: number;
  descuentoAfc: number;
  baseIndemnizatoria: number;
  aniosComputables: number;
  ufValor: number | null;
  periodoUf: string | null;
};

import {
  construirFilaDt,
  csvDt,
  type FilaDt,
} from "@/lib/dt-finiquitos";

export type ResultadoExportDt = {
  ok: boolean;
  error?: string;
  csv?: string;
  nombreArchivo?: string;
  faltantes?: { trabajador: string; campos: string[] }[];
};

/**
 * Arma el CSV de carga masiva del Finiquito Electrónico de la DT con las
 * solicitudes seleccionadas (requieren cálculo guardado). Los obligatorios
 * que el panel no tiene se reportan para completarlos en el Excel antes de
 * subir a la DT (máx. 100 filas por archivo según instructivo).
 */
export async function exportarCsvDt(
  gestionIds: string[],
): Promise<ResultadoExportDt> {
  if (gestionIds.length === 0) return { ok: false, error: "Selecciona al menos un finiquito." };
  if (gestionIds.length > 100) return { ok: false, error: "La DT acepta máximo 100 finiquitos por archivo." };

  const supabase = await createClient();
  const { data: gestiones, error } = await supabase
    .from("solicitudes_rrhh")
    .select(
      "id, tipo, trabajador_id, trabajador_nombre, trabajador_rut, datos, clientes(rut_empresa, comuna, domicilio), trabajadores(cargo, correo, comuna, direccion, fono, banco, tipo_cuenta, numero_cuenta)",
    )
    .in("id", gestionIds)
    .eq("tipo", "finiquito");
  if (error) return { ok: false, error: error.message };

  const filas: FilaDt[] = [];
  for (const g of gestiones ?? []) {
    const datos = (g.datos ?? {}) as Record<string, unknown>;
    const calculo = datos.calculo_finiquito as
      | {
          entrada?: { causal?: string; fechaInicio?: string; fechaTermino?: string };
          resumen?: {
            indemAnios?: number;
            indemAviso?: number;
            vacacionesMonto?: number;
            vacacionesDias?: number;
            remuneracionPendiente?: number;
          };
        }
      | undefined;
    if (!calculo?.resumen) {
      return {
        ok: false,
        error: `${g.trabajador_nombre}: no tiene cálculo guardado — calcula y guarda antes de exportar.`,
      };
    }
    const cli = g.clientes as unknown as Record<string, unknown> | null;
    const t = g.trabajadores as unknown as Record<string, unknown> | null;
    const str = (k: string) => (typeof datos[k] === "string" ? (datos[k] as string) : null);

    filas.push(
      construirFilaDt({
        trabajadorNombre: g.trabajador_nombre ?? "",
        rutEmpresa: (cli?.rut_empresa as string) ?? null,
        rutTrabajador: g.trabajador_rut,
        fechaInicio: calculo.entrada?.fechaInicio ?? str("fecha_ingreso"),
        fechaTermino: calculo.entrada?.fechaTermino ?? str("fecha_termino"),
        causal: calculo.entrada?.causal ?? "",
        funciones: (t?.cargo as string) ?? null,
        comunaTrabajo: (cli?.comuna as string) ?? null,
        direccionTrabajo: (cli?.domicilio as string) ?? null,
        diasVacaciones: calculo.resumen.vacacionesDias ?? null,
        indemFeriado: calculo.resumen.vacacionesMonto ?? null,
        indemAvisoPrevio: calculo.resumen.indemAviso ?? null,
        indemServicio: calculo.resumen.indemAnios ?? null,
        remuneracionPendiente: calculo.resumen.remuneracionPendiente ?? null,
        email: (t?.correo as string) ?? null,
        comunaPersonal: (t?.comuna as string) ?? null,
        direccionPersonal: (t?.direccion as string) ?? null,
        telefono: (t?.fono as string) ?? null,
        cuentaNumero: (t?.numero_cuenta as string) ?? null,
        bancoNombre: (t?.banco as string) ?? null,
        tipoCuentaNombre: (t?.tipo_cuenta as string) ?? null,
      }),
    );
  }

  const faltantes = filas
    .filter((f) => f.faltantes.length > 0)
    .map((f) => ({ trabajador: f.trabajador, campos: f.faltantes }));

  const hoy = new Date().toISOString().slice(0, 10);
  return {
    ok: true,
    csv: csvDt(filas),
    nombreArchivo: `PlantillaCargaFiniquitos-RSTL-${hoy}.csv`,
    faltantes,
  };
}

/**
 * Elimina definitivamente una solicitud de finiquito. La política RLS solo
 * permite DELETE a administradores; para operadores no borra ninguna fila y
 * se informa. El trigger de auditoría registra la eliminación en audit_log.
 */
export async function eliminarSolicitudFiniquito(
  gestionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("solicitudes_rrhh")
    .delete()
    .eq("id", gestionId)
    .eq("tipo", "finiquito")
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return {
      ok: false,
      error:
        "No se pudo eliminar: la solicitud no existe o tu cuenta no tiene permisos de administrador.",
    };
  }

  revalidatePath("/finiquitos");
  return { ok: true };
}

/**
 * Persiste el cálculo dentro de `datos.calculo_finiquito` de la solicitud,
 * sin tocar el resto de los campos que mandó el cliente. La auditoría queda
 * en `audit_log` vía trigger.
 */
export async function guardarCalculoFiniquito(
  gestionId: string,
  entrada: EntradaFiniquito,
  resumen: ResumenCalculo,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: gestion, error: errSel } = await supabase
    .from("solicitudes_rrhh")
    .select("id, tipo, datos")
    .eq("id", gestionId)
    .maybeSingle();
  if (errSel) return { ok: false, error: errSel.message };
  if (!gestion) return { ok: false, error: "No se encontró la solicitud." };
  if (gestion.tipo !== "finiquito") {
    return { ok: false, error: "La solicitud no es de tipo finiquito." };
  }

  const datos = (gestion.datos ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("solicitudes_rrhh")
    .update({
      datos: {
        ...datos,
        calculo_finiquito: {
          entrada,
          resumen,
          calculado_en: new Date().toISOString(),
        },
      },
    })
    .eq("id", gestionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/finiquitos");
  return { ok: true };
}
