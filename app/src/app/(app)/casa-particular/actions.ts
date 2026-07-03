"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { generarDocx, fechaLarga, montoCLP } from "@/lib/generar-docx";
import { montoEnPalabras } from "@/lib/numero-palabras";
import { nombreArchivo } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const PLANTILLA: Record<string, string> = {
  plazo_fijo:
    "plantillas/GENERICO/CONTRATO Casa Particular Puertas Afuera - Plazo Fijo.docx",
  indefinido:
    "plantillas/GENERICO/CONTRATO Casa Particular Puertas Afuera - Indefinido.docx",
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Id en `usuarios` del usuario autenticado (null si no se resuelve). */
async function usuarioActualId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("correo", user.email.toLowerCase())
    .eq("activo", true)
    .maybeSingle();
  return data?.id ?? null;
}

export type GenerarCasaParticularInput = {
  clienteId: string | null;
  tipoContrato: "plazo_fijo" | "indefinido";
  // Empleador (persona natural)
  empleadorNombre: string;
  empleadorRut: string;
  empleadorDomicilio: string;
  // Trabajadora
  trabajadoraNombre: string;
  trabajadoraRut: string;
  fechaNacimiento: string; // YYYY-MM-DD
  direccion: string;
  comuna: string;
  nacionalidad: string;
  afp: string;
  salud: string;
  // Contrato
  funciones: string;
  ciudadFirma: string;
  horasSemanales: string;
  distribucionJornada: string;
  sueldoDia: number;
  movilizacionDia: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaTermino: string; // YYYY-MM-DD (solo plazo fijo)
  clausulasAdicionales: string;
};

/**
 * Genera el contrato de trabajador de casa particular puertas afuera (.docx)
 * desde la plantilla tipo (plazo fijo o indefinido), lo sube al bucket
 * `contratos`, registra la fila en `casa_particular_contratos` y devuelve el
 * archivo en base64 para descarga inmediata. Empleador = persona natural.
 */
export async function generarContratoCasaParticular(
  input: GenerarCasaParticularInput,
): Promise<{ ok: boolean; error?: string; base64?: string; filename?: string }> {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)

  const empleador = input.empleadorNombre.trim();
  const trabajadora = input.trabajadoraNombre.trim();
  if (!empleador) return { ok: false, error: "Falta el nombre del empleador." };
  if (!trabajadora) return { ok: false, error: "Falta el nombre de la trabajadora." };
  if (!input.fechaInicio) return { ok: false, error: "Falta la fecha de inicio." };
  if (!(input.sueldoDia > 0)) return { ok: false, error: "Falta el sueldo por día." };
  if (input.tipoContrato === "plazo_fijo" && !input.fechaTermino) {
    return { ok: false, error: "En plazo fijo debes indicar la fecha de término." };
  }

  const plantilla = PLANTILLA[input.tipoContrato];
  if (!plantilla) return { ok: false, error: "Tipo de contrato no válido." };

  const sueldo = Number(input.sueldoDia);
  const movil = Number(input.movilizacionDia) || 0;

  const variables: Record<string, string> = {
    CIUDAD_FIRMA: input.ciudadFirma.trim(),
    FECHA_INICIO_CONTRATO: fechaLarga(input.fechaInicio),
    FECHA_TERMINO_CONTRATO: input.fechaTermino ? fechaLarga(input.fechaTermino) : "",
    RAZON_SOCIAL: empleador,
    RUT_EMPRESA: input.empleadorRut.trim(),
    DIRECCION_EMPRESA: input.empleadorDomicilio.trim(),
    NOMBRE_EMPLEADO: trabajadora,
    RUT_EMPLEADO: input.trabajadoraRut.trim(),
    FECHA_NACIMIENTO: input.fechaNacimiento ? fechaLarga(input.fechaNacimiento) : "",
    DIRECCION_EMPLEADO: input.direccion.trim(),
    COMUNA_EMPLEADO: input.comuna.trim(),
    NACIONALIDAD_EMPLEADO: input.nacionalidad.trim() || "chilena",
    FUNCIONES_CASA:
      input.funciones.trim() ||
      "aseo, cocina, lavado y planchado, entre otras funciones propias de la naturaleza de los servicios",
    SUELDO_BASE: `$${montoCLP(sueldo)} líquidos por día efectivamente trabajado (${montoEnPalabras(
      sueldo,
    )} líquidos)`,
    ASIGNACION_MOVILIZACION: montoCLP(movil),
    PREVISION: input.afp.trim(),
    INSTITUCION_SALUD: input.salud.trim(),
    HORAS_SEMANALES: input.horasSemanales.trim().replace(".", ","),
    DISTRIBUCION_JORNADA: input.distribucionJornada.trim(),
    CLAUSULAS_ADICIONALES: input.clausulasAdicionales.trim()
      ? `CLÁUSULA ADICIONAL PACTADA: ${input.clausulasAdicionales.trim()}`
      : "",
  };

  try {
    const buffer = await generarDocx(plantilla, variables);
    const filename = nombreArchivo(`Contrato Casa Particular - ${trabajadora}`) + ".docx";

    const supabase = await createClient();
    const path = `casa-particular/${input.clienteId ?? "sin-cliente"}/${Date.now()}-${filename}`;
    const { error: errUp } = await supabase.storage
      .from("contratos")
      .upload(path, new Uint8Array(buffer), { contentType: DOCX_MIME });
    if (errUp) return { ok: false, error: `Falló la subida a Storage: ${errUp.message}` };

    const { error: errIns } = await supabase.from("casa_particular_contratos").insert({
      cliente_id: input.clienteId,
      tipo_contrato: input.tipoContrato,
      empleador_nombre: empleador,
      empleador_rut: input.empleadorRut.trim() || null,
      trabajadora_nombre: trabajadora,
      trabajadora_rut: input.trabajadoraRut.trim() || null,
      documento_path: path,
      nombre_original: filename,
      generado_por: await usuarioActualId(supabase),
    });
    if (errIns) return { ok: false, error: errIns.message };

    revalidatePath("/casa-particular");
    return { ok: true, base64: buffer.toString("base64"), filename };
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo generar el documento: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Link firmado (1 h) para descargar un contrato ya generado. */
export async function urlContratoCasa(
  documentoPath: string,
  nombre: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  await getUsuarioActual();
  const supabase = await createClient();
  const punto = nombre.lastIndexOf(".");
  const descarga =
    punto > 0
      ? nombreArchivo(nombre.slice(0, punto)) + nombre.slice(punto).toLowerCase()
      : nombreArchivo(nombre);
  const { data, error } = await supabase.storage
    .from("contratos")
    .createSignedUrl(documentoPath, 3600, { download: descarga });
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "No se pudo generar el link." };
  }
  return { ok: true, url: data.signedUrl };
}
