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

/** "jueves 10 de julio de 2026" en hora de Chile. */
function fechaHoyLarga(): string {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(new Date());
}

/** Mes en curso en hora de Chile, formato 'YYYY-MM'. */
function mesActualCL(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  return p.slice(0, 7); // 'YYYY-MM'
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const sp = await searchParams;
  const mesSel = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesActualCL();
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

  // Empresas activas: para el selector del botón "+" (tarea manual) y para el
  // desplegable de empresa por fila (se filtran por grupo del requerimiento).
  const clientesRes = await supabase
    .from("clientes")
    .select("id, razon_social, grupo_id")
    .eq("activo", true)
    .order("razon_social");

  // Registro de cumplimiento SLA por encargado (gestiones resueltas).
  const cumplimientoRes = await supabase
    .from("v_cumplimiento_encargado")
    .select("*");

  // Ranking de requerimientos por empresa del mes seleccionado + meses con datos.
  const [porEmpresaRes, mesesRes] = await Promise.all([
    supabase.rpc("ranking_empresa_mes", { p_mes: mesSel }),
    supabase.from("v_meses_requerimientos").select("mes"),
  ]);
  // El mes en curso siempre disponible en el selector, aunque aún no tenga datos.
  const mesesData = (mesesRes.data ?? []) as { mes: string }[];
  const meses = Array.from(
    new Set([mesActualCL(), ...mesesData.map((m) => m.mes)]),
  ).sort((a, b) => (a < b ? 1 : -1));

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {saludoPorHora()}, {primerNombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {usuario.nombre} · {usuario.rol} ·{" "}
          <span className="capitalize">{fechaHoyLarga()}</span>
        </p>
      </header>

      <InicioClient
        pendientes={(pendientesRes.data ?? []) as GestionRow[]}
        historial={(historialRes.data ?? []) as GestionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        clientes={
          (clientesRes.data ?? []) as {
            id: string;
            razon_social: string;
            grupo_id: string | null;
          }[]
        }
        cumplimiento={
          (cumplimientoRes.data ?? []) as {
            responsable_id: string | null;
            responsable: string;
            resueltos: number;
            a_tiempo: number;
            atrasados: number;
            justificados: number;
            pct_a_tiempo: number | null;
          }[]
        }
        porEmpresa={
          (porEmpresaRes.data ?? []) as {
            cliente_id: string | null;
            empresa: string;
            cliente_grupo: string | null;
            cliente_codigo: string | null;
            total: number;
            pendientes: number;
            a_tiempo: number;
            atrasados: number;
            pct_cumplimiento: number | null;
          }[]
        }
        mesEmpresas={mesSel}
        mesesEmpresas={meses}
        errorCarga={pendientesRes.error?.message ?? null}
      />
    </main>
  );
}
