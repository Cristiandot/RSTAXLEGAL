import {
  Users,
  Wallet,
  FileText,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GestionRow } from "@/lib/gestiones";
import type { UsuarioOpcion } from "@/lib/ciclos";
import { Card, CardHeader } from "@/components/ui/card";
import { InicioClient } from "./inicio-client";

export const metadata = { title: "Inicio y requerimientos — RS Tax & Legal" };

function saludoPorHora(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Buenos días";
  if (hora < 19) return "Buenas tardes";
  return "Buenas noches";
}

async function contar(
  filtros: Record<string, unknown>,
): Promise<number | null> {
  const supabase = await createClient();
  let q = supabase.from("clientes").select("*", { count: "exact", head: true });
  for (const [col, val] of Object.entries(filtros)) {
    q = q.eq(col, val);
  }
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}

function StatCard({
  icon: Icon,
  valor,
  etiqueta,
  clase,
}: {
  icon: LucideIcon;
  valor: number | null;
  etiqueta: string;
  clase: string;
}) {
  return (
    <Card className={`stat-card card-soft ${clase}`}>
      <CardHeader>
        <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
          <Icon className="size-5" />
        </span>
        <div className="mt-3">
          <div className="text-3xl font-semibold leading-none">
            {valor === null ? "—" : valor}
          </div>
          <div className="mt-1.5 text-sm text-white/80">{etiqueta}</div>
        </div>
      </CardHeader>
    </Card>
  );
}

export default async function HomePage() {
  const usuario = await getUsuarioActual();
  const primerNombre = usuario.nombre.split(" ")[0];
  const supabase = await createClient();

  const [activos, previred, f29, contab, pendientesRes, historialRes, usuariosRes] =
    await Promise.all([
      contar({ activo: true }),
      contar({ activo: true, hace_liquidaciones: true }),
      contar({ activo: true, hace_f29: true }),
      contar({ activo: true, hace_contabilidad_completa: true }),
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
      <header className="mb-7">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {saludoPorHora()}, {primerNombre}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {usuario.nombre} · {usuario.rol} · {usuario.correo}
        </p>
      </header>

      <section className="mb-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          valor={activos}
          etiqueta="Clientes activos"
          clase="stat-navy"
        />
        <StatCard
          icon={Wallet}
          valor={previred}
          etiqueta="En ciclo Previred"
          clase="stat-teal"
        />
        <StatCard
          icon={FileText}
          valor={f29}
          etiqueta="En ciclo F29"
          clase="stat-cyan"
        />
        <StatCard
          icon={ClipboardCheck}
          valor={contab}
          etiqueta="Contabilidad completa"
          clase="stat-slate"
        />
      </section>

      <InicioClient
        pendientes={(pendientesRes.data ?? []) as GestionRow[]}
        historial={(historialRes.data ?? []) as GestionRow[]}
        usuarios={(usuariosRes.data ?? []) as UsuarioOpcion[]}
        errorCarga={pendientesRes.error?.message ?? null}
      />
    </main>
  );
}
