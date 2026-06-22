import { ShieldCheck, Info } from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RihsClient, type EmpresaOpcion } from "./rihs-client";

export const metadata = { title: "RIHS — RS Tax & Legal" };

export default async function RihsPage() {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, razon_social, rut_empresa")
    .eq("activo", true)
    .order("razon_social");

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <RihsClient empresas={(data ?? []) as EmpresaOpcion[]} />

      <Card className="card-soft mt-5">
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent text-[var(--brand-teal)]">
            <Info className="size-5" />
          </span>
          <CardTitle className="text-base">RIHS vs. RIOHS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">RIHS</strong> (este reglamento):
            entidades empleadoras con menos de 10 trabajadores. Base: Ley N° 16.744
            y D.S. N° 44. No se legaliza ante la DT, la SEREMI de Salud ni la
            mutualidad; basta entregar copia a cada trabajador (Art. 67 Ley N°
            16.744).
          </p>
          <p>
            <strong className="text-foreground">RIOHS</strong> (Art. 153 del
            Código del Trabajo): obligatorio con 10 o más trabajadores y debe
            legalizarse ante la DT y la SEREMI de Salud. Pendiente de implementar.
          </p>
        </CardContent>
      </Card>

      <Card className="card-soft mt-4">
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent text-[var(--brand-teal)]">
            <ShieldCheck className="size-5" />
          </span>
          <CardTitle className="text-base">Qué queda por completar a mano</CardTitle>
          <CardDescription>
            El generador rellena la razón social en portada, preámbulo y Artículo 1.
            Sobre el .docx descargado falta ajustar por rubro: la matriz de riesgos
            (Título 14), los EPP mínimos por tarea (Título 15) y los campos
            resaltados en amarillo (recepción del trabajador y período/contenido de
            inducción). Los RIHS por empresa se archivan en la carpeta del cliente
            (OneDrive), en <code>01-RRHH</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
