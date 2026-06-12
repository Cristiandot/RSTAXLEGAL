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
  subirFacturasLote,
  vincularCliente,
  type ResultadoCarga,
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
    { label: "En suscripción", valor: filas.filter((f) => !f.pagada && f.suscrito).length },
    { label: "Pendientes de pago", valor: filas.filter((f) => !f.pagada && !f.suscrito && f.tipo === "factura").length },
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

  // ---- Marcar pago con fecha elegida ----
  const [pagando, setPagando] = useState<FacturaRow | null>(null);
  const [fechaPagoNueva, setFechaPagoNueva] = useState("");

  function abrirPago(f: FacturaRow) {
    setFechaPagoNueva(f.fechaPago ?? new Date().toISOString().slice(0, 10));
    setPagando(f);
  }

  function confirmarPago() {
    if (!pagando) return;
    const id = pagando.id;
    const fecha = fechaPagoNueva || null;
    startAccion(async () => {
      const res = await marcarPago(id, true, fecha);
      if (res.ok) {
        toast.success("Marcada como pagada");
        setPagando(null);
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  function quitarPago() {
    if (!pagando) return;
    const id = pagando.id;
    startAccion(async () => {
      const res = await marcarPago(id, false);
      if (res.ok) {
        toast.success("Pago desmarcado");
        setPagando(null);
        router.refresh();
      } else toast.error(res.error ?? "Error");
    });
  }

  // ---- Carga masiva: el mes + N PDFs; todo lo demás se extrae solo ----
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoCarga[] | null>(null);
  const archivosRef = useRef<HTMLInputElement>(null);
  const periodoRef = useRef<HTMLInputElement>(null);

  function cerrarSubida() {
    setSubiendo(false);
    setProgreso(null);
    setResultados(null);
  }

  function onSubirSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const archivos = Array.from(archivosRef.current?.files ?? []);
    const periodo = periodoRef.current?.value ?? "";
    if (archivos.length === 0) {
      toast.error("Selecciona los PDFs del mes.");
      return;
    }
    startAccion(async () => {
      // tandas bajo el límite de payload (~4MB): por cantidad y por peso
      const tandas: File[][] = [];
      let actual: File[] = [];
      let peso = 0;
      for (const a of archivos) {
        if (actual.length >= 8 || peso + a.size > 3_000_000) {
          if (actual.length) tandas.push(actual);
          actual = [];
          peso = 0;
        }
        actual.push(a);
        peso += a.size;
      }
      if (actual.length) tandas.push(actual);

      const acumulado: ResultadoCarga[] = [];
      for (let i = 0; i < tandas.length; i++) {
        setProgreso(`Subiendo tanda ${i + 1} de ${tandas.length}… (${acumulado.length}/${archivos.length} procesados)`);
        const fd = new FormData();
        fd.set("periodo", periodo);
        tandas[i].forEach((a) => fd.append("archivos", a));
        const res = await subirFacturasLote(fd);
        if (!res.ok) {
          toast.error(res.error ?? "Error en la carga");
          setProgreso(null);
          return;
        }
        acumulado.push(...(res.resultados ?? []));
      }
      setProgreso(null);
      setResultados(acumulado);
      const okCount = acumulado.filter((r) => r.ok).length;
      const malCount = acumulado.length - okCount;
      if (malCount === 0) toast.success(`${okCount} documentos cargados`);
      else toast.warning(`${okCount} cargados · ${malCount} con problemas — revisa el detalle`);
      router.refresh();
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
          Cargar facturas del mes
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                      onClick={() => abrirPago(f)}
                      title={
                        f.pagada
                          ? `Pagada el ${formatFecha(f.fechaPago)} — click para editar o quitar`
                          : f.suscrito
                            ? `Suscripción — pago automático${f.diaPago ? ` el día ${f.diaPago}` : " (día por confirmar)"}. Click para registrar la fecha de pago.`
                            : "Click para marcar como pagada"
                      }
                    >
                      {f.pagada ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          Pagada{f.fechaPago ? ` ${formatFecha(f.fechaPago)}` : ""}
                        </Badge>
                      ) : f.suscrito ? (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-800">
                          <RefreshCcw className="size-3" />
                          Suscripción{f.diaPago ? ` · día ${f.diaPago}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-600">
                          Pendiente
                        </Badge>
                      )}
                    </button>
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

      {/* ---- Diálogo: carga masiva del mes ---- */}
      <Dialog open={subiendo} onOpenChange={(o) => { if (!o) cerrarSubida(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Cargar facturas del mes</DialogTitle>
            <DialogDescription>
              Selecciona todos los PDFs de una vez (con el nombre
              &quot;(folio) RAZÓN SOCIAL.pdf&quot;, como salen de la carpeta).
              El folio, el monto, el RUT y el cliente se leen automáticamente de
              cada documento. Las notas de crédito (&quot;NC (folio) - …&quot;)
              también se reconocen.
            </DialogDescription>
          </DialogHeader>

          {resultados === null ? (
            <>
              <form id="form-factura" onSubmit={onSubirSubmit} className="grid gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="periodo">Mes de los documentos</Label>
                  <Input
                    id="periodo"
                    ref={periodoRef}
                    type="month"
                    required
                    defaultValue={new Date().toISOString().slice(0, 7)}
                    className="w-44"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="archivos">PDFs (puedes seleccionar todos juntos)</Label>
                  <Input
                    id="archivos"
                    ref={archivosRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    required
                  />
                </div>
              </form>
              {progreso ? (
                <p className="text-sm text-muted-foreground">{progreso}</p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={cerrarSubida} disabled={ocupado}>
                  Cancelar
                </Button>
                <Button type="submit" form="form-factura" disabled={ocupado}>
                  {ocupado ? "Subiendo…" : "Cargar todo"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {resultados.map((r) => (
                  <div key={r.nombre} className="flex items-start justify-between gap-2 border-b pb-1 last:border-0">
                    <span className="min-w-0 truncate" title={r.nombre}>
                      {r.ok ? "✔" : "✗"} {r.nombre}
                    </span>
                    <span className={`shrink-0 text-xs ${r.ok ? "text-muted-foreground" : "text-red-600"}`}>
                      {r.detalle}
                    </span>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={cerrarSubida}>Listo</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Diálogo: registrar pago ---- */}
      <Dialog open={pagando !== null} onOpenChange={(o) => { if (!o) setPagando(null); }}>
        {pagando ? (
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Pago de {pagando.tipo === "nota_credito" ? "NC" : "factura"} {pagando.folio}
              </DialogTitle>
              <DialogDescription>
                {pagando.clienteNombre ?? pagando.razonFactura} · {etiquetaPeriodo(pagando.periodo)}
                {pagando.monto ? ` · ${formatMonto(pagando.monto)}` : ""}
                {pagando.suscrito ? " · cliente en suscripción" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fecha_pago">Fecha de pago</Label>
              <Input
                id="fecha_pago"
                type="date"
                className="w-44"
                value={fechaPagoNueva}
                onChange={(e) => setFechaPagoNueva(e.target.value)}
              />
            </div>
            <DialogFooter>
              {pagando.pagada ? (
                <Button variant="outline" className="text-destructive" onClick={quitarPago} disabled={ocupado}>
                  Quitar pago
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setPagando(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmarPago} disabled={ocupado}>
                {pagando.pagada ? "Actualizar fecha" : "Marcar pagada"}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
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
                      Día del mes en que se ejecuta el pago (opcional)
                    </Label>
                    <Input
                      id="dia_pago"
                      type="number"
                      min={1}
                      max={31}
                      className="h-8 w-20"
                      value={diaPago}
                      onChange={(e) => setDiaPago(e.target.value)}
                      placeholder="¿?"
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