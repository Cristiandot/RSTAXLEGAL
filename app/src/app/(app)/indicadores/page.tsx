import { createClient } from "@/lib/supabase/server";
import type { IndicadoresRow } from "@/lib/previred";
import { IndicadoresClient } from "./indicadores-client";

export const metadata = { title: "Indicadores Previred — RS Tax & Legal" };

export default async function IndicadoresPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("indicadores_previred")
    .select("*")
    .order("periodo", { ascending: false });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <IndicadoresClient
        filas={(data ?? []) as IndicadoresRow[]}
        errorCarga={error?.message ?? null}
      />
    </main>
  );
}
