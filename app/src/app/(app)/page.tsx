import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GestionRow } from "@/lib/gestiones";
import type { UsuarioOpcion } from "@/lib/ciclos";
import { InicioClient } from "./inicio-client";

export const metadata = { title: "Inicio y requerimientos — RS Tax & Legal" };

function saludoPorHora(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default async function HomePage() {
  const usuario = await getUsuarioActual();
  const primerNombre = usuario.nombre.split(" ")[0];
  const supabase = await createClient();

  const [pendientesRes, historialRes, usuariosRes] = await Promise.all([
    supabase
      .from("v_gestiones_oficina")
      .select("*")
      .eq("pendiente", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("v_gestiones_oficina")
      .select("*")
      .eq("pendiente", false)
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("usuarios")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {saludoPorHora()}, {primerNombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {usuario.nombre} · {usuario.rol} · {usuario.correo}
        </p>
      </header>

      <InicioClient
        pendientes={(pendientesRes.data ?? []) as GestionRow[]}
        historial={(historialRes.data ?? []) as GestionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        errorCarga={pendientesRes.error?.message ?? null}
      />
    </main>
  );
}
