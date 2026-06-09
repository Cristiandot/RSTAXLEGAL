import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Rol } from "@/lib/modules";

export type UsuarioActual = {
  nombre: string;
  correo: string;
  rol: Rol;
};

/**
 * Devuelve el usuario autenticado y autorizado (presente y activo en
 * `usuarios`). Si no hay sesión o el correo no está autorizado, cierra sesión
 * y redirige a /login. Pensado para usarse en layouts y páginas del grupo (app).
 */
export async function getUsuarioActual(): Promise<UsuarioActual> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const correo = user.email.toLowerCase();
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("nombre, rol")
    .eq("correo", correo)
    .eq("activo", true)
    .maybeSingle();

  if (!usuario) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return {
    nombre: usuario.nombre ?? correo,
    correo,
    rol: (usuario.rol as Rol) ?? "operador",
  };
}
