import { createClient } from "@/lib/supabase/server";
import { NuevoContratoClient, type EmpresaConPlantillas } from "./nuevo-client";

export const metadata = { title: "Contrato nuevo — RS Tax & Legal" };

export default async function NuevoContratoPage() {
  const supabase = await createClient();

  // Empresas con plantillas de contrato aprobadas, y la matriz disponible
  const { data: plantillas } = await supabase
    .from("plantillas_contrato")
    .select(
      "cliente_id, cargo, jornada_tipo, horas_semanales, nacionalidad, tipo_contrato, clientes(id, razon_social, rut_empresa, representante_legal, representante_legal_rut, domicilio, comuna, correo_empresa)",
    )
    .eq("tipo_documento", "contrato")
    .eq("aprobada", true)
    .eq("activo", true)
    .not("cliente_id", "is", null);

  const porEmpresa = new Map<string, EmpresaConPlantillas>();
  for (const p of plantillas ?? []) {
    const cli = p.clientes as unknown as {
      id: string;
      razon_social: string;
      rut_empresa: string | null;
      representante_legal: string | null;
      representante_legal_rut: string | null;
      domicilio: string | null;
      comuna: string | null;
      correo_empresa: string | null;
    } | null;
    if (!cli) continue;
    if (!porEmpresa.has(cli.id)) {
      porEmpresa.set(cli.id, {
        id: cli.id,
        razonSocial: cli.razon_social,
        rut: cli.rut_empresa,
        representanteLegal: cli.representante_legal,
        representanteLegalRut: cli.representante_legal_rut,
        domicilio: cli.domicilio,
        comuna: cli.comuna,
        correoEmpresa: cli.correo_empresa,
        opciones: [],
      });
    }
    porEmpresa.get(cli.id)!.opciones.push({
      cargo: p.cargo ?? "",
      jornadaTipo: p.jornada_tipo ?? "",
      horasSemanales: p.horas_semanales !== null ? Number(p.horas_semanales) : null,
      nacionalidad: p.nacionalidad,
      tipoContrato: p.tipo_contrato,
    });
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
      <NuevoContratoClient empresas={[...porEmpresa.values()]} />
    </main>
  );
}
