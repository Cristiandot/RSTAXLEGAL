import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { type InfoEmpresa } from "./solicitud-form";
import { PortalCliente } from "./portal";

export const metadata = { title: "Portal de solicitudes — RS Tax & Legal" };

export default async function SolicitudPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("solicitud_info", { p_token: token });

  const info = data as (Omit<InfoEmpresa, "trabajadores"> & {
    trabajadores?: InfoEmpresa["trabajadores"];
  }) | null;

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">
        {!info ? (
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
              Este link de solicitud no existe o fue desactivado. Contacta a tu
              ejecutivo de RS Tax &amp; Legal.
            </p>
          </div>
        ) : (
          <PortalCliente
            token={token}
            empresa={{ ...info, trabajadores: info.trabajadores ?? [] }}
          />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Viña del Mar · Los datos se tratan
          conforme a la Ley 21.719 y se usan solo para las gestiones laborales
          de la empresa.
        </p>
      </div>
    </main>
  );
}
