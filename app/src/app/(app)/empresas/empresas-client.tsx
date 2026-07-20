"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ChevronRight, Plus, X, Pencil } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ClaveCell, RutPreviredCell } from "@/components/credencial-celdas";
import { ThSort } from "@/components/th-sort";
import { Progreso } from "@/components/progreso";
import { CampoConValor } from "@/components/campos-editables";
import { comparar, ordenarPorGrupo, type Orden } from "@/lib/ordenar";
import { formatFecha } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  tipoCampo,
  type CampoDef,
  type Catalogos,
  type FaltanteRow,
  type GrupoClienteOpcion,
} from "@/lib/onboarding";
import {
  agregarCorreoAdicional,
  agregarSocio,
  editarSocio,
  marcarServicioEmpresa,
  quitarCorreoAdicional,
  quitarSocio,
  renombrarEmpresa,
  type Socio,
} from "./actions";
import { Badge } from "@/components/ui/badge";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type EmpresaFichaRow = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  /** 'empresa' | 'casa_particular' — a casa particular solo se le exige RUT + clave Previred. */
  tipo_cliente: string;
  /** true = solo llevamos RRHH (sin F29 ni contabilidad): la ficha no exige los
   * campos tributarios/SII. Deriva de los flags de servicio. */
  esRrhh: boolean;
  /** true = solo llevamos lo legal/societario (sin RRHH ni tributario): la ficha
   * solo exige la identidad societaria. Deriva del flag hace_legal. */
  esLegal: boolean;
  /** % de completitud de la ficha (campos obligatorios de la empresa). */
  pct: number | null;
  faltan: number;
  /** Valor mostrable de cada campo de la ficha; null = falta (editable). */
  valores: Record<string, string | null>;
  /** false = cliente que canceló el servicio (fuera de ciclos mensuales). */
  activo: boolean;
  fecha_termino_servicio: string | null;
  /** Accesos: solo el RUT viaja; de las claves llega un booleano (card Accesos). */
  previred_rut: string | null;
  tiene_clave_sii: boolean;
  tiene_clave_previred: boolean;
  mutual_institucion: string | null;
  mutual_rut: string | null;
  tiene_clave_mutual: boolean;
  sii_rep_rut: string | null;
  tiene_clave_sii_rep: boolean;
  midt_rut: string | null;
  tiene_clave_midt: boolean;
  socios: Socio[];
  /** Correos adicionales: todo envío al cliente va con copia a esta lista. */
  correos_adicionales: string[];
};

/** Título del diálogo con edición del nombre (razón social) de la empresa. */
function NombreEditable({ empresa }: { empresa: EmpresaFichaRow }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(empresa.razon_social);
  const [trabajando, start] = useTransition();

  function guardar() {
    if (nombre.trim() === empresa.razon_social) {
      setEditando(false);
      return;
    }
    start(async () => {
      const res = await renombrarEmpresa(empresa.id, nombre);
      if (res.ok) {
        toast.success("Nombre actualizado");
        setEditando(false);
        router.refresh();
      } else toast.error(res.error ?? "Error al renombrar");
    });
  }

  if (editando) {
    return (
      <span className="flex items-center gap-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="h-8 flex-1 text-base"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") {
              setNombre(empresa.razon_social);
              setEditando(false);
            }
          }}
        />
        <Button size="sm" className="h-8" disabled={trabajando} onClick={guardar}>
          {trabajando ? "…" : "Guardar"}
        </Button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {empresa.razon_social}
      <button
        type="button"
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Editar el nombre de la empresa"
        onClick={() => {
          setNombre(empresa.razon_social);
          setEditando(true);
        }}
      >
        <Pencil className="size-3.5" />
      </button>
    </span>
  );
}

/** Sección dedicada: correos adicionales del cliente, agregables sin límite. */
function CorreosCard({ empresa }: { empresa: EmpresaFichaRow }) {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [trabajando, start] = useTransition();

  function agregar() {
    if (!correo.trim() || trabajando) return;
    start(async () => {
      const res = await agregarCorreoAdicional(empresa.id, correo);
      if (res.ok) {
        toast.success("Correo agregado");
        setCorreo("");
        router.refresh();
      } else toast.error(res.error ?? "Error al agregar el correo");
    });
  }

  function quitar(i: number) {
    start(async () => {
      const res = await quitarCorreoAdicional(empresa.id, i);
      if (res.ok) {
        toast.success("Correo quitado");
        router.refresh();
      } else toast.error(res.error ?? "Error al quitar el correo");
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>Correos adicionales</span>
        {empresa.correos_adicionales.length ? (
          <span className="font-normal text-muted-foreground">
            {empresa.correos_adicionales.length} en copia
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Todo correo que se envía al cliente (F29, resumen de pagos, facturas,
        contratos) sale con copia a esta lista, además del correo de la empresa.
      </p>

      {empresa.correos_adicionales.length ? (
        <div className="mb-3 space-y-1">
          {empresa.correos_adicionales.map((c, i) => (
            <div
              key={`${c}-${i}`}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{c}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                title="Quitar correo"
                disabled={trabajando}
                onClick={() => quitar(i)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Sin correos adicionales.
        </p>
      )}

      <div className="flex items-end gap-2">
        <Input
          className="h-8 flex-1 bg-card text-sm"
          type="email"
          placeholder="otro.correo@cliente.cl"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") agregar();
          }}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={trabajando || !correo.trim()}
          onClick={agregar}
        >
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
    </div>
  );
}

/** Sección dedicada: estado del servicio (cliente activo o que canceló). */
function ServicioCard({ empresa }: { empresa: EmpresaFichaRow }) {
  const router = useRouter();
  const [trabajando, start] = useTransition();

  function marcar(activo: boolean) {
    start(async () => {
      const res = await marcarServicioEmpresa(empresa.id, activo);
      if (res.ok) {
        toast.success(
          activo
            ? `${empresa.razon_social} reactivada — vuelve a los ciclos mensuales`
            : `${empresa.razon_social} marcada sin servicio — sale de los ciclos mensuales`,
        );
        router.refresh();
      } else toast.error(res.error ?? "Error al cambiar el estado del servicio");
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center justify-between text-sm font-semibold">
        <span>Servicio</span>
        {empresa.activo ? (
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 font-normal text-emerald-700">
            Con servicio activo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-red-200 bg-red-50 font-normal text-red-700">
            Sin servicio
            {empresa.fecha_termino_servicio
              ? ` desde ${formatFecha(empresa.fecha_termino_servicio)}`
              : ""}
          </Badge>
        )}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Al marcar sin servicio, la empresa sale de Liquidaciones, F29,
        Comunicación mensual y del % de completitud, pero conserva su historial
        y credenciales. Se puede reactivar cuando quieras.
      </p>
      <Button
        size="sm"
        variant={empresa.activo ? "outline" : "default"}
        disabled={trabajando}
        onClick={() => marcar(!empresa.activo)}
      >
        {empresa.activo ? "Marcar sin servicio" : "Reactivar servicio"}
      </Button>
    </div>
  );
}

/** Sección dedicada: accesos SII/Previred con puntitos (cuentan en el %). */
function AccesosCard({ empresa }: { empresa: EmpresaFichaRow }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 text-sm font-semibold">Accesos</div>
      <p className="mb-2 text-xs text-muted-foreground">
        Claves SII (empresa y rep. legal), Previred, Mutual y Mi DT. Ver o
        copiar una clave queda auditado; la vista completa de la cartera está
        en Credenciales.
      </p>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            Clave SII{!empresa.tiene_clave_sii ? " *" : ""}
          </div>
          <ClaveCell
            clienteId={empresa.id}
            campo="clave_sii"
            etiqueta="Clave SII"
            razonSocial={empresa.razon_social}
            tiene={empresa.tiene_clave_sii}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            RUT Previred{!empresa.previred_rut ? " *" : ""}
          </div>
          <RutPreviredCell
            clienteId={empresa.id}
            valorInicial={empresa.previred_rut}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            Clave Previred{!empresa.tiene_clave_previred ? " *" : ""}
          </div>
          <ClaveCell
            clienteId={empresa.id}
            campo="previred_clave"
            etiqueta="Clave Previred"
            razonSocial={empresa.razon_social}
            tiene={empresa.tiene_clave_previred}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            RUT Mutual{empresa.mutual_institucion ? ` (${empresa.mutual_institucion})` : ""}
          </div>
          <RutPreviredCell
            clienteId={empresa.id}
            valorInicial={empresa.mutual_rut}
            campo="mutual_rut"
            etiqueta="RUT Mutual"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">Clave Mutual</div>
          <ClaveCell
            clienteId={empresa.id}
            campo="mutual_clave"
            etiqueta="Clave Mutual"
            razonSocial={empresa.razon_social}
            tiene={empresa.tiene_clave_mutual}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            RUT SII rep. legal
          </div>
          <RutPreviredCell
            clienteId={empresa.id}
            valorInicial={empresa.sii_rep_rut}
            campo="sii_rep_rut"
            etiqueta="RUT SII rep. legal"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">
            Clave SII rep. legal
          </div>
          <ClaveCell
            clienteId={empresa.id}
            campo="sii_rep_clave"
            etiqueta="Clave SII rep. legal"
            razonSocial={empresa.razon_social}
            tiene={empresa.tiene_clave_sii_rep}
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">RUT Mi DT</div>
          <RutPreviredCell
            clienteId={empresa.id}
            valorInicial={empresa.midt_rut}
            campo="midt_rut"
            etiqueta="RUT Mi DT"
          />
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">Clave Mi DT</div>
          <ClaveCell
            clienteId={empresa.id}
            campo="midt_clave"
            etiqueta="Clave Mi DT"
            razonSocial={empresa.razon_social}
            tiene={empresa.tiene_clave_midt}
          />
        </div>
      </div>
    </div>
  );
}

/** Sección dedicada: socios con RUT y % de participación — agregables,
 * editables en línea y quitables. */
function SociosCard({ empresa }: { empresa: EmpresaFichaRow }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [part, setPart] = useState("");
  // Edición en línea de un socio existente (índice + valores del formulario).
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editRut, setEditRut] = useState("");
  const [editPart, setEditPart] = useState("");
  const [trabajando, start] = useTransition();

  function agregar() {
    if (!rut.trim() || trabajando) return;
    start(async () => {
      const res = await agregarSocio(empresa.id, nombre, rut, part);
      if (res.ok) {
        toast.success("Socio agregado");
        setNombre("");
        setRut("");
        setPart("");
        router.refresh();
      } else toast.error(res.error ?? "Error al agregar el socio");
    });
  }

  function empezarEdicion(i: number) {
    const s = empresa.socios[i];
    setEditIdx(i);
    setEditNombre(s.nombre ?? "");
    setEditRut(s.rut ?? "");
    setEditPart(s.participacion != null ? String(s.participacion) : "");
  }

  function guardarEdicion() {
    if (editIdx === null || !editRut.trim() || trabajando) return;
    start(async () => {
      const res = await editarSocio(
        empresa.id,
        editIdx,
        editNombre,
        editRut,
        editPart,
      );
      if (res.ok) {
        toast.success("Socio actualizado");
        setEditIdx(null);
        router.refresh();
      } else toast.error(res.error ?? "Error al editar el socio");
    });
  }

  function quitar(i: number) {
    start(async () => {
      const res = await quitarSocio(empresa.id, i);
      if (res.ok) {
        toast.success("Socio quitado");
        if (editIdx === i) setEditIdx(null);
        router.refresh();
      } else toast.error(res.error ?? "Error al quitar el socio");
    });
  }

  const totalPart = empresa.socios.reduce(
    (a, s) => a + (s.participacion ?? 0),
    0,
  );

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between text-sm font-semibold">
        <span>Socios y participación</span>
        {empresa.socios.length ? (
          <span className="font-normal text-muted-foreground">
            {empresa.socios.length}{" "}
            {empresa.socios.length === 1 ? "socio" : "socios"}
            {totalPart ? ` · ${totalPart}%` : ""}
          </span>
        ) : null}
      </div>

      {empresa.socios.length ? (
        <div className="mb-3 space-y-1">
          {empresa.socios.map((s, i) =>
            editIdx === i ? (
              <div
                key={`${s.rut ?? "s"}-${i}`}
                className="grid grid-cols-1 items-end gap-2 rounded-md border border-input bg-muted/40 px-2 py-1.5 sm:grid-cols-[1fr_9rem_5.5rem_auto]"
              >
                <Input
                  className="h-8 bg-card text-sm"
                  placeholder="Nombre del socio"
                  value={editNombre}
                  autoFocus
                  onChange={(e) => setEditNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardarEdicion();
                    if (e.key === "Escape") setEditIdx(null);
                  }}
                />
                <Input
                  className="h-8 bg-card text-sm"
                  placeholder="12.345.678-9"
                  value={editRut}
                  onChange={(e) => setEditRut(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardarEdicion();
                    if (e.key === "Escape") setEditIdx(null);
                  }}
                />
                <Input
                  className="h-8 bg-card text-sm"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="%"
                  value={editPart}
                  onChange={(e) => setEditPart(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardarEdicion();
                    if (e.key === "Escape") setEditIdx(null);
                  }}
                />
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={trabajando || !editRut.trim()}
                    onClick={guardarEdicion}
                  >
                    {trabajando ? "…" : "Guardar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    title="Cancelar edición"
                    disabled={trabajando}
                    onClick={() => setEditIdx(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={`${s.rut ?? "s"}-${i}`}
                className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.nombre ?? "—"}
                </span>
                <RutCopiable rut={s.rut} />
                <span className="w-14 text-right text-muted-foreground">
                  {s.participacion != null ? `${s.participacion}%` : "—"}
                </span>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Editar socio"
                  disabled={trabajando}
                  onClick={() => empezarEdicion(i)}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  title="Quitar socio"
                  disabled={trabajando}
                  onClick={() => quitar(i)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Sin socios registrados.
        </p>
      )}

      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_9rem_5.5rem_auto]">
        <Input
          className="h-8 bg-card text-sm"
          placeholder="Nombre del socio"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Input
          className="h-8 bg-card text-sm"
          placeholder="12.345.678-9"
          value={rut}
          onChange={(e) => setRut(e.target.value)}
        />
        <Input
          className="h-8 bg-card text-sm"
          type="number"
          min={0}
          max={100}
          placeholder="%"
          value={part}
          onChange={(e) => setPart(e.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={trabajando || !rut.trim()}
          onClick={agregar}
        >
          <Plus className="size-4" /> Agregar
        </Button>
      </div>
    </div>
  );
}

export function EmpresasClient({
  empresas,
  grupos,
  fichaCampos,
  catalogos,
  errorCarga,
}: {
  empresas: EmpresaFichaRow[];
  grupos: GrupoClienteOpcion[];
  fichaCampos: CampoDef[];
  catalogos: Catalogos;
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [clienteF, setClienteF] = useState("");
  // Estado del servicio: por defecto solo las empresas con servicio activo.
  const [servicioF, setServicioF] = useState<"activas" | "sin_servicio" | "todas">("activas");
  const [orden, setOrden] = useState<Orden>(null);

  // Detalle: id seleccionado; la fila se deriva de props para que al guardar
  // un campo y refrescar, el diálogo muestre el valor recién escrito.
  const [empSelId, setEmpSelId] = useState<string | null>(null);
  const empSel = useMemo(
    () => (empSelId ? (empresas.find((e) => e.id === empSelId) ?? null) : null),
    [empSelId, empresas],
  );

  const camposPorGrupo = useMemo(() => {
    const m = new Map<string, CampoDef[]>();
    for (const c of fichaCampos) {
      const arr = m.get(c.grupo) ?? [];
      arr.push(c);
      m.set(c.grupo, arr);
    }
    return [...m.entries()];
  }, [fichaCampos]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = empresas.filter((e) => {
      if (servicioF === "activas" && !e.activo) return false;
      if (servicioF === "sin_servicio" && e.activo) return false;
      if (q) {
        const t =
          `${e.razon_social} ${e.rut_empresa ?? ""} ${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (clienteF === "__sin__" && e.grupo_id) return false;
      if (clienteF && clienteF !== "__sin__" && e.grupo_id !== clienteF)
        return false;
      return true;
    });
    // Orden por defecto = prioridad de cartera por código de grupo (A.1 → D.45),
    // con la razón social como desempate; las empresas sin cliente al final.
    if (!orden)
      return ordenarPorGrupo(out, (e) => e.grupo_codigo, (e) => e.razon_social);
    const val = (e: EmpresaFichaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
        case "rut":
          return e.rut_empresa;
        case "pct":
          return e.pct;
        case "faltan":
          return e.faltan;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, servicioF, orden]);

  /** Valor a mostrar de un campo lleno (las fechas se formatean DD-MM-AAAA). */
  function mostrar(def: CampoDef, v: string): string {
    return tipoCampo(def.campo) === "fecha" ? formatFecha(v) : v;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Empresas
        </h1>
        <p className="text-sm text-muted-foreground">
          Ficha de cada empresa de la cartera. Este es el lugar para revisar y
          rellenar sus datos: lo que falta aparece como campo editable.
        </p>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, RUT o cliente…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <select
          aria-label="Cliente"
          className={`${selectCls} max-w-[220px]`}
          value={clienteF}
          onChange={(e) => setClienteF(e.target.value)}
        >
          <option value="">Todos los clientes</option>
          <option value="__sin__">Sin cliente asignado</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>
              {g.codigo ? `${g.codigo} — ` : ""}
              {g.nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado del servicio"
          className={selectCls}
          value={servicioF}
          onChange={(e) =>
            setServicioF(e.target.value as "activas" | "sin_servicio" | "todas")
          }
        >
          <option value="activas">Con servicio activo</option>
          <option value="sin_servicio">
            Sin servicio ({empresas.filter((e) => !e.activo).length})
          </option>
          <option value="todas">Todas</option>
        </select>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {empresas.length} empresas
        </span>
      </div>

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[180px]">
                Cliente
              </ThSort>
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[300px]">
                Empresa
              </ThSort>
              <ThSort col="rut" orden={orden} setOrden={setOrden}>
                RUT
              </ThSort>
              <ThSort col="pct" orden={orden} setOrden={setOrden}>
                % Completado
              </ThSort>
              <ThSort col="faltan" orden={orden} setOrden={setOrden} className="text-center">
                Faltan
              </ThSort>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => setEmpSelId(e.id)}
                >
                  <TableCell>
                    {e.grupo_codigo || e.grupo_nombre ? (
                      <span
                        className="block max-w-[180px] truncate text-sm"
                        title={`${e.grupo_codigo ?? ""} ${e.grupo_nombre ?? ""}`.trim()}
                      >
                        {e.grupo_codigo ? (
                          <span className="font-medium">{e.grupo_codigo}</span>
                        ) : null}{" "}
                        <span className="text-muted-foreground">
                          {e.grupo_nombre}
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sin cliente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[300px] truncate"
                      title={e.razon_social}
                    >
                      {e.razon_social}
                    </span>
                    {e.tipo_cliente === "casa_particular" ? (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-violet-300 bg-violet-50 text-[10px] font-normal text-violet-700"
                      >
                        Casa particular
                      </Badge>
                    ) : null}
                    {e.esRrhh ? (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-sky-300 bg-sky-50 text-[10px] font-normal text-sky-700"
                      >
                        Recursos Humanos
                      </Badge>
                    ) : null}
                    {e.esLegal ? (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-amber-300 bg-amber-50 text-[10px] font-normal text-amber-700"
                      >
                        Legal
                      </Badge>
                    ) : null}
                    {!e.activo ? (
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-red-200 bg-red-50 text-[10px] font-normal text-red-700"
                      >
                        Sin servicio
                        {e.fecha_termino_servicio
                          ? ` desde ${formatFecha(e.fecha_termino_servicio)}`
                          : ""}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RutCopiable rut={e.rut_empresa} />
                  </TableCell>
                  <TableCell>
                    <Progreso pct={e.pct} />
                  </TableCell>
                  <TableCell className="text-center">
                    {e.faltan === 0 ? (
                      <span className="text-emerald-600">0</span>
                    ) : (
                      <span className="font-semibold text-red-600">
                        {e.faltan}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <ChevronRight className="size-4" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ============ Diálogo: ficha editable ============ */}
      <Dialog
        open={empSel !== null}
        onOpenChange={(o) => {
          if (!o) setEmpSelId(null);
        }}
      >
        {empSel ? (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="font-heading">
                <NombreEditable key={empSel.id} empresa={empSel} />
              </DialogTitle>
              <DialogDescription>
                {empSel.grupo_codigo ? `${empSel.grupo_codigo} — ` : ""}
                {empSel.grupo_nombre ?? "Sin cliente"} ·{" "}
                {empSel.rut_empresa ?? "sin RUT"} · ficha{" "}
                {empSel.pct === null ? "—" : `${empSel.pct}%`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {/* Casa particular (empleador persona natural): la ficha es solo
                  RUT + clave Previred — los campos societarios no aplican. */}
              {empSel.tipo_cliente === "casa_particular" ? (
                <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800">
                  Empleador de casa particular. Su ficha completa es el RUT y la
                  clave Previred de la card Accesos; no lleva datos societarios
                  ni ciclo F29 / Comunicación mensual.
                </p>
              ) : null}
              {empSel.esRrhh ? (
                <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                  Cliente de <strong>Recursos Humanos</strong>: solo llevamos sus
                  remuneraciones, no su contabilidad ni SII. No se exigen los
                  datos tributarios (tipo de sociedad, régimen, giro, inicio de
                  actividades ni clave SII); la ficha se completa con
                  identificación, domicilio, representante legal, contacto y
                  Previred.
                </p>
              ) : null}
              {empSel.esLegal ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Cliente <strong>Legal</strong>: solo llevamos lo
                  societario/legal, no sus remuneraciones, contabilidad ni SII.
                  No se exigen el régimen tributario, giro, inicio de actividades
                  ni clave SII; la ficha se completa con la identidad societaria
                  (RUT, razón social, tipo de sociedad, representante legal,
                  domicilio y contacto).
                </p>
              ) : null}
              {(empSel.tipo_cliente === "casa_particular"
                ? []
                : camposPorGrupo
              ).map(([grupo, defs]) => (
                <div key={grupo} className="contents">
                  <div className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-semibold">{grupo}</div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                    {defs.map((def) => {
                      const v = empSel.valores[def.campo] ?? null;
                      const item: FaltanteRow = {
                        entidad: "cliente",
                        registro_id: empSel.id,
                        cliente_id: empSel.id,
                        campo: def.campo,
                        etiqueta: def.etiqueta,
                        grupo: def.grupo,
                        fuente: def.fuente,
                        registro_nombre: empSel.razon_social,
                        registro_rut: empSel.rut_empresa,
                      };
                      return (
                        <div key={def.campo} className="flex flex-col gap-1">
                          <div className="text-xs text-muted-foreground">
                            {def.etiqueta}
                            {def.obligatorio && v === null ? " *" : ""}
                          </div>
                          <CampoConValor
                            item={item}
                            selector={def.selector}
                            opciones={
                              def.selector ? catalogos[def.selector] : undefined
                            }
                            valor={v}
                            textoMostrar={v !== null ? mostrar(def, v) : undefined}
                            inmutable={def.inmutable}
                            onSaved={() => router.refresh()}
                          />
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  {grupo === "Identificación" ? (
                    <SociosCard empresa={empSel} />
                  ) : null}
                  {defs.some((d) => d.campo === "correo_empresa") ? (
                    <CorreosCard empresa={empSel} />
                  ) : null}
                </div>
              ))}
              <AccesosCard empresa={empSel} />
              <ServicioCard empresa={empSel} />
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
