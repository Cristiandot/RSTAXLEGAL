"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Home, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  generarContratoCasaParticular,
  urlContratoCasa,
  type GenerarCasaParticularInput,
} from "./actions";

export type EmpleadorOpcion = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  domicilio: string | null;
  comuna: string | null;
  ciudad: string | null;
  lugar_firma_contrato: string | null;
};

export type TrabajadoraOpcion = {
  id: string;
  cliente_id: string | null;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  rut: string | null;
  fecha_nacimiento: string | null;
  direccion: string | null;
  comuna: string | null;
  nacionalidad: string | null;
  afp: string | null;
  salud: string | null;
};

export type ContratoCasaRow = {
  id: string;
  tipoContrato: string;
  empleador: string;
  trabajadora: string;
  documentoPath: string;
  nombreOriginal: string | null;
  createdAt: string;
  autor: string | null;
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CasaParticularClient({
  empleadores,
  trabajadores,
  documentos,
}: {
  empleadores: EmpleadorOpcion[];
  trabajadores: TrabajadoraOpcion[];
  documentos: ContratoCasaRow[];
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscarEmp, setBuscarEmp] = useState("");

  // Empleador (persona natural)
  const [empNombre, setEmpNombre] = useState("");
  const [empRut, setEmpRut] = useState("");
  const [empDomicilio, setEmpDomicilio] = useState("");

  // Trabajadora
  const [trabNombre, setTrabNombre] = useState("");
  const [trabRut, setTrabRut] = useState("");
  const [fechaNac, setFechaNac] = useState("");
  const [direccion, setDireccion] = useState("");
  const [comuna, setComuna] = useState("");
  const [nacionalidad, setNacionalidad] = useState("chilena");
  const [afp, setAfp] = useState("");
  const [salud, setSalud] = useState("");

  // Contrato
  const [tipoContrato, setTipoContrato] =
    useState<GenerarCasaParticularInput["tipoContrato"]>("plazo_fijo");
  const [ciudadFirma, setCiudadFirma] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaTermino, setFechaTermino] = useState("");
  const [sueldoDia, setSueldoDia] = useState("");
  const [movilDia, setMovilDia] = useState("");
  const [horas, setHoras] = useState("");
  const [distribucion, setDistribucion] = useState("");
  const [funciones, setFunciones] = useState("");
  const [clausulas, setClausulas] = useState("");

  const [generando, startGenerar] = useTransition();
  const [descargando, setDescargando] = useState<string | null>(null);

  const empresasFiltradas = useMemo(() => {
    const q = buscarEmp.trim().toLowerCase();
    const base = q
      ? empleadores.filter((e) =>
          `${e.razon_social} ${e.rut_empresa ?? ""}`.toLowerCase().includes(q),
        )
      : empleadores;
    return base.slice(0, 30);
  }, [empleadores, buscarEmp]);

  const trabDelEmpleador = useMemo(
    () => (clienteId ? trabajadores.filter((t) => t.cliente_id === clienteId) : []),
    [trabajadores, clienteId],
  );

  function fillEmpleador(id: string) {
    const e = empleadores.find((x) => x.id === id);
    if (!e) return;
    setClienteId(e.id);
    setEmpNombre(e.razon_social ?? "");
    setEmpRut(e.rut_empresa ?? "");
    setEmpDomicilio(e.domicilio ?? "");
    if (!ciudadFirma) {
      setCiudadFirma(e.lugar_firma_contrato || e.ciudad || e.comuna || "");
    }
    toast.success(`${e.razon_social} cargado como empleador`);
  }

  function fillTrabajadora(id: string) {
    const t = trabDelEmpleador.find((x) => x.id === id);
    if (!t) return;
    const nombre = [t.nombres, t.apellido_paterno, t.apellido_materno]
      .filter(Boolean)
      .join(" ");
    setTrabNombre(nombre);
    setTrabRut(t.rut ?? "");
    setFechaNac(t.fecha_nacimiento ?? "");
    setDireccion(t.direccion ?? "");
    setComuna(t.comuna ?? "");
    setNacionalidad(t.nacionalidad ?? "chilena");
    setAfp(t.afp ?? "");
    setSalud(t.salud ?? "");
    toast.success(`${nombre} cargada`);
  }

  function descargar(base64: string, filename: string) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generar() {
    if (!empNombre.trim()) return toast.error("Indica el nombre del empleador");
    if (!trabNombre.trim()) return toast.error("Indica el nombre de la trabajadora");
    if (!fechaInicio) return toast.error("Indica la fecha de inicio");
    if (!(Number(sueldoDia) > 0)) return toast.error("Indica el sueldo por día");
    if (tipoContrato === "plazo_fijo" && !fechaTermino) {
      return toast.error("En plazo fijo indica la fecha de término");
    }
    startGenerar(async () => {
      const res = await generarContratoCasaParticular({
        clienteId,
        tipoContrato,
        empleadorNombre: empNombre,
        empleadorRut: empRut,
        empleadorDomicilio: empDomicilio,
        trabajadoraNombre: trabNombre,
        trabajadoraRut: trabRut,
        fechaNacimiento: fechaNac,
        direccion,
        comuna,
        nacionalidad,
        afp,
        salud,
        funciones,
        ciudadFirma,
        horasSemanales: horas,
        distribucionJornada: distribucion,
        sueldoDia: Number(sueldoDia),
        movilizacionDia: Number(movilDia) || 0,
        fechaInicio,
        fechaTermino: tipoContrato === "plazo_fijo" ? fechaTermino : "",
        clausulasAdicionales: clausulas,
      });
      if (res.ok && res.base64 && res.filename) {
        descargar(res.base64, res.filename);
        toast.success("Contrato generado y guardado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al generar");
      }
    });
  }

  async function descargarDoc(d: ContratoCasaRow) {
    setDescargando(d.id);
    const res = await urlContratoCasa(
      d.documentoPath,
      d.nombreOriginal ?? "Contrato Casa Particular.docx",
    );
    setDescargando(null);
    if (res.ok && res.url) window.open(res.url, "_blank");
    else toast.error(res.error ?? "No se pudo descargar");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Casa Particular — Contrato puertas afuera
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Genera el contrato de trabajador de casa particular puertas afuera desde la
          plantilla tipo (plazo fijo o indefinido). Elige el empleador de la cartera o
          escribe los datos, completa la trabajadora y las condiciones, y descarga el
          .docx. Cada documento queda registrado abajo.
        </p>
      </div>

      {/* EMPLEADOR */}
      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">
          Empleador (persona natural)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Buscar en la cartera (activas) para autorrellenar</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Nombre o RUT…"
                value={buscarEmp}
                onChange={(e) => setBuscarEmp(e.target.value)}
                className="sm:flex-1"
              />
              <select
                className={`${selectCls} sm:w-80`}
                value=""
                onChange={(e) => e.target.value && fillEmpleador(e.target.value)}
                aria-label="Empleador de la cartera"
              >
                <option value="">Elegir empleador…</option>
                {empresasFiltradas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.razon_social}
                    {e.rut_empresa ? ` — ${e.rut_empresa}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nombre del empleador</Label>
            <Input
              value={empNombre}
              onChange={(e) => {
                setEmpNombre(e.target.value);
                setClienteId(null);
              }}
              placeholder="Ej.: Domingo Undurraga Herrera"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>RUT del empleador</Label>
            <Input value={empRut} onChange={(e) => setEmpRut(e.target.value)} placeholder="16.621.384-3" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Domicilio del empleador (también es el lugar de trabajo)</Label>
            <Input
              value={empDomicilio}
              onChange={(e) => setEmpDomicilio(e.target.value)}
              placeholder="Calle N°, depto, sector, comuna, región"
            />
          </div>
        </div>
      </div>

      {/* TRABAJADORA */}
      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">Trabajadora</h3>
        {clienteId && trabDelEmpleador.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            <Label>Autorrellenar desde la nómina del empleador</Label>
            <select
              className={`${selectCls} sm:w-80`}
              value=""
              onChange={(e) => e.target.value && fillTrabajadora(e.target.value)}
              aria-label="Trabajadora de la nómina"
            >
              <option value="">Elegir trabajadora…</option>
              {trabDelEmpleador.map((t) => (
                <option key={t.id} value={t.id}>
                  {[t.nombres, t.apellido_paterno, t.apellido_materno].filter(Boolean).join(" ")}
                  {t.rut ? ` — ${t.rut}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Nombre completo</Label>
            <Input value={trabNombre} onChange={(e) => setTrabNombre(e.target.value)} placeholder="Nombre y apellidos" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cédula de identidad</Label>
            <Input value={trabRut} onChange={(e) => setTrabRut(e.target.value)} placeholder="17.162.682-K" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fecha de nacimiento</Label>
            <Input type="date" value={fechaNac} onChange={(e) => setFechaNac(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Nacionalidad</Label>
            <Input value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} placeholder="chilena" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Domicilio</Label>
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle N°, depto, sector" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Comuna</Label>
            <Input value={comuna} onChange={(e) => setComuna(e.target.value)} placeholder="Viña del Mar" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>AFP</Label>
            <Input value={afp} onChange={(e) => setAfp(e.target.value)} placeholder="AFP Habitat" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Salud</Label>
            <Input value={salud} onChange={(e) => setSalud(e.target.value)} placeholder="Fonasa" />
          </div>
        </div>
      </div>

      {/* CONTRATO */}
      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">Condiciones del contrato</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo de contrato</Label>
            <select
              className={selectCls}
              value={tipoContrato}
              onChange={(e) =>
                setTipoContrato(e.target.value as GenerarCasaParticularInput["tipoContrato"])
              }
            >
              <option value="plazo_fijo">Plazo fijo</option>
              <option value="indefinido">Indefinido</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Ciudad de firma</Label>
            <Input value={ciudadFirma} onChange={(e) => setCiudadFirma(e.target.value)} placeholder="Viña del Mar" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Fecha de inicio</Label>
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              Fecha de término {tipoContrato === "indefinido" && "(no aplica)"}
            </Label>
            <Input
              type="date"
              value={fechaTermino}
              onChange={(e) => setFechaTermino(e.target.value)}
              disabled={tipoContrato === "indefinido"}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Sueldo líquido por día ($)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={sueldoDia}
              onChange={(e) => setSueldoDia(e.target.value)}
              placeholder="30000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Movilización por día ($)</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={movilDia}
              onChange={(e) => setMovilDia(e.target.value)}
              placeholder="2000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Horas semanales</Label>
            <Input value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="12" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Distribución / horario de la jornada</Label>
            <Textarea
              value={distribucion}
              onChange={(e) => setDistribucion(e.target.value)}
              rows={2}
              placeholder="Ej.: distribuida los días martes y viernes, de 09:00 a 17:00 el martes (con una hora de colación no imputable a la jornada) y de 09:00 a 14:00 el viernes"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Funciones / tareas</Label>
            <Textarea
              value={funciones}
              onChange={(e) => setFunciones(e.target.value)}
              rows={2}
              placeholder="aseo, cocina, lavado y planchado, jardinería, entre otras funciones propias de la naturaleza de los servicios"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Cláusulas adicionales (opcional)</Label>
            <Textarea
              value={clausulas}
              onChange={(e) => setClausulas(e.target.value)}
              rows={2}
              placeholder="Texto libre que se agrega al final de la cláusula de duración."
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={generar} disabled={generando}>
            <Home className="size-4" />
            {generando ? "Generando…" : "Generar contrato (.docx)"}
          </Button>
        </div>
      </div>

      {/* LISTADO */}
      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">Contratos generados</h3>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay contratos generados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {documentos.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-[var(--brand-teal)]">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {d.trabajadora} · {d.empleador}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.tipoContrato === "indefinido" ? "Indefinido" : "Plazo fijo"} ·{" "}
                      {new Date(d.createdAt).toLocaleDateString("es-CL")}
                      {d.autor ? ` · ${d.autor}` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => descargarDoc(d)}
                  disabled={descargando === d.id}
                >
                  <Download className="size-3.5" />
                  {descargando === d.id ? "Generando link…" : "Descargar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
