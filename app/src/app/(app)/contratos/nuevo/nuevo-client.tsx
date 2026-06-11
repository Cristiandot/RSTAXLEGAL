"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Download, FileCheck2 } from "lucide-react";
import { validarRut } from "@/lib/rut";
import { crearContrato, type CrearContratoResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type EmpresaConPlantillas = {
  id: string;
  razonSocial: string;
  rut: string | null;
  representanteLegal: string | null;
  representanteLegalRut: string | null;
  domicilio: string | null;
  comuna: string | null;
  correoEmpresa: string | null;
  opciones: {
    cargo: string;
    jornadaTipo: string;
    horasSemanales: number | null;
    nacionalidad: string;
    tipoContrato: string | null;
  }[];
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const AFPS = ["AFP Capital", "AFP Cuprum", "AFP Habitat", "AFP Modelo", "AFP PlanVital", "AFP Provida", "AFP Uno"];
const ESTADOS_CIVILES = ["Soltero(a)", "Casado(a)", "Divorciado(a)", "Viudo(a)", "Conviviente civil"];

function Campo({ label, children, span2 = false }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 ${span2 ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function NuevoContratoClient({ empresas }: { empresas: EmpresaConPlantillas[] }) {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [enviando, startEnviar] = useTransition();
  const [resultado, setResultado] = useState<CrearContratoResult | null>(null);

  const empresa = empresas.find((e) => e.id === empresaId);
  const faltanDatosEmpleador = !!empresa && (!empresa.representanteLegal || !empresa.domicilio);

  const cargos = useMemo(
    () => [...new Set((empresa?.opciones ?? []).map((o) => o.cargo))],
    [empresa],
  );
  const [cargo, setCargo] = useState("");
  const cargoActual = cargo || cargos[0] || "";

  const jornadas = useMemo(
    () => [...new Set((empresa?.opciones ?? []).filter((o) => o.cargo === cargoActual).map((o) => o.jornadaTipo))],
    [empresa, cargoActual],
  );
  const [jornadaTipo, setJornadaTipo] = useState("");
  const jornadaActual = jornadaTipo || jornadas[0] || "completa";

  const [tipoNacionalidad, setTipoNacionalidad] = useState<"chilena" | "extranjera">("chilena");
  const [paisExtranjero, setPaisExtranjero] = useState("");
  const esExtranjero = tipoNacionalidad === "extranjera";
  const nacionalidad = esExtranjero ? paisExtranjero.trim() || "Extranjera" : "Chilena";

  const [gratifTipo, setGratifTipo] = useState("25");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!empresa) return;
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const n = (k: string) => Number(fd.get(k) ?? 0) || 0;
    const rutProvisorio = fd.get("rut_provisorio") === "on";
    const rut = s("rut");

    if (!rutProvisorio && !validarRut(rut)) {
      toast.error("El RUT del trabajador no es válido. Si aún no tiene RUT definitivo, marca 'RUT provisorio / en trámite'.");
      return;
    }

    startEnviar(async () => {
      const res = await crearContrato({
        clienteId: empresa.id,
        empleador: {
          representanteLegal: s("emp_rep_legal"),
          representanteLegalRut: s("emp_rep_rut"),
          domicilio: s("emp_domicilio"),
          comuna: s("emp_comuna"),
          correoEmpresa: s("emp_correo"),
        },
        trabajador: {
          nombres: s("nombres"),
          apellidos: s("apellidos"),
          rut,
          rutProvisorio,
          nacionalidad,
          direccion: s("direccion"),
          comuna: s("comuna"),
          fechaNacimiento: s("fecha_nacimiento") || null,
          estadoCivil: s("estado_civil"),
          correo: s("correo"),
          fono: s("fono"),
          afp: s("afp"),
          salud: s("salud") === "Isapre" ? s("isapre_nombre") || "Isapre" : "Fonasa",
          banco: "",
          tipoCuenta: "",
          numeroCuenta: "",
        },
        contrato: {
          cargo: cargoActual,
          tipoContrato: s("tipo_contrato") as "indefinido" | "plazo_fijo",
          fechaInicio: s("fecha_inicio"),
          fechaVencimiento: s("fecha_vencimiento") || null,
          jornadaTipo: jornadaActual as "completa" | "parcial",
          horasSemanales: jornadaActual === "parcial" ? n("horas_semanales") || null : null,
          lugarTrabajo: "",
          sueldoBase: n("sueldo_base"),
          movilizacion: n("movilizacion"),
          colacion: n("colacion"),
          gratificacion:
            gratifTipo === "sin"
              ? "Sin gratificación"
              : gratifTipo === "tope"
                ? "Tope legal: 4,75 IMM anual, prorrateado mensual"
                : gratifTipo === "manual"
                  ? `Manual: $${n("gratificacion_monto").toLocaleString("es-CL")} mensuales`
                  : "25% de lo devengado, con tope de 4,75 IMM anual (Art. 50 CT)",
          gratificacionTipo: gratifTipo,
          gratificacionMonto: gratifTipo === "manual" ? n("gratificacion_monto") : null,
          clausulasAdicionales: s("clausulas_adicionales"),
          observaciones: s("observaciones"),
        },
      });
      if (res.ok) {
        setResultado(res);
        toast.success("Contrato generado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al crear el contrato");
      }
    });
  }

  if (empresas.length === 0) {
    return (
      <Card className="card-soft mt-4 border-transparent">
        <CardHeader>
          <CardTitle className="font-heading">Sin plantillas disponibles</CardTitle>
          <CardDescription>
            Ninguna empresa tiene plantillas de contrato aprobadas todavía.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (resultado?.ok) {
    return (
      <Card className="card-soft mt-4 border-transparent">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <FileCheck2 className="size-6" />
          </span>
          <CardTitle className="font-heading">Contrato generado</CardTitle>
          <CardDescription>
            El documento quedó guardado en el sistema (estado: generado) y listo
            para revisión antes de enviarlo al cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap justify-center gap-2">
          {resultado.downloadUrl ? (
            <Button render={<a href={resultado.downloadUrl} />}>
              <Download className="size-4" />
              Descargar {resultado.nombreArchivo}
            </Button>
          ) : null}
          <Button variant="outline" render={<Link href="/contratos" />}>
            Ir al listado
          </Button>
          <Button variant="outline" onClick={() => setResultado(null)}>
            Crear otro
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/contratos" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Contrato nuevo</h1>
          <p className="text-sm text-muted-foreground">
            Ficha de incorporación: el sistema genera el contrato desde la plantilla aprobada.
          </p>
        </div>
      </div>

      {/* EMPRESA */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Empresa (empleador)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Campo label="Empresa" span2>
            <select className={selectCls} value={empresaId} onChange={(e) => { setEmpresaId(e.target.value); setCargo(""); setJornadaTipo(""); }}>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.razonSocial} {e.rut ? `· ${e.rut}` : ""}
                </option>
              ))}
            </select>
          </Campo>
          {faltanDatosEmpleador ? (
            <>
              <p className="text-xs text-amber-700 sm:col-span-2">
                Faltan datos del empleador para el contrato — se guardarán en la ficha de la empresa:
              </p>
              <Campo label="Representante legal">
                <Input name="emp_rep_legal" defaultValue={empresa?.representanteLegal ?? ""} required={!empresa?.representanteLegal} />
              </Campo>
              <Campo label="RUT representante legal">
                <Input name="emp_rep_rut" defaultValue={empresa?.representanteLegalRut ?? ""} />
              </Campo>
              <Campo label="Domicilio empresa">
                <Input name="emp_domicilio" defaultValue={empresa?.domicilio ?? ""} required={!empresa?.domicilio} />
              </Campo>
              <Campo label="Comuna">
                <Input name="emp_comuna" defaultValue={empresa?.comuna ?? ""} />
              </Campo>
              <Campo label="Correo empresa" span2>
                <Input name="emp_correo" type="email" defaultValue={empresa?.correoEmpresa ?? ""} />
              </Campo>
            </>
          ) : (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {empresa?.representanteLegal} · {empresa?.domicilio}
              <input type="hidden" name="emp_rep_legal" value="" />
              <input type="hidden" name="emp_rep_rut" value="" />
              <input type="hidden" name="emp_domicilio" value="" />
              <input type="hidden" name="emp_comuna" value="" />
              <input type="hidden" name="emp_correo" value="" />
            </p>
          )}
        </CardContent>
      </Card>

      {/* TRABAJADOR */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Trabajador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombres"><Input name="nombres" required /></Campo>
          <Campo label="Apellidos"><Input name="apellidos" required /></Campo>
          <Campo label="RUT">
            <Input name="rut" placeholder="12.345.678-9" />
          </Campo>
          <div className="flex items-end gap-2 pb-1.5">
            <Checkbox id="rut_provisorio" name="rut_provisorio" />
            <Label htmlFor="rut_provisorio" className="text-xs">RUT provisorio / en trámite (extranjero)</Label>
          </div>
          <Campo label="Nacionalidad">
            <select
              className={selectCls}
              value={tipoNacionalidad}
              onChange={(e) => setTipoNacionalidad(e.target.value as "chilena" | "extranjera")}
            >
              <option value="chilena">Chilena</option>
              <option value="extranjera">Extranjera</option>
            </select>
            {esExtranjero ? (
              <>
                <Input
                  value={paisExtranjero}
                  onChange={(e) => setPaisExtranjero(e.target.value)}
                  placeholder="País (ej. Venezuela, Perú, Colombia…)"
                  required
                />
                <p className="text-xs text-sky-700">
                  Se usará la plantilla con las cláusulas especiales de
                  extranjero (vigencia sujeta a visa/permiso, Ley 18.156,
                  impuesto 13,5 UTM).
                </p>
              </>
            ) : null}
          </Campo>
          <Campo label="Fecha de nacimiento"><Input name="fecha_nacimiento" type="date" /></Campo>
          <Campo label="Estado civil">
            <select name="estado_civil" className={selectCls} defaultValue="Soltero(a)">
              {ESTADOS_CIVILES.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Campo>
          <Campo label="Teléfono"><Input name="fono" inputMode="tel" /></Campo>
          <Campo label="Dirección"><Input name="direccion" required /></Campo>
          <Campo label="Comuna"><Input name="comuna" /></Campo>
          <Campo label="Correo electrónico" span2><Input name="correo" type="email" /></Campo>
          <Campo label="AFP">
            <select name="afp" className={selectCls} defaultValue="AFP Modelo">
              {AFPS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo label="Salud">
            <div className="flex gap-2">
              <select name="salud" className={`${selectCls} flex-1`} defaultValue="Fonasa">
                <option>Fonasa</option>
                <option>Isapre</option>
              </select>
              <Input name="isapre_nombre" placeholder="Nombre Isapre (si aplica)" className="flex-1" />
            </div>
          </Campo>
        </CardContent>
      </Card>

      {/* CONTRATO */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Contrato</CardTitle>
          <CardDescription>
            La plantilla se elige sola según cargo, jornada, nacionalidad y tipo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Campo label="Cargo">
            <select className={selectCls} value={cargoActual} onChange={(e) => { setCargo(e.target.value); setJornadaTipo(""); }}>
              {cargos.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo label="Jornada">
            <select className={selectCls} value={jornadaActual} onChange={(e) => setJornadaTipo(e.target.value)}>
              {jornadas.map((j) => (
                <option key={j} value={j}>{j === "completa" ? "Completa (full time)" : "Parcial (part time)"}</option>
              ))}
            </select>
          </Campo>
          {jornadaActual === "parcial" ? (
            <Campo label="Horas semanales (part time)">
              <Input name="horas_semanales" type="number" min={1} max={28} placeholder="ej. 21" />
            </Campo>
          ) : null}
          <Campo label="Tipo de contrato">
            <select name="tipo_contrato" className={selectCls} defaultValue="plazo_fijo">
              <option value="plazo_fijo">Plazo fijo</option>
              <option value="indefinido">Indefinido</option>
            </select>
          </Campo>
          <Campo label="Fecha de inicio"><Input name="fecha_inicio" type="date" required /></Campo>
          <Campo label="Vencimiento (si plazo fijo)"><Input name="fecha_vencimiento" type="date" /></Campo>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Lugar de trabajo: el domicilio de la empresa ({empresa?.domicilio ?? "—"}).
          </p>
        </CardContent>
      </Card>

      {/* REMUNERACIÓN */}
      <Card className="card-soft border-transparent">
        <CardHeader>
          <CardTitle className="text-base">Remuneración</CardTitle>
          <CardDescription>
            La cláusula de gratificación se redacta según la opción elegida. La
            asignación de caja va fija en la plantilla.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Campo label="Sueldo base ($)"><Input name="sueldo_base" type="number" min={1} required /></Campo>
          <Campo label="Movilización ($)"><Input name="movilizacion" type="number" min={0} defaultValue={0} /></Campo>
          <Campo label="Colación ($)"><Input name="colacion" type="number" min={0} defaultValue={0} /></Campo>
          <Campo label="Gratificación legal (Art. 50 CT)">
            <select
              name="gratificacion_tipo"
              className={selectCls}
              value={gratifTipo}
              onChange={(e) => setGratifTipo(e.target.value)}
            >
              <option value="sin">Sin gratificación</option>
              <option value="25">25% (con tope legal — la más común)</option>
              <option value="tope">Tope (4,75 IMM ÷ 12 mensual)</option>
              <option value="manual">Manual (monto fijo)</option>
            </select>
          </Campo>
          {gratifTipo === "manual" ? (
            <Campo label="Monto gratificación mensual ($)">
              <Input name="gratificacion_monto" type="number" min={1} required placeholder="ej. 150000" />
            </Campo>
          ) : null}
          <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 sm:col-span-3">
            <strong>Sueldos mínimos de referencia</strong> (IMM $539.000 por 42
            hrs; proporcional según horas): <strong>42 hrs → $539.000</strong> ·{" "}
            <strong>30 hrs → $385.000</strong> ·{" "}
            <strong>20 hrs → $256.667</strong>.
          </div>
          <Campo label="Cláusulas adicionales (opcional — van al contrato, antes de las firmas)" span2>
            <Textarea
              name="clausulas_adicionales"
              rows={2}
              placeholder="Ej.: El trabajador realizará además el inventario diario de la tienda al cierre de su turno…"
            />
          </Campo>
          <Campo label="Observaciones" span2>
            <Textarea
              name="observaciones"
              rows={3}
              placeholder="Si el contrato lleva asignación de pérdida de caja, indícalo aquí (monto). Si lleva bono o comisión, explica cómo se obtiene: porcentaje, metas o tabla de comisiones, si es fijo o variable, etc…"
            />
          </Campo>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" render={<Link href="/contratos" />}>
          Cancelar
        </Button>
        <Button type="submit" disabled={enviando}>
          {enviando ? "Generando…" : "Generar contrato"}
        </Button>
      </div>
    </form>
  );
}
