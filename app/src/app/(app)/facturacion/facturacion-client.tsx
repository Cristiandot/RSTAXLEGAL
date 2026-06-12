"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Link2, RefreshCcw, Search, Send, Upload } from "lucide-react";
import { formatFecha, formatMonto } from "@/lib/format";
import { etiquetaPeriodo } from "@/lib/periodos";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  enviarFacturaAlCliente,
  guardarSuscripcion,
  linkDescargaFactura,
  marcarPago,
  subirFactura,
  vincularCliente,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

export type FacturaRow = {
  id: string;
  folio: number;
  tipo: string;
  folioRef: number | null;
  razonFactura: string;
  periodo: string;
  monto: number | string | null;
  observaciones: string | null;
  pagada: boolean;
  fechaPago: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  suscrito: boolean;
  diaPago: number | null;
};

export type ClienteOpcion = {
  id: string;
  razon_social: string;
  suscripcion_pago: boolean;
  suscripcion_dia_pago: number | null;
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResumenCard({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{valor}</div>
    </div>
  );
}

export function FacturacionClient({
  filas,
  clientes,
  errorCarga,
}: {
  filas: FacturaRow[];
  clientes: ClienteOpcion[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [periodoF, setPeriodoF] = useState("");
  const [tipoF, setTipoF] = useState("");
  const [vinculoF, setVinculoF] = useState("");
  const [pagoF, setPagoF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);
  const [ocupado, startAccion] = useTransition();

  const periodos = useMemo(
    () => [...new Set(filas.map((f) => f.periodo))].sort().reverse(),
    [filas],
  );

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((f) => {
      if (q) {
        const t = `${f.folio} ${f.razonFactura} ${f.clienteNombre ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (periodoF && f.periodo !== periodoF) return false;
      if (tipoF && f.tipo !== tipoF) return false;
      if (vinculoF === "si" && !f.clienteId) return false;
      if (vinculoF === "no" && f.clienteId) return false;
      if (pagoF === "pagada" && !f.pagada) return false;
      if (pagoF === "pendiente" && f.pagada) return false;
      if (pagoF === "suscrito" && !f.suscrito) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (f: FacturaRow): unknown => {
      switch (orden.col) {
        case "folio": return f.folio;
        case "cliente": return f.clienteNombre ?? f.razonFactura;
        case "periodo": return f.periodo;
        case "monto": return f.monto !== null ? Number(f.monto) : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
  }, [filas, buscar, periodoF, tipoF, vinculoF, pagoF, orden]);

  const resumen = [
    { label: "Documentos", valor: filas.length },
    { label: "Pagadas", valor: filas.filter((f) => f.pagada).length },
    { label: "Pendientes de pago", valor: filas.filter((f) => !f.pagada && f.tipo === "factura").length },
    { label: "Sin vincular a cliente", valor: filas.filter((f) => !f.clienteId).length },
  ];

  function descargar(id: string) {
    startAccion(async () => {
      const res = await linkDescargaFactura(id);
      if (res.ok && res.url) window.open(res.url, "_blank");
      else toast.error(res.error ?? "Error al descargar");
    });
  }

  function enviar(f: FacturaRow) {
    if (!window.confirm(`¿Enviar ${f.tipo === "nota_credito" ? "la NC" : "la factura"} ${f.folio} al correo de ${f.clienteNombre ?? f.razonFactura}?`)) return;
    startAccion(async () => {
      const res = await enviarFacturaAlCliente(f.id);
      if (res.ok) toast.success(`Enviada a ${res.enviadoA}`);
      else toast.error(res.error ?? "Error al enviar");
    });
  }

  function togglePago(f: FacturaRow) {
    startAccion(async () => {
      const res = await marcarPago(f.id, !f.pagada);
      if (res.ok) {
        toast.success(f.pagada ? "Pago desmarcado" : "Marcada como pagada");
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  // ---- Subida de documento nuevo ----
  const [subiendo, setSubiendo] = useState(false);
  const [tipoNuevo, setTipoNuevo] = useState("factura");
  const [clienteNuevo, setClienteNuevo] = useState("");
  const [razonNueva, setRazonNueva] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  function elegirCliente(id: string) {
    setClienteNuevo(id);
    const cli = clientes.find((c) => c.id === id);
    if (cli) setRazonNueva(cli.razon_social);
  }

  function onSubirSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startAccion(async () => {
      const res = await subirFactura(fd);
      if (res.ok) {
        toast.success("Documento cargado");
        setSubiendo(false);
        setClienteNuevo("");
        setRazonNueva("");
        router.refresh();
      } else toast.error(res.error ?? "Error al subir");
    });
  }

  // ---- Vincular cliente + suscripción ----
  const [vinculando, setVinculando] = useState<FacturaRow | null>(null);
  const [clienteVinculo, setClienteVinculo] = useState("");
  const [suscrito, setSuscrito] = useState(false);
  const [diaPago, setDiaPago] = useState("");

  function cargarSuscripcionDe(clienteId: string) {
    const cli = clientes.find((c) => c.id === clienteId);
    setSuscrito(cli?.suscripcion_pago ?? false);
    setDiaPago(cli?.suscripcion_dia_pago ? String(cli.suscripcion_dia_pago) : "");
  }

  function abrirVinculo(f: FacturaRow) {
    setClienteVinculo(f.clienteId ?? "");
    setSuscrito(f.suscrito);
    setDiaPago(f.diaPago ? String(f.diaPago) : "");
    setVinculando(f);
  }

  function guardarVinculo() {
    if (!vinculando) return;
    const id = vinculando.id;
    const clienteId = clienteVinculo || null;
    const susc = suscrito;
    const dia = diaPago ? Number(diaPago) : null;
    startAccion(async () => {
      const res = await vincularCliente(id, clienteId);
      if (!res.ok) {
        toast.error(res.error ?? "Error");
        return;
      }
      if (clienteId) {
        const resSus = await guardarSuscripcion(clienteId, susc, dia);
        if (!resSus.ok) {
          toast.error(resSus.error ?? "Error al guardar la suscripción");
          return;
        }
      }
      toast.success("Guardado");
      setVinculando(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Facturación
          </h1>
          <p className="text-sm text-muted-foreground">
            Facturas emitidas por la oficina a los clientes: descarga cuando las
            pidan y carga de los meses nuevos.
          </p>
        </div>
        <Button onClick={() => setSubiendo(true)}>
          <Upload className="size-4" />
          Subir documento
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map((r) => (
          <ResumenCard key={r.label} label={r.label} valor={r.valor} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar folio o cliente…"
            className="h-9 w-64 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <select aria-label="Período" className={selectCls} value={periodoF} onChange={(e) => setPeriodoF(e.target.value)}>
          <option value="">Todos los meses</option>
          {periodos.map((p) => (
            <option key={p} value={p}>{etiquetaPeriodo(p)}</option>
          ))}
        </select>
        <select aria-label="Tipo" className={selectCls} value={tipoF} onChange={(e) => setTipoF(e.target.value)}>
          <option value="">Facturas y NC</option>
          <option value="factura">Solo facturas</option>
          <option value="nota_credito">Solo notas de crédito</option>
        </select>
        <select aria-label="Vínculo" className={selectCls} value={vinculoF} onChange={(e) => setVinculoF(e.target.value)}>
          <option value="">Todas</option>
          <option value="si">Vinculadas a cliente</option>
          <option value="no">Sin vincular</option>
        </select>
        <select aria-label="Pago" className={selectCls} value={pagoF} onChange={(e) => setPagoF(e.target.value)}>
          <option value="">Pago: todas</option>
          <option value="pagada">Pagadas</option>
          <option value="pendiente">Pendientes</option>
          <option value="suscrito">Clientes suscritos</option>
        </select>
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
              <ThSort col="folio" orden={orden} setOrden={setOrden}>Folio</ThSort>
              <TableHead>Tipo</TableHead>
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[320px]">Cliente</ThSort>
              <ThSort col="periodo" orden={orden} setOrden={setOrden}>Mes</ThSort>
              <ThSort col="monto" orden={orden} setOrden={setOrden} className="text-right">Monto</ThSort>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Sin documentos para estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.folio}</TableCell>
                  <TableCell>
                    {f.tipo === "nota_credito" ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                        title={f.folioRef ? `Referencia: factura ${f.folioRef}` : undefined}
                      >
                        NC{f.folioRef ? ` → ${f.folioRef}` : ""}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                        Factura
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className="block max-w-[320px] truncate font-medium"
                      title={f.clienteNombre ?? f.razonFactura}
                    >
                      {f.clienteNombre ?? f.razonFactura}
                    </span>
                    {!f.clienteId ? (
                      <span className="text-xs text-amber-600">sin vincular a cartera</span>
                    ) : f.clienteNombre !== f.razonFactura ? (
                      <span className="block max-w-[320px] truncate text-xs text-muted-foreground" title={f.razonFactura}>
                        {f.razonFactura}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>{etiquetaPeriodo(f.periodo)}</TableCell>
                  <TableCell className="text-right">{formatMonto(f.monto)}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => togglePago(f)}
                      title={f.pagada ? `Pagada el ${formatFecha(f.fechaPago)} — click para desmarcar` : "Click para marcar como pagada"}
                    >
                      {f.pagada ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          Pagada{f.fechaPago ? ` ${formatFecha(f.fechaPago)}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                          Pendiente
                        </Badge>
                      )}
                    </button>
                    {f.suscrito ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-sky-600" title={`Cliente suscrito — pago automático${f.diaPago ? ` el día ${f.diaPago} de cada mes` : ""}`}>
                        <RefreshCcw className="size-3" />
                        suscrito{f.diaPago ? ` · día ${f.diaPago}` : ""}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => descargar(f.id)}
                        title="Descargar PDF"
                      >
                        <Download className="size-3.5" />
                        Descargar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado}
                        onClick={() => enviar(f)}
                        title="Enviar por correo al cliente"
                      >
                        <Send className="size-3.5" />
                        Enviar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={ocupado}
                        onClick={() => abrirVinculo(f)}
                        title="Vincular a cliente / suscripción"
                      >
                        <Link2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---- Diálogo: subir documento ---- */}
      <Dialog open={subiendo} onOpenChange={(o) => { if (!o) setSubiendo(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Subir documento</DialogTitle>
            <DialogDescription>
              Factura o nota de crédito emitida por la oficina. El PDF queda
              disponible para descarga inmediata.
            </DialogDescription>
          </DialogHeader>
          <form ref={formRef} id="form-factura" onSubmit={onSubirSubmit} className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select
                id="tipo"
                name="tipo"
                className={selectCls}
                value={tipoNuevo}
                onChange={(e) => setTipoNuevo(e.target.value)}
              >
                <option value="factura">Factura</option>
                <option value="nota_credito">Nota de crédito</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="folio">N° (folio)</Label>
              <Input id="folio" name="folio" type="number" min={1} required placeholder="ej. 1120" />
            </div>
            {tipoNuevo === "nota_credito" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="folio_ref">Factura de referencia (N°)</Label>
                <Input id="folio_ref" name="folio_ref" type="number" min={1} placeholder="opcional" />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodo">Mes</Label>
              <Input id="periodo" name="periodo" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="cliente_id">Cliente (cartera)</Label>
              <select
                id="cliente_id"
                name="cliente_id"
                className={selectCls}
                value={clienteNuevo}
                onChange={(e) => elegirCliente(e.target.value)}
              >
                <option value="">— No es cliente de cartera —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razon_social}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="razon_social">Razón social en el documento</Label>
              <Input
                id="razon_social"
                name="razon_social"
                required
                value={razonNueva}
                onChange={(e) => setRazonNueva(e.target.value)}
                placeholder="Como aparece en la factura"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="monto">Monto ($, opcional)</Label>
              <Input id="monto" name="monto" type="number" min={0} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="archivo">PDF</Label>
              <Input id="archivo" name="archivo" type="file" accept="application/pdf,.pdf" required />
            </div>
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubiendo(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="form-factura" disabled={ocupado}>
              {ocupado ? "Subiendo…" : "Subir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Diálogo: vincular cliente ---- */}
      <Dialog open={vinculando !== null} onOpenChange={(o) => { if (!o) setVinculando(null); }}>
        {vinculando ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-heading">
                {vinculando.tipo === "nota_credito" ? "NC" : "Factura"} {vinculando.folio}
              </DialogTitle>
              <DialogDescription>
                Emitida a: {vinculando.razonFactura} · {etiquetaPeriodo(vinculando.periodo)}
                {vinculando.observaciones ? ` · ${vinculando.observaciones}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vinculo">Cliente de la cartera</Label>
              <select
                id="vinculo"
                className={selectCls}
                value={clienteVinculo}
                onChange={(e) => {
                  setClienteVinculo(e.target.value);
                  cargarSuscripcionDe(e.target.value);
                }}
              >
                <option value="">— Sin vincular (externo) —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razon_social}</option>
                ))}
              </select>
            </div>
            {clienteVinculo ? (
              <div className="rounded-lg border bg-muted/40 p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand-teal,#17A2B8)]"
                    checked={suscrito}
                    onChange={(e) => setSuscrito(e.target.checked)}
                  />
                  Cliente suscrito — pago automático mensual
                </label>
                {suscrito ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Label htmlFor="dia_pago" className="text-xs whitespace-nowrap">
                      Día del mes en que se ejecuta el pago
                    </Label>
                    <Input
                      id="dia_pago"
                      type="number"
                      min={1}
                      max={31}
                      className="h-8 w-20"
                      value={diaPago}
                      onChange={(e) => setDiaPago(e.target.value)}
                      placeholder="ej. 5"
                    />
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  La suscripción es del cliente (aplica a todas sus facturas), no
                  de esta factura en particular.
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVinculando(null)}>
                Cancelar
              </Button>
              <Button onClick={guardarVinculo} disabled={ocupado}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}