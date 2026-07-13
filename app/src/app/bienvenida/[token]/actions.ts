"use server";

import { createClient } from "@/lib/supabase/server";
import { validarRut, formatearRut } from "@/lib/rut";

export type TrabajadorDeclarado = {
  nombres: string;
  apellidos: string;
  rut: string;
  cargo: string;
};

export type OnboardingPayload = {
  empresa: {
    razon_social: string;
    rut_empresa: string;
    nombre_fantasia: string;
    giro: string;
    domicilio: string;
    comuna: string;
    ciudad: string;
    telefono_empresa: string;
    correo_empresa: string;
    representante_legal: string;
    representante_legal_rut: string;
  };
  contacto: { nombre: string; correo: string; telefono: string };
  accesos: { clave_sii: string; previred_rut: string; previred_clave: string };
  pago: { ya_suscrito: boolean };
  rrhh: {
    tiene_trabajadores: boolean;
    n_trabajadores: number | null;
    trabajadores: TrabajadorDeclarado[];
  };
};

/** Envía el formulario de bienvenida: valida y llama a la RPC por token, que
 *  crea/completa la ficha en `clientes` e inserta los trabajadores declarados. */
export async function enviarOnboarding(
  token: string,
  p: OnboardingPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!p.empresa.razon_social.trim())
    return { ok: false, error: "La razón social es obligatoria." };
  if (!validarRut(p.empresa.rut_empresa))
    return { ok: false, error: "El RUT de la empresa no es válido (revisa el dígito verificador)." };
  if (!p.contacto.nombre.trim() || !p.contacto.correo.trim())
    return { ok: false, error: "Nombre y correo de contacto son obligatorios." };
  if (!/^\S+@\S+\.\S+$/.test(p.contacto.correo.trim()))
    return { ok: false, error: "El correo de contacto no es válido." };
  if (p.empresa.correo_empresa.trim() && !/^\S+@\S+\.\S+$/.test(p.empresa.correo_empresa.trim()))
    return { ok: false, error: "El correo de la empresa no es válido." };
  if (!p.accesos.clave_sii.trim())
    return { ok: false, error: "La clave del SII es obligatoria — con ella obtenemos todo lo demás sin pedirte papeles." };
  if (p.empresa.representante_legal_rut.trim() && !validarRut(p.empresa.representante_legal_rut))
    return { ok: false, error: "El RUT del representante legal no es válido." };

  const trabajadores: TrabajadorDeclarado[] = [];
  if (p.rrhh.tiene_trabajadores) {
    for (const t of p.rrhh.trabajadores) {
      if (!t.nombres.trim() && !t.rut.trim()) continue; // fila vacía
      if (!t.nombres.trim())
        return { ok: false, error: "Hay un trabajador sin nombre en la lista." };
      if (t.rut.trim() && !validarRut(t.rut))
        return { ok: false, error: `El RUT del trabajador "${t.nombres}" no es válido.` };
      trabajadores.push({
        nombres: t.nombres.trim(),
        apellidos: t.apellidos.trim(),
        rut: t.rut.trim() ? formatearRut(t.rut) : "",
        cargo: t.cargo.trim(),
      });
    }
  }

  const payload = {
    ...p,
    empresa: { ...p.empresa, rut_empresa: formatearRut(p.empresa.rut_empresa) },
    rrhh: {
      ...p.rrhh,
      n_trabajadores: p.rrhh.tiene_trabajadores
        ? (p.rrhh.n_trabajadores ?? trabajadores.length) || trabajadores.length
        : 0,
      trabajadores,
    },
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc("onboarding_invitacion_enviar", {
    p_token: token,
    p: payload,
  });
  if (error) return { ok: false, error: "No pudimos guardar tus datos. Intenta de nuevo o avísanos." };
  return { ok: true };
}
