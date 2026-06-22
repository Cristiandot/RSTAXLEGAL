import { ShieldCheck, Info, Download, ClipboardList, HardHat } from "lucide-react";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Formularios tipo de seguridad: archivos estáticos en /public, para imprimir
 * y completar a mano. */
const DOCS_SEGURIDAD = [
  {
    icon: ClipboardList,
    titulo: "Registro de entrega del Reglamento Interno",
    descripcion:
      "Constancia de que cada trabajador recibió copia del RIHS (Art. 67 Ley N° 16.744). Tabla para firmar a mano.",
    href: "/documentos-seguridad/registro-entrega-reglamento-interno.docx",
    descarga: "Registro entrega Reglamento Interno (RIHS).docx",
  },
  {
    icon: HardHat,
    titulo: "Registro de entrega de EPP",
    descripcion:
      "Constancia de entrega de equipos de protección personal (Art. 68 Ley N° 16.744). Espacios en blanco para completar a mano.",
    href: "/documentos-seguridad/registro-entrega-epp.docx",
    descarga: "Registro entrega de EPP.docx",
  },
] as const;
import {
  RihsClient,
  type EmpresaOpcion,
  type ReglamentoRow,
} from "./rihs-client";

export const metadata = { title: "RIHS — RS Tax & Legal" };

type ReglamentoRaw = {
  id: string;
  tipo: string;
  razon_social: string;
  documento_path: string;
  nombre_original: string | null;
  created_at: string;
  clientes: { razon_social: string } | null;
  usuarios: { nombre: string } | null;
};

export default async function RihsPage() {
  await getUsuarioActual(); // exige sesión (redirige a /login si no hay)
  const supabase = await createClient();

  const [empresasRes, docsRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, razon_social, rut_empresa")
      .eq("activo", true)
      .order("razon_social"),
    supabase
      .from("reglamentos")
      .select(
        "id, tipo, razon_social, documento_path, nombre_original, created_at, clientes(razon_social), usuarios(nombre)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const documentos: ReglamentoRow[] = ((docsRes.data ?? []) as unknown as ReglamentoRaw[]).map(
    (d) => ({
      id: d.id,
      tipo: d.tipo,
      razonSocial: d.razon_social,
      documentoPath: d.documento_path,
      nombreOriginal: d.nombre_original,
      createdAt: d.created_at,
      cliente: d.clientes?.razon_social ?? null,
      autor: d.usuarios?.nombre ?? null,
    }),
  );

  return (
    <main className="mx-auto max-w-[1100px] px-4 pb-10 sm:px-6">
      <RihsClient
        empresas={(empresasRes.data ?? []) as EmpresaOpcion[]}
        documentos={documentos}
      />

      <section className="mt-6">
        <h2 className="mb-1 font-heading text-lg font-semibold tracking-tight">
          Documentos tipo de seguridad
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Formularios en blanco para descargar, imprimir y completar a mano con los
          datos del trabajador.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {DOCS_SEGURIDAD.map((d) => (
            <Card key={d.href} className="card-soft flex flex-col">
              <CardHeader className="flex-1">
                <span className="mb-1 flex size-10 items-center justify-center rounded-xl bg-accent text-[var(--brand-teal)]">
                  <d.icon className="size-5" />
                </span>
                <CardTitle className="text-base">{d.titulo}</CardTitle>
                <CardDescription>{d.descripcion}</CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href={d.href}
                  download={d.descarga}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download className="size-3.5" />
                  Descargar
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

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
            inducción). Los RIHS por empresa se archivan también en la carpeta del
            cliente (OneDrive), en <code>01-RRHH</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
