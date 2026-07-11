"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, ChevronRight, Plus, X, Pencil } from "lucide-react";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { Progreso } from "@/components/progreso";
import { CampoConValor } from "@/components/campos-editables";
import { comparar, type Orden } from "@/lib/ordenar";
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
  quitarCorreoAdicional,
  quitarSocio,
  renombrarEmpresa,
  type Socio,
} from "./actions";

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type EmpresaFichaRow = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
  grupo_id: string | null;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
  /** % de completitud de la ficha (campos obligatorios de la empresa). */
  pct: number | null;
  faltan: number;
  /** Valor mostrable de cada campo de la ficha; null = falta (editable). */
  valores: Record<string, string | null>;
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

/** Sección dedicada: socios con RUT y % de participación, agregables. */
function SociosCard({ empresa }: { empresa: EmpresaFichaRow }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [part, setPart] = useState("");
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

  function quitar(i: number) {
    start(async () => {
      const res = await quitarSocio(empresa.id, i);
      if (res.ok) {
        toast.success("Socio quitado");
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
          {empresa.socios.map((s, i) => (
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
                className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                title="Quitar socio"
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
    if (!orden) return out;
    const val = (e: EmpresaFichaRow): unknown => {
      switch (orden.col) {
        case "cliente":
          return e.grupo_codigo
            ? `${e.grupo_codigo} ${e.grupo_nombre ?? ""}`
            : (e.grupo_nombre ?? null);
        case "empresa":
          return e.razon_social;
        case "pct":
          return e.pct;
        case "faltan":
          return e.faltan;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [empresas, buscar, clienteF, orden]);

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
              <TableHead>RUT</TableHead>
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
              {camposPorGrupo.map(([grupo, defs]) => (
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
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
