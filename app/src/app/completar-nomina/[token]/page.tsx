import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { CompletarNominaClient, type NominaInfo } from "./completar-client";

export const metadata = { title: "Completar datos de trabajadores — RS Tax & Legal" };

/**
 * Vista pública tokenizada para que el CLIENTE (empleador) complete los datos
 * faltantes de sus trabajadores. El link se saca desde la grilla de /nominas.
 * Solo muestra los campos que faltan por trabajador (v_onboarding_completitud).
 */
export default async function CompletarNominaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("completar_nomina_info", {
    p_token: token,
  });

  if (error || !data) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-[#0B2545] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
          <Image src="/logo-oscuro.png" alt="RS Tax & Legal" width={160} height={48} className="mx-auto mb-4 h-10 w-auto" />
          <h1 className="mb-2 text-lg font-semibold">Link no válido</h1>
          <p className="text-sm text-muted-foreground">
            Este link no existe o fue desactivado. Escríbenos a{" "}
            <a href="mailto:admin@rstaxlegal.cl" className="font-medium text-[#17A2B8] underline">admin@rstaxlegal.cl</a>.
          </p>
        </div>
      </main>
    );
  }

  return <CompletarNominaClient token={token} info={data as NominaInfo} />;
}
