import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { BienvenidaClient } from "./bienvenida-client";

export const metadata = { title: "Bienvenido — RS Tax & Legal" };

type Info = {
  nombre: string;
  mensaje: string | null;
  link_pago: string | null;
  link_pago_nombre: string | null;
  estado: string;
  empresa: { razon_social: string | null; rut_empresa: string | null } | null;
};

/**
 * Onboarding inicial de clientes nuevos (vista pública tokenizada, distinta
 * del panel interno y del portal /solicitud). El equipo genera el link desde
 * Onboarding → Invitaciones.
 */
export default async function BienvenidaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("onboarding_invitacion_info", {
    p_token: token,
  });

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0B2545] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <Image
            src="/logo-oscuro.png"
            alt="RS Tax & Legal"
            width={160}
            height={48}
            className="mx-auto mb-4 h-10 w-auto"
          />
          <h1 className="mb-2 text-lg font-semibold">Link no válido</h1>
          <p className="text-sm text-muted-foreground">
            Este link de bienvenida no existe o fue reemplazado. Escríbenos a{" "}
            <a href="mailto:admin@rstaxlegal.cl" className="font-medium text-[#17A2B8] underline">
              admin@rstaxlegal.cl
            </a>{" "}
            y te enviamos uno nuevo.
          </p>
        </div>
      </main>
    );
  }

  const info = data as Info;
  return <BienvenidaClient token={token} info={info} />;
}
