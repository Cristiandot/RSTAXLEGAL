import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";

export const metadata = { title: "Portal de solicitudes — RS Tax & Legal" };

export default async function SolicitudPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("solicitud_info", { p_token: token });

  const info = data as {
    razon_social: string;
    opciones: { cargo: string; jornada: string; horas: number | null; tipo: string | null }[];
  } | null;

  return (
    <main className="min-h-svh bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-center">
          <Image
            src="/logo-claro.png"
            alt="Rodríguez Samith Tax & Legal"
            width={240}
            height={68}
            priority
            className="h-auto w-[240px]"
          />
        </div>

        {!info ? (
          <div className="card-soft rounded-xl bg-card p-8 text-center">
            <h1 className="font-heading text-xl font-semibold">Link no válido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Este link de solicitud no existe o fue desactivado. Contacta a tu
              ejecutivo de RS Tax &amp; Legal.
            </p>
          </div>
        ) : (
          <SolicitudForm
            token={token}
            empresa={info as InfoEmpresa}
          />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Rodríguez Samith Tax &amp; Legal · Viña del Mar · Los datos se tratan
          conforme a la Ley 21.719 y se usan solo para elaborar el contrato.
        </p>
      </div>
    </main>
  );
}
