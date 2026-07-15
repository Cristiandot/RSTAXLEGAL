import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { type InfoEmpresa } from "@/app/solicitud/[token]/solicitud-form";
import { PortalGrupo, type EmpresaMeta, type EmpresaCargada } from "./portal-grupo";

export const metadata = { title: "Portal de cliente — RS Tax & Legal" };

type GrupoInfo = { grupo: string; codigo: string; empresas: EmpresaMeta[] };

export default async function PortalGrupoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_grupo", { p_token: token });
  const info = data as GrupoInfo | null;

  let empresas: EmpresaCargada[] = [];
  if (info?.empresas?.length) {
    const cargas = await Promise.all(
      info.empresas.map(async (meta) => {
        const { data: inf } = await supabase.rpc("solicitud_info", {
          p_token: meta.token,
        });
        return { meta, info: inf as InfoEmpresa | null };
      }),
    );
    empresas = cargas.filter(
      (c): c is EmpresaCargada => Boolean(c.info),
    );
  }

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {!info || empresas.length === 0 ? (
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
            <h1 className="font-heading text-xl font-semibold">Link no válido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link no existe o fue desactivado. Contacta a tu ejecutivo de
              RS Tax &amp; Legal.
            </p>
          </div>
        ) : (
          <PortalGrupo grupo={info.grupo} empresas={empresas} />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Viña del Mar
        </p>
      </div>
    </main>
  );
}
