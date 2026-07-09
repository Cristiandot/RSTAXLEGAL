import Link from "next/link";
import {
  Users,
  Wallet,
  FileText,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { modulosVisibles, type Modulo } from "@/lib/modules";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import GestionesFelipe from "@/components/gestiones-felipe";

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

function ModuloCard({ m }: { m: Modulo }) {
  const activo = m.estado === "activo";
  const Icon = m.icon;

  const inner = (
    <Card
      className={`card-soft h-full border-transparent transition ${
        activo ? "hover:-translate-y-0.5" : "opacity-70"
      }`}
    >
      <CardHeader>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span
            className={`flex size-10 items-center justify-center rounded-xl ${
              activo
                ? "bg-accent text-[var(--brand-teal)]"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="size-5" />
          </span>
          {!activo ? (
            <Badge variant="secondary" className="font-normal">
              {m.estado === "desarrollo" ? "En desarrollo" : "Próximamente"}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{m.label}</CardTitle>
        <CardDescription>{m.descripcion}</CardDescription>
      </CardHeader>
    </Card>
  );

  if (!activo) return inner;
  return (
    <Link href={m.href} className="block">
      {inner}
    </Link>
  );
}

export default async function HomePage() {
  const usuario = await getUsuarioActual();
  const secciones = modulosVisibles(usuario.rol);
  const primerNombre = usuario.nombre.split(" ")[0];

  const [activos, previred, f29, contab] = await Promise.all([
    contar({ activo: true }),
    contar({ activo: true, hace_liquidaciones: true }),
    contar({ activo: true, hace_f29: true }),
    contar({ activo: true, hace_contabilidad_completa: true }),
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

      <div className="space-y-7">
        {secciones.map((seccion) => (
          <section key={seccion.seccion}>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {seccion.seccion}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {seccion.modulos.map((m) => (
                <ModuloCard key={m.key} m={m} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <GestionesFelipe />
    </main>
  );
}
