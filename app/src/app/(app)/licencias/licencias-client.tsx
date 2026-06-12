"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCopy, Plus, Search, Stethoscope } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { formatearRut } from "@/lib/rut";
import {
  TIPO_LICENCIA_LABEL,
  ESTADO_LICENCIA_LABEL,
  claseEstadoLicencia,
  licenciaVigente,
  diasEntre,
} from "@/lib/licencias";
import {
  crearLicencia,
  actualizarLicencia,
  listarTrabajadoresCliente,
  obtenerFichaTramitacion,
  type TrabajadorOption,
  type FichaTramitacion,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type LicenciaRow = {
  id: string;
  clienteId: string | null;
  trabajadorId: string | null;
  empresa: string;
  empresaRut: string | null;
  trabajador: string;
  trabajadorRut: string | null;
  tipo: string;
  folio: string | null;
  codigo: string | null;
  dias: number | null;
  inicio: string | null;
  termino: string | null;
  entidad: string | null;
  estado: string;
  enPlanilla: boolean;
  observacion: string | null;
  creada: string;
};

export type ClienteOption = { id: string; nombre: string; rut: string | null };

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LicenciasClient({
  filas,
  clientes,
  errorCarga,
}: {
  filas: LicenciaRow[];
  clientes: ClienteOption[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const hoy = hoyISO();
  const [buscar, setBuscar] = useState("");
  const [empresaF, setEmpresaF] = useState("");
  const [estadoF, setEstadoF] = useState("");
  const [soloVigentes, setSoloVigentes] = useState(false);
  const [viendo, setViendo] = useState<LicenciaRow | null>(null);
  const [creando, setCreando] = useState(false);

  const empresas = useMemo(
    () => [...new Set(filas.map((f) => f.empresa))].sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  );

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (
        q &&
        !`${f.trabajador} ${f.trabajadorRut ?? ""} ${f.empresa} ${f.folio ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (empresaF && f.empresa !== empresaF) return false;
      if (estadoF && f.estado !== estadoF) return false;
      if (soloVigentes && !licenciaVigente(f.inicio, f.termino, hoy)) return false;
      return true;
    });
  }, [filas, buscar, empresaF, estadoF, soloVigentes, hoy]);

  const vigentes = filas.filter((f) => licenciaVigente(f.inicio, f.termino, hoy)).length;
  const porTramitar = filas.filter((f) => f.estado === "por_tramitar").length;
  const sinPlanilla = filas.filter((f) => f.estado === "tramitada" && !f.enPlanilla).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Licencias médicas
          </h1>
          <p className="text-sm text-muted-foreground">
            Registro y tramitación de licencias de trabajadores de clientes.
            {vigentes > 0 ? ` ${vigentes} vigente${vigentes > 1 ? "s" : ""} hoy.` : ""}
            {porTramitar > 0 ? ` ${porTramitar} por tramitar.` : ""}
            {sinPlanilla > 0 ? ` ${sinPlanilla} sin ingresar a planilla.` : ""}
          </p>
        </div>
        <Button onClick={() => setCreando(true)}>
          <Plus className="size-4" /> Registrar licencia
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar trabajador, RUT, empresa o folio…"
            className="h-9 w-72 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <select
          aria-label="Empresa"
          className={selectCls}
          value={empresaF}
          onChange={(e) => setEmpresaF(e.target.value)}
        >
          <option value="">Todas las empresas</option>
          {empresas.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado"
          className={selectCls}
          value={estadoF}
          onChange={(e) => setEstadoF(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LICENCIA_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={soloVigentes}
            onChange={(e) => setSoloVigentes(e.target.checked)}
          />
          Solo vigentes
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length}
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[200px]">Empresa</TableHead>
              <TableHead className="w-[200px]">Trabajador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Término</TableHead>
              <TableHead className="text-right">Días</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Planilla</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Sin licencias para los filtros elegidos.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => {
                const vigente = licenciaVigente(f.inicio, f.termino, hoy);
                return (
                  <TableRow key={f.id} onClick={() => setViendo(f)} className="cursor-pointer">
                    <TableCell className="max-w-[220px] truncate font-medium">
                      {f.empresa}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[220px] truncate">{f.trabajador}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.trabajadorRut ? formatearRut(f.trabajadorRut) : "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {TIPO_LICENCIA_LABEL[f.tipo] ?? f.tipo}
                    </TableCell>
                    <TableCell className="text-sm">{f.folio ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatFecha(f.inicio)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatFecha(f.termino)}
                      {vigente ? (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-sky-200 bg-sky-50 text-sky-700"
                        >
                          Vigente
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{f.dias ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={claseEstadoLicencia(f.estado)}>
                        {ESTADO_LICENCIA_LABEL[f.estado] ?? f.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{f.enPlanilla ? "✓" : "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {viendo ? (
        <DetalleLicencia
          licencia={viendo}
          historico={filas.filter(
            (f) => f.trabajadorRut && f.trabajadorRut === viendo.trabajadorRut,
          )}
          onClose={() => setViendo(null)}
          onChanged={() => {
            setViendo(null);
            router.refresh();
          }}
        />
      ) : null}

      {creando ? (
        <NuevaLicencia
          clientes={clientes}
          onClose={() => setCreando(false)}
          onCreated={() => {
            setCreando(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detalle + tramitación                                               */
/* ------------------------------------------------------------------ */

function DetalleLicencia({
  licencia,
  historico,
  onClose,
  onChanged,
}: {
  licencia: LicenciaRow;
  historico: LicenciaRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [estado, setEstado] = useState(licencia.estado);
  const [enPlanilla, setEnPlanilla] = useState(licencia.enPlanilla);
  const [observacion, setObservacion] = useState(licencia.observacion ?? "");
  const [ficha, setFicha] = useState<FichaTramitacion | null>(null);
  const [fichaCargando, setFichaCargando] = useState(false);
  const [ocupado, startAccion] = useTransition();

  const totalDias = historico.reduce((s, h) => s + (h.dias ?? 0), 0);

  function guardar() {
    startAccion(async () => {
      const res = await actualizarLicencia(licencia.id, {
        estado,
        en_planilla: enPlanilla,
        observacion: observacion.trim() || null,
      });
      if (res.ok) {
        toast.success("Licencia actualizada");
        onChanged();
      } else toast.error(res.error ?? "Error");
    });
  }

  async function cargarFicha() {
    setFichaCargando(true);
    const res = await obtenerFichaTramitacion(licencia.id);
    setFichaCargando(false);
    if (res.ok && res.ficha) setFicha(res.ficha);
    else toast.error(res.error ?? "No se pudo cargar la ficha");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {licencia.trabajador}
            {licencia.trabajadorRut ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {formatearRut(licencia.trabajadorRut)}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {licencia.empresa} · {TIPO_LICENCIA_LABEL[licencia.tipo] ?? licencia.tipo} ·{" "}
            {formatFecha(licencia.inicio)} → {formatFecha(licencia.termino)}
            {licencia.dias ? ` (${licencia.dias} días)` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          <Dato label="Folio" valor={licencia.folio ?? "—"} copiable />
          <Dato label="Código verificación" valor={licencia.codigo ?? "—"} copiable />
          <Dato label="Entidad" valor={licencia.entidad ?? "—"} />
          <Dato
            label="Historial del trabajador"
            valor={`${historico.length} licencia${historico.length === 1 ? "" : "s"} · ${totalDias} días`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div className="space-y-1">
            <Label>Estado de tramitación</Label>
            <select
              className={`${selectCls} w-full`}
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              {Object.entries(ESTADO_LICENCIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={enPlanilla}
              onChange={(e) => setEnPlanilla(e.target.checked)}
            />
            Ingresada a planilla de liquidaciones
          </label>
          <div className="col-span-2 space-y-1">
            <Label>Observación</Label>
            <Textarea
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas internas: estado en COMPIN, apelaciones, etc."
            />
          </div>
        </div>

        <div className="border-t pt-3">
          {ficha ? (
            <FichaDatos ficha={ficha} />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={cargarFicha}
              disabled={fichaCargando}
            >
              <Stethoscope className="size-4" />
              {fichaCargando ? "Cargando…" : "Datos para tramitación"}
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={guardar} disabled={ocupado}>
            {ocupado ? "Guardando…" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Par etiqueta/valor con copia al portapapeles opcional. */
function Dato({
  label,
  valor,
  copiable = false,
}: {
  label: string;
  valor: string;
  copiable?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-right font-medium">
        {valor}
        {copiable && valor !== "—" ? (
          <button
            type="button"
            aria-label={`Copiar ${label}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              navigator.clipboard.writeText(valor);
              toast.success(`${label} copiado`);
            }}
          >
            <ClipboardCopy className="size-3.5" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Ficha con los datos que piden LM Empleador / IMED / Medipass al tramitar. */
function FichaDatos({ ficha }: { ficha: FichaTramitacion }) {
  const t = ficha.trabajador;
  const e = ficha.empresa;

  function copiarTodo() {
    const lineas: string[] = [];
    if (t) {
      lineas.push(
        `TRABAJADOR`,
        `Nombre: ${t.nombre}`,
        `RUT: ${t.rut ? formatearRut(t.rut) : "—"}`,
        `Dirección: ${t.direccion ?? "—"}${t.comuna ? `, ${t.comuna}` : ""}`,
        `Correo: ${t.correo ?? "—"} · Fono: ${t.fono ?? "—"}`,
        `Nacimiento: ${formatFecha(t.fechaNacimiento)}`,
        `AFP: ${t.afp ?? "—"} · Salud: ${t.salud ?? "—"}${t.planIsapre ? ` (${t.planIsapre})` : ""}`,
        `Cargo: ${t.cargo ?? "—"} · Contrato: ${t.tipoContrato ?? "—"} · Ingreso: ${formatFecha(t.fechaIngreso)}`,
        `Sueldo base: ${formatMonto(t.sueldoBase)}`,
      );
    }
    if (e) {
      lineas.push(
        ``,
        `EMPRESA`,
        `Razón social: ${e.razonSocial}`,
        `RUT: ${e.rut ? formatearRut(e.rut) : "—"}`,
        `Rep. legal: ${e.representanteLegal ?? "—"}${e.representanteLegalRut ? ` (${formatearRut(e.representanteLegalRut)})` : ""}`,
        `Domicilio: ${e.domicilio ?? "—"}${e.comuna ? `, ${e.comuna}` : ""}${e.ciudad ? `, ${e.ciudad}` : ""}`,
        `Correo: ${e.correo ?? "—"}`,
      );
    }
    navigator.clipboard.writeText(lineas.join("\n"));
    toast.success("Ficha copiada al portapapeles");
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Datos para tramitación</h3>
        <Button type="button" size="sm" variant="outline" onClick={copiarTodo}>
          <ClipboardCopy className="size-3.5" /> Copiar todo
        </Button>
      </div>
      {t ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border p-3">
          <Dato label="Nombre" valor={t.nombre} copiable />
          <Dato label="RUT" valor={t.rut ? formatearRut(t.rut) : "—"} copiable />
          <Dato
            label="Dirección"
            valor={t.direccion ? `${t.direccion}${t.comuna ? `, ${t.comuna}` : ""}` : "—"}
            copiable
          />
          <Dato label="Nacimiento" valor={formatFecha(t.fechaNacimiento)} />
          <Dato label="Correo" valor={t.correo ?? "—"} copiable />
          <Dato label="Fono" valor={t.fono ?? "—"} copiable />
          <Dato label="AFP" valor={t.afp ?? "—"} />
          <Dato
            label="Salud"
            valor={(t.salud ?? "—") + (t.planIsapre ? ` (${t.planIsapre})` : "")}
          />
          <Dato label="Cargo" valor={t.cargo ?? "—"} />
          <Dato label="Tipo contrato" valor={t.tipoContrato ?? "—"} />
          <Dato label="Fecha ingreso" valor={formatFecha(t.fechaIngreso)} />
          <Dato label="Sueldo base" valor={formatMonto(t.sueldoBase)} copiable />
        </div>
      ) : (
        <p className="text-muted-foreground">
          El trabajador no está en la nómina de la base — solo hay nombre y RUT del registro.
        </p>
      )}
      {e ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border p-3">
          <Dato label="Razón social" valor={e.razonSocial} copiable />
          <Dato label="RUT empresa" valor={e.rut ? formatearRut(e.rut) : "—"} copiable />
          <Dato
            label="Rep. legal"
            valor={
              e.representanteLegal
                ? `${e.representanteLegal}${e.representanteLegalRut ? ` (${formatearRut(e.representanteLegalRut)})` : ""}`
                : "—"
            }
            copiable
          />
          <Dato
            label="Domicilio"
            valor={e.domicilio ? `${e.domicilio}${e.comuna ? `, ${e.comuna}` : ""}` : "—"}
            copiable
          />
          <Dato label="Correo empresa" valor={e.correo ?? "—"} copiable />
        </div>
      ) : (
        <p className="text-muted-foreground">
          La empresa no está vinculada a un cliente de la base.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registro de una licencia nueva                                      */
/* ------------------------------------------------------------------ */

function NuevaLicencia({
  clientes,
  onClose,
  onCreated,
}: {
  clientes: ClienteOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [nomina, setNomina] = useState<TrabajadorOption[]>([]);
  const [trabajadorId, setTrabajadorId] = useState("");
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [tipo, setTipo] = useState("nueva");
  const [folio, setFolio] = useState("");
  const [codigo, setCodigo] = useState("");
  const [inicio, setInicio] = useState("");
  const [termino, setTermino] = useState("");
  const [entidad, setEntidad] = useState("");
  const [estado, setEstado] = useState("por_tramitar");
  const [observacion, setObservacion] = useState("");
  const [ocupado, startAccion] = useTransition();

  useEffect(() => {
    setTrabajadorId("");
    setNomina([]);
    if (!clienteId) return;
    listarTrabajadoresCliente(clienteId).then(setNomina);
  }, [clienteId]);

  const dias = inicio && termino ? diasEntre(inicio, termino) : null;
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const elegido = nomina.find((t) => t.id === trabajadorId) ?? null;

  function guardar() {
    const nombreFinal = elegido?.nombre ?? nombre;
    if (!nombreFinal.trim()) {
      toast.error("Indica el trabajador.");
      return;
    }
    if (inicio && termino && dias === null) {
      toast.error("El término no puede ser anterior al inicio.");
      return;
    }
    startAccion(async () => {
      const res = await crearLicencia({
        clienteId: clienteId || null,
        empresaNombre: cliente?.nombre ?? "",
        empresaRut: cliente?.rut ?? null,
        trabajadorId: trabajadorId || null,
        trabajadorNombre: nombreFinal,
        trabajadorRut: elegido?.rut ?? rut ?? null,
        tipo,
        folio: folio || null,
        codigoVerificacion: codigo || null,
        fechaInicio: inicio || null,
        fechaTermino: termino || null,
        dias,
        entidad: entidad || null,
        estado,
        observacion: observacion || null,
      });
      if (res.ok) {
        toast.success("Licencia registrada");
        onCreated();
      } else toast.error(res.error ?? "Error al registrar");
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar licencia médica</DialogTitle>
          <DialogDescription>
            Queda en estado &quot;{ESTADO_LICENCIA_LABEL[estado]}&quot; para seguimiento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Empresa</Label>
            <select
              className={`${selectCls} w-full`}
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">— Elegir cliente —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Trabajador</Label>
            <select
              className={`${selectCls} w-full`}
              value={trabajadorId}
              onChange={(e) => setTrabajadorId(e.target.value)}
              disabled={!clienteId}
            >
              <option value="">
                {nomina.length
                  ? "— No está en la nómina (escribir abajo) —"
                  : "Sin nómina cargada (escribir abajo)"}
              </option>
              {nomina.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} {t.rut ? `· ${t.rut}` : ""}
                </option>
              ))}
            </select>
          </div>

          {!trabajadorId ? (
            <>
              <div className="space-y-1">
                <Label>Nombre trabajador</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>RUT trabajador</Label>
                <Input
                  value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  placeholder="12.345.678-9"
                />
              </div>
            </>
          ) : null}

          <div className="space-y-1">
            <Label>Tipo</Label>
            <select
              className={`${selectCls} w-full`}
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
            >
              {Object.entries(TIPO_LICENCIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Entidad (opcional)</Label>
            <Input
              value={entidad}
              onChange={(e) => setEntidad(e.target.value)}
              placeholder="ACHS, IST, CCAF…"
            />
          </div>

          <div className="space-y-1">
            <Label>Folio</Label>
            <Input value={folio} onChange={(e) => setFolio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Código verificación</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Fecha inicio</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Fecha término</Label>
            <Input type="date" value={termino} onChange={(e) => setTermino(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Días</Label>
            <Input value={dias ?? ""} disabled placeholder="Se calcula con las fechas" />
          </div>
          <div className="space-y-1">
            <Label>Estado inicial</Label>
            <select
              className={`${selectCls} w-full`}
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              {Object.entries(ESTADO_LICENCIA_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="col-span-2 space-y-1">
            <Label>Observación</Label>
            <Textarea
              rows={2}
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={ocupado}>
            {ocupado ? "Guardando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
