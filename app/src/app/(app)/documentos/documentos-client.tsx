"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Calculator, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { actualizarEstadoDocumento, type EstadoDoc } from "./actions";
import { formatFecha } from "@/lib/format";
import { comparar, siguienteOrden, type Orden } from "@/lib/ordenar";
import { CLASE_FILA_DESTACADA, useGestionUrl } from "@/hooks/use-gestion-url";

export type SolicitudDocRow = {
  id: string;
  empresa: string;
  area: "contabilidad" | "rrhh";
  tipoDocumento: string;
  periodo: string | null;
  detalle: string | null;
  estado: EstadoDoc;
  origen: string;
  correo: string | null;
  creada: string;
};

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function nombrePeriodo(p: string | null): string {
  if (!p) return "—";
  const [y, m] = p.split("-").map(Number);
  if (!y || !m) return p;
  return `${MESES[m - 1] ?? "?"} ${y}`;
}

const ESTADOS: { value: EstadoDoc; label: string; cls: string }[] = [
  { value: "solicitada", label: "Solicitada", cls: "bg-amber-100 text-amber-800" },
  { value: "en_revision", label: "En revisión", cls: "bg-sky-100 text-sky-800" },
  { value: "enviada", label: "Enviada", cls: "bg-emerald-100 text-emerald-700" },
  { value: "rechazada", label: "Rechazada", cls: "bg-red-100 text-red-700" },
];

const selectCls =
  "h-8 rounded-md border border-input bg-card px-2 text-xs shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** <th> ordenable de la tabla cruda: mismo comportamiento y flechita que ThSort. */
function ThOrdenable({
  col,
  orden,
  setOrden,
  children,
}: {
  col: string;
  orden: Orden;
  setOrden: (o: Orden) => void;
  children: React.ReactNode;
}) {
  const activo = orden?.col === col;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => setOrden(siguienteOrden(orden, col))}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${activo ? "text-foreground" : ""}`}
        title="Ordenar"
      >
        {children}
        {activo ? (
          orden!.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )
        ) : (
          <ArrowUpDown className="size-3.5 opacity-35" />
        )}
      </button>
    </th>
  );
}

export function DocumentosClient({
  filas,
  errorCarga,
}: {
  filas: SolicitudDocRow[];
  errorCarga: string | null;
}) {
  const [fArea, setFArea] = useState("todas");
  const [fEstado, setFEstado] = useState("pendientes");
  const [orden, setOrden] = useState<Orden>(null);
  const [ocupado, startAccion] = useTransition();
  // Deep-link desde Inicio y requerimientos: destaca la fila y hace scroll.
  const gestionDestacada = useGestionUrl(filas);

  const visibles = useMemo(() => {
    const out = filas.filter((f) => {
      if (fArea !== "todas" && f.area !== fArea) return false;
      if (fEstado === "pendientes") return f.estado === "solicitada" || f.estado === "en_revision";
      if (fEstado === "todas") return true;
      return f.estado === fEstado;
    });
    // Sin orden manual se conserva el del servidor: más recientes primero.
    if (!orden) return out;
    const valor = (f: SolicitudDocRow): unknown => {
      switch (orden.col) {
        case "empresa": return f.empresa;
        case "area": return f.area;
        case "documento": return f.tipoDocumento;
        case "periodo": return f.periodo;
        case "solicitada": return f.creada;
        case "estado": return f.estado;
        // la acción disponible depende del estado
        case "accion": return f.estado;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, fArea, fEstado, orden]);

  const pendientes = filas.filter((f) => f.estado === "solicitada" || f.estado === "en_revision").length;

  function cambiarEstado(id: string, estado: EstadoDoc) {
    startAccion(async () => {
      const r = await actualizarEstadoDocumento(id, estado);
      if (r.ok) toast.success("Estado actualizado");
      else toast.error(r.error ?? "No se pudo actualizar.");
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Solicitudes de documentos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Documentos que los clientes piden desde su portal (contabilidad y personal). La toma
          cualquiera del equipo: revisa, prepara el documento y márcalo como enviado.
          {pendientes > 0 ? (
            <span className="ml-1 font-medium text-foreground">{pendientes} pendiente{pendientes === 1 ? "" : "s"}.</span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={fArea} onChange={(e) => setFArea(e.target.value)}>
          <option value="todas">Todas las áreas</option>
          <option value="contabilidad">Contabilidad</option>
          <option value="rrhh">Recursos humanos</option>
        </select>
        <select className={selectCls} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
          <option value="pendientes">Pendientes</option>
          <option value="solicitada">Solicitadas</option>
          <option value="en_revision">En revisión</option>
          <option value="enviada">Enviadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      {errorCarga ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          No se pudieron cargar las solicitudes: {errorCarga}
        </p>
      ) : null}

      <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card">
              <ThOrdenable col="empresa" orden={orden} setOrden={setOrden}>Empresa</ThOrdenable>
              <ThOrdenable col="area" orden={orden} setOrden={setOrden}>Área</ThOrdenable>
              <ThOrdenable col="documento" orden={orden} setOrden={setOrden}>Documento</ThOrdenable>
              <ThOrdenable col="periodo" orden={orden} setOrden={setOrden}>Período</ThOrdenable>
              <ThOrdenable col="solicitada" orden={orden} setOrden={setOrden}>Solicitada</ThOrdenable>
              <ThOrdenable col="estado" orden={orden} setOrden={setOrden}>Estado</ThOrdenable>
              <ThOrdenable col="accion" orden={orden} setOrden={setOrden}>Acción</ThOrdenable>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const e = ESTADOS.find((x) => x.value === f.estado)!;
              return (
                <tr
                  key={f.id}
                  id={`gestion-${f.id}`}
                  className={`border-b last:border-0 ${f.id === gestionDestacada ? CLASE_FILA_DESTACADA : ""}`}
                >
                  <td className="px-3 py-2">{f.empresa}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {f.area === "contabilidad" ? <Calculator className="size-3.5" /> : <FileText className="size-3.5" />}
                      {f.area === "contabilidad" ? "Contabilidad" : "RR.HH."}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {f.tipoDocumento}
                    {f.detalle ? <span className="block text-xs text-muted-foreground">{f.detalle}</span> : null}
                  </td>
                  <td className="px-3 py-2">{nombrePeriodo(f.periodo)}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatFecha(f.creada.slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${e.cls}`}>{e.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className={selectCls}
                      value={f.estado}
                      disabled={ocupado}
                      onChange={(ev) => cambiarEstado(f.id, ev.target.value as EstadoDoc)}
                    >
                      {ESTADOS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No hay solicitudes con este filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
