import { Info } from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CasaParticularClient,
  type EmpleadorOpcion,
  type TrabajadoraOpcion,
  type ContratoCasaRow,
} from "./casa-particular-client";

export const metadata = { title: "Casa Particular — RS Tax & Legal" };

type ContratoRaw = {
  id: string;
  tipo_contrato: string;
  empleador_nombre: string;
  trabajadora_nombre: string;
  documento_path: string;
  nombre_original: string | null;
  created_at: string;
  usuarios: { nombre: string } | null;
};

export default async function CasaParticularPage() {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)
  const supabase = await createClient();

  const [empresasRes, trabRes, docsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa, domicilio, comuna, ciudad, lugar_firma_contrato")
      .eq("activo", true)
      .order("razon_social"),
    supabase
      .from("trabajadores")
      .select(
        "id, cliente_id, nombres, apellido_paterno, apellido_materno, rut, fecha_nacimiento, direccion, comuna, nacionalidad, afp, salud",
      )
      .eq("activo", true),
    supabase
      .from("casa_particular_contratos")
      .select(
        "id, tipo_contrato, empleador_nombre, trabajadora_nombre, documento_path, nombre_original, created_at, usuarios(nombre)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const documentos: ContratoCasaRow[] = (
    (docsRes.data ?? []) as unknown as ContratoRaw[]
  ).map((d) => ({
    id: d.id,
    tipoContrato: d.tipo_contrato,
    empleador: d.empleador_nombre,
    trabajadora: d.trabajadora_nombre,
    documentoPath: d.documento_path,
    nombreOriginal: d.nombre_original,
    createdAt: d.created_at,
    autor: d.usuarios?.nombre ?? null,
  }));

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <CasaParticularClient
        empleadores={(empresasRes.data ?? []) as EmpleadorOpcion[]}
        trabajadores={(trabRes.data ?? []) as TrabajadoraOpcion[]}
        documentos={documentos}
      />

      <Card className="card-soft mt-5">
        <CardHeader>
          <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent text-[var(--brand-teal)]">
            <Info className="size-5" />
          </span>
          <CardTitle className="text-base">Sobre este contrato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Contrato de <strong className="text-foreground">trabajador de casa
            particular puertas afuera</strong>. El empleador es una persona natural
            (el dueño de casa), no una empresa: firma por sí mismo, sin representante
            legal.
          </p>
          <p>
            Incluye la cotización del 4,11% para la indemnización a todo evento (tope
            11 años), el seguro de la Ley N° 16.744, el seguro de cesantía de la Ley N°
            19.728 y la prohibición de exigir uniforme en espacios públicos. El sueldo
            se pacta líquido por día efectivamente trabajado.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
