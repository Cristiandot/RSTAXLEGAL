import { createClient } from "@/lib/supabase/server";
import { MutuoClient, type EmpresaOpcion } from "./mutuo-client";

export const metadata = { title: "Mutuo — RS Tax & Legal" };

export default async function MutuoPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select(
      "id, razon_social, rut_empresa, representante_legal, domicilio, giro, comuna, ciudad, lugar_firma_contrato",
    )
    .eq("activo", true)
    .order("razon_social");

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <MutuoClient empresas={(data ?? []) as EmpresaOpcion[]} />
    </main>
  );
}
