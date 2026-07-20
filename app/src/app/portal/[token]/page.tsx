import Image from "next/image";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { type InfoEmpresa } from "@/app/solicitud/[token]/solicitud-form";
import { PortalGrupo, type EmpresaMeta, type EmpresaCargada } from "./portal-grupo";
import { PinGate } from "./pin-gate";

export const metadata = { title: "Portal de cliente — RS Tax & Legal" };

type GrupoInfo = { grupo: string; codigo: string; empresas: EmpresaMeta[] };

export default async function PortalGrupoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: seg } = await params;
  const supabase = await createClient();

  const loadGrupo = async (tok: string): Promise<GrupoInfo | null> => {
    const { data } = await supabase.rpc("portal_grupo", { p_token: tok });
    const g = data as GrupoInfo | null;
    return g?.empresas?.length ? g : null;
  };

  // 1) Sesión ya desbloqueada (cookie con el token interno para este slug).
  const cookieStore = await cookies();
  const sessTok = cookieStore.get(`rstl_portal_${seg}`)?.value ?? null;
  let grupoToken: string | null = null;
  let info: GrupoInfo | null = null;

  if (sessTok) {
    info = await loadGrupo(sessTok);
    if (info) grupoToken = sessTok;
  }
  // 2) El segmento es un token crudo (link interno sin PIN).
  if (!info) {
    info = await loadGrupo(seg);
    if (info) grupoToken = seg;
  }
  // 3) Es un slug (o inválido) → pedir PIN, sin revelar datos.
  if (!info || !grupoToken) {
    return (
      <main className="min-h-svh bg-background px-4 py-8">
        <div className="mx-auto max-w-md">
          <PinGate slug={seg} />
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Rodríguez Samith Tax &amp; Legal · Viña del Mar
          </p>
        </div>
      </main>
    );
  }

  // Portal desbloqueado: cargar la info de cada empresa del grupo.
  const cargas = await Promise.all(
    info.empresas.map(async (meta) => {
      const { data: inf } = await supabase.rpc("solicitud_info", {
        p_token: meta.token,
      });
      return { meta, info: inf as InfoEmpresa | null };
    }),
  );
  const empresas = cargas.filter((c): c is EmpresaCargada => Boolean(c.info));

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {empresas.length === 0 ? (
          <div className="card-soft rounded-xl bg-card p-8 text-center">
            <div className="mb-4 flex justify-center">
              <Image
                src="/logo-claro.png"
                alt="Rodríguez Samith Tax & Legal"
                width={220}
                height={62}
                priority
                className="h-auto w-[200px]"
              />
            </div>
            <h1 className="font-heading text-xl font-semibold">Sin empresas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este grupo no tiene empresas activas. Contacta a tu ejecutivo de
              RS Tax &amp; Legal.
            </p>
          </div>
        ) : (
          <PortalGrupo
            grupo={info.grupo}
            empresas={empresas}
            slug={grupoToken !== seg ? seg : null}
            grupoToken={grupoToken}
          />
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Viña del Mar
        </p>
      </div>
    </main>
  );
}
