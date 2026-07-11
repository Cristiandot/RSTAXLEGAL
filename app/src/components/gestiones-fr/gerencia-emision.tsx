"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyPlus, Plus, Search } from "lucide-react";
import { montoCLP } from "@/lib/format";
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
import { actualizarEmisionItem, copiarEmisionMes, crearEmisionItem } from "./actions";
import type { EmisionItem } from "./tipos";

const selectClase =
  "h-8 rounded-md border border-input bg-white px-2 text-xs shadow-xs focus:outline-2 focus:outline-ring/50";
const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Pestaña "Emisión del mes" (ex hoja Fact Jul): la nómina de clientes a facturar
 *  en el período, con check de emitida y copia de la nómina del mes anterior. */
export function TabEmision({
  emision,
  mesActual,
  pendiente,
  ejecutar,
  recargar,
}: {
  emision: EmisionItem[];
  mesActual: string;
  pendiente: boolean;
  ejecutar: (fn: () => Promise<{ ok: boolean; error?: string }>, exito: string) => void;
  recargar: () => Promise<void>;
}) {
  const periodos = useMemo(() => {
    const set = new Set(emision.map((e) => e.periodo));
    set.add(mesActual);
    return Array.from(set).sort().reverse();
  }, [emision, mesActual]);

  const [periodo, setPeriodo] = useState(
    periodos.includes(mesActual) ? mesActual : (periodos[0] ?? mesActual),
  );
  const [busqueda, setBusqueda] = useState("");
  const [soloPorEmitir, setSoloPorEmitir] = useState(false);
  const [formNuevo, setFormNuevo] = useState(false);
  const [copiando, setCopiando] = useState(false);

  const delPeriodo = useMemo(
    () => emision.filter((e) => e.periodo === periodo),
    [emision, periodo],
  );
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return delPeriodo.filter((e) => {
      if (soloPorEmitir && e.emitida) return false;
      if (!q) return true;
      return `${e.cliente} ${e.rut ?? ""}`.toLowerCase().includes(q);
    });
  }, [delPeriodo, busqueda, soloPorEmitir]);

  const total = delPeriodo.reduce((s, e) => s + e.valor, 0);
  const emitidas = delPeriodo.filter((e) => e.emitida);
  const totalEmitido = emitidas.reduce((s, e) => s + e.valor, 0);

  const parseMonto = (s: string): number | null => {
    const limpio = s.replace(/\./g, "").replace(",", ".").trim();
    if (limpio === "") return null;
    const x = Number(limpio);
    return Number.isFinite(x) ? x : null;
  };

  function copiarMes() {
    const desde = delPeriodo.length ? periodo : mesAnterior(periodo);
    const hacia = delPeriodo.length ? null : periodo;
    // Si el período elegido está vacío → traer el mes anterior a este período.
    // Si tiene filas → copiar este período al mes siguiente.
    const [a, m] = periodo.split("-").map(Number);
    const sig = new Date(a, m, 1);
    const destino = hacia ?? `${sig.getFullYear()}-${String(sig.getMonth() + 1).padStart(2, "0")}`;
    const origen = hacia ? desde : periodo;
    if (!window.confirm(`¿Copiar la nómina de ${origen} a ${destino}?`)) return;
    setCopiando(true);
    void copiarEmisionMes(origen, destino).then(async (res) => {
      setCopiando(false);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo copiar.");
        return;
      }
      toast.success(`${res.copiadas} filas copiadas a ${destino}.`);
      await recargar();
      setPeriodo(destino);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Nómina {periodo}</p>
          <p className="mt-1 text-2xl font-bold">{montoCLP(Math.round(total))}</p>
          <p className="text-xs text-muted-foreground">{delPeriodo.length} clientes a facturar</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Emitido</p>
          <p className="mt-1 text-2xl font-bold text-teal-700">{montoCLP(Math.round(totalEmitido))}</p>
          <p className="text-xs text-muted-foreground">
            {emitidas.length} de {delPeriodo.length} facturas
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Por emitir</p>
          <p className="mt-1 text-2xl font-bold">{montoCLP(Math.round(total - totalEmitido))}</p>
          <p className="text-xs text-muted-foreground">{delPeriodo.length - emitidas.length} pendientes</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className={selectClase} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
          {periodos.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o RUT…"
            className="pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloPorEmitir((x) => !x)}
          className={`rounded-lg border px-3 py-1.5 text-xs transition ${
            soloPorEmitir
              ? "border-[#17A2B8] bg-accent font-semibold"
              : "bg-white text-muted-foreground hover:bg-muted/50"
          }`}
        >
          Solo por emitir
        </button>
        <span className="mr-auto" />
        <Button size="sm" variant="outline" onClick={copiarMes} disabled={copiando || pendiente}>
          <CopyPlus className="size-4" />
          {delPeriodo.length ? "Copiar nómina al mes siguiente" : "Traer nómina del mes anterior"}
        </Button>
        <Button size="sm" onClick={() => setFormNuevo((x) => !x)}>
          <Plus className="size-4" />
          Agregar cliente
        </Button>
      </div>

      {formNuevo ? (
        <form
          className="rounded-xl border border-dashed border-[#17A2B8] bg-muted/30 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            ejecutar(
              () =>
                crearEmisionItem({
                  periodo,
                  cliente: (fd.get("cliente") as string) ?? "",
                  rut: ((fd.get("rut") as string) ?? "").trim() || null,
                  valor: parseMonto((fd.get("valor") as string) ?? "") ?? 0,
                  observaciones: ((fd.get("obs") as string) ?? "").trim() || null,
                }),
              "Cliente agregado a la nómina.",
            );
            setFormNuevo(false);
          }}
        >
          <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClase}>Cliente *</label>
              <Input name="cliente" required placeholder="Razón social" />
            </div>
            <div>
              <label className={labelClase}>RUT</label>
              <Input name="rut" placeholder="76123456-7" />
            </div>
            <div>
              <label className={labelClase}>Valor *</label>
              <Input name="valor" required placeholder="122.469" />
            </div>
            <div>
              <label className={labelClase}>Observaciones</label>
              <Input name="obs" placeholder="glosa, folio, financiamiento…" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pendiente}>
              Guardar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFormNuevo(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      <div className="max-h-[560px] overflow-auto rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Emitida</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Observaciones</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {delPeriodo.length === 0
                    ? "Este período no tiene nómina — usa “Traer nómina del mes anterior”."
                    : "Sin filas que calcen con el filtro."}
                </TableCell>
              </TableRow>
            ) : null}
            {filtradas.map((e) => (
              <TableRow key={e.id} className={e.emitida ? "opacity-70" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    className="size-4 accent-[#17A2B8]"
                    checked={e.emitida}
                    disabled={pendiente}
                    onChange={(ev) =>
                      ejecutar(
                        () => actualizarEmisionItem(e.id, { emitida: ev.target.checked }),
                        ev.target.checked ? "Marcada como emitida." : "Marcada como por emitir.",
                      )
                    }
                  />
                </TableCell>
                <TableCell className="max-w-80 truncate text-sm" title={e.cliente}>
                  {e.cliente}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                  {e.rut ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <input
                    type="text"
                    className={`${selectClase} w-24 text-right`}
                    defaultValue={Math.round(e.valor)}
                    disabled={pendiente}
                    onBlur={(ev) => {
                      const nuevo = parseMonto(ev.target.value);
                      if (nuevo === null || Math.round(nuevo) === Math.round(e.valor)) return;
                      ejecutar(
                        () => actualizarEmisionItem(e.id, { valor: nuevo }),
                        "Valor actualizado.",
                      );
                    }}
                  />
                </TableCell>
                <TableCell>
                  <input
                    type="text"
                    className={`${selectClase} w-full min-w-40`}
                    defaultValue={e.observaciones ?? ""}
                    placeholder="—"
                    disabled={pendiente}
                    onBlur={(ev) => {
                      const nuevo = ev.target.value.trim() || null;
                      if (nuevo === (e.observaciones ?? null)) return;
                      ejecutar(
                        () => actualizarEmisionItem(e.id, { observaciones: nuevo }),
                        "Observación guardada.",
                      );
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    disabled={pendiente}
                    className="text-[11px] text-muted-foreground hover:text-red-600 hover:underline"
                    title="Sacar de la nómina de este mes (no se borra)"
                    onClick={() => {
                      if (window.confirm(`¿Sacar a ${e.cliente} de la nómina de ${e.periodo}?`))
                        ejecutar(
                          () => actualizarEmisionItem(e.id, { activo: false }),
                          `${e.cliente} salió de la nómina.`,
                        );
                    }}
                  >
                    Sacar
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Al abrir el mes nuevo: &quot;Copiar nómina al mes siguiente&quot; duplica esta lista (sin marcar
        emitidas) y ahí ajustas altas, bajas y valores por el cambio de UF. El check de emitida es
        el control de avance del mes — la factura misma se sube igual que siempre en Facturación.
      </p>
    </div>
  );
}
