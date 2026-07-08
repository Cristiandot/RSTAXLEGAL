import { createClient } from "@/lib/supabase/server";
import { VacacionesTabs } from "../tabs-nav";
import { ControlClient } from "./control-client";
import type { DocumentoRow, SaldoTrabajador } from "@/lib/vacaciones-control";

export const metadata = { title: "Control Vacaciones Red Barrera — RS Tax & Legal" };

export default async function ControlVacacionesPage() {
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, razon_social, rut_empresa")
    .eq("hace_control_vacaciones", true)
    .limit(1)
    .single();

  if (!cliente) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
        <VacacionesTabs activa="control" />
        <p className="text-sm text-muted-foreground">
          No hay ningún cliente con control de vacaciones habilitado
          (clientes.hace_control_vacaciones).
        </p>
      </main>
    );
  }

  const [trabRes, saldosRes, docsRes, corrRes, asisRes, antRes] = await Promise.all([
    supabase
      .from("trabajadores")
      .select("id, nombres, apellidos, rut, cargo, sucursal, fecha_ingreso, activo")
      .eq("cliente_id", cliente.id)
      .order("sucursal")
      .order("apellidos"),
    supabase.from("vac_saldos").select("trabajador_id, periodo, dias").eq("cliente_id", cliente.id),
    supabase
      .from("vac_documentos")
      .select("*")
      .eq("cliente_id", cliente.id)
      .order("fecha_emision", { ascending: false })
      .order("numero", { ascending: false })
      .limit(600),
    supabase.from("vac_correlativos").select("tipo, proximo").eq("cliente_id", cliente.id),
    supabase
      .from("vac_asistencia")
      .select("*")
      .eq("cliente_id", cliente.id)
      .order("fecha", { ascending: false, nullsFirst: false })
      .limit(300),
    supabase
      .from("vac_anticipos")
      .select("*")
      .eq("cliente_id", cliente.id)
      .order("estado")
      .order("proximo_aniversario"),
  ]);

  const saldosPorTrab = new Map<string, Record<string, number>>();
  for (const s of saldosRes.data ?? []) {
    const m = saldosPorTrab.get(s.trabajador_id) ?? {};
    m[s.periodo] = Number(s.dias);
    saldosPorTrab.set(s.trabajador_id, m);
  }

  const trabajadores: SaldoTrabajador[] = (trabRes.data ?? []).map((t) => {
    const saldos = saldosPorTrab.get(t.id) ?? {};
    return {
      trabajadorId: t.id,
      nombre: `${t.nombres ?? ""} ${t.apellidos ?? ""}`.trim().toUpperCase(),
      rut: t.rut ?? "—",
      cargo: t.cargo,
      sucursal: t.sucursal ?? "Sin sucursal",
      fechaIngreso: t.fecha_ingreso,
      activo: t.activo ?? true,
      saldos,
      total: Object.values(saldos).reduce((a, b) => a + b, 0),
    };
  });

  const documentos: DocumentoRow[] = (docsRes.data ?? []).map((d) => ({
    id: d.id,
    tipo: d.tipo,
    correlativo: d.correlativo,
    fechaEmision: d.fecha_emision,
    trabajadorNombre: d.trabajador_nombre,
    trabajadorRut: d.trabajador_rut,
    sucursal: d.sucursal,
    fechaDesde: d.fecha_desde,
    fechaHasta: d.fecha_hasta,
    dias: d.dias === null ? null : Number(d.dias),
    desgloseTexto: (d.desglose as { texto?: string } | null)?.texto ?? null,
    saldoAnterior: d.saldo_anterior === null ? null : Number(d.saldo_anterior),
    saldoFinal: d.saldo_final === null ? null : Number(d.saldo_final),
    permisoTipo: d.permiso_tipo,
    conGoce: d.con_goce,
    unidad: d.unidad,
    cantidad: d.cantidad === null ? null : Number(d.cantidad),
    respaldo: d.respaldo,
    observacion: d.observacion,
    estado: d.estado,
    anulacionMotivo: d.anulacion_motivo,
    reemplazadoPor: d.reemplazado_por,
    pdfPath: d.pdf_path,
    pdfNombre: d.pdf_nombre,
    origen: d.origen,
  }));

  const correlativos: Record<string, number> = {};
  for (const c of corrRes.data ?? []) correlativos[c.tipo] = c.proximo;

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-10 sm:px-6">
      <VacacionesTabs activa="control" />
      <ControlClient
        cliente={cliente}
        trabajadores={trabajadores}
        documentos={documentos}
        correlativos={correlativos}
        asistencia={(asisRes.data ?? []).map((a) => ({
          id: a.id,
          trabajadorNombre: a.trabajador_nombre,
          trabajadorRut: a.trabajador_rut,
          sucursal: a.sucursal,
          fecha: a.fecha,
          tipo: a.tipo,
          cantidad: Number(a.cantidad),
          unidad: a.unidad,
          cierreNubox: a.cierre_nubox,
          convertidaA: a.convertida_a,
          observacion: a.observacion,
        }))}
        anticipos={(antRes.data ?? []).map((a) => {
          const t = trabajadores.find((x) => x.trabajadorId === a.trabajador_id);
          return {
            id: a.id,
            trabajador: t?.nombre ?? "—",
            periodo: a.periodo,
            diasAnticipados: Number(a.dias_anticipados),
            proximoAniversario: a.proximo_aniversario,
            diasASumar: a.dias_a_sumar === null ? null : Number(a.dias_a_sumar),
            estado: a.estado,
            notas: a.notas,
          };
        })}
      />
    </main>
  );
}
