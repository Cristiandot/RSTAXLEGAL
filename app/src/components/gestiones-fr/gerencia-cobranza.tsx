"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Mail, Paperclip, Search, X } from "lucide-react";
import { montoCLP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { enviarCobranza } from "./actions";
import type { CobranzaCliente } from "./tipos";

const labelClase = "mb-1 block text-[11px] font-semibold text-muted-foreground";

/** dd-mm-aaaa desde un timestamp ISO. */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

const INTRO_TRANSFIERE =
  "Estimado Cliente,\n\nJunto con saludar, compartimos el estado de cuenta de los honorarios pendientes a la fecha. Agradeceremos gestionar el saldo indicado mediante transferencia a la cuenta que se detalla; se adjuntan las facturas correspondientes.\n\nQuedamos atentos a cualquier consulta.";

const INTRO_SUSCRIPCION =
  "Estimado Cliente,\n\nJunto con saludar, le informamos que se ha presentado un problema con el cobro automático de su suscripción, por lo que los honorarios detallados quedaron pendientes a la fecha. Mientras normalizamos el cobro automático, agradeceremos gestionar el saldo mediante transferencia a la cuenta que se detalla; se adjuntan las facturas correspondientes.\n\nQuedamos atentos a cualquier consulta.";

// Datos de la cuenta de la firma para transferencias (editable en el envío).
const DATOS_CUENTA_DEFECTO =
  "Rodríguez Samith Servicios Legales y Contables II Limitada\nRUT 78.073.973-8\nBanco: Mercado Pago\nTipo de cuenta: Cuenta Vista\nN° de cuenta: 1093709982\nCorreo: frodriguez@rstaxlegal.cl";

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convierte texto (párrafos separados por línea en blanco) a HTML de párrafos. */
function textoAHtml(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escaparHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Datos de cuenta (texto multilínea) a HTML de una línea por renglón. */
function cuentaAHtml(texto: string): string {
  return escaparHtml(texto.trim()).replace(/\n/g, "<br>");
}

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "T", label: "Transfieren" },
  { id: "S", label: "Suscritos" },
] as const;
type FiltroId = (typeof FILTROS)[number]["id"];

export function TabCobranza({
  cobranza,
  recargar,
}: {
  cobranza: CobranzaCliente[];
  recargar: () => Promise<void>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroId>("todos");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [intro, setIntro] = useState(INTRO_TRANSFIERE);
  const [cuenta, setCuenta] = useState(DATOS_CUENTA_DEFECTO);
  const [invitar, setInvitar] = useState(true);
  const [copiaMi, setCopiaMi] = useState(true);

  const ficha = fichaId ? (cobranza.find((c) => c.cliente_id === fichaId) ?? null) : null;
  const modo: "transfiere" | "suscripcion" = ficha?.formaPago === "S" ? "suscripcion" : "transfiere";

  const filtrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cobranza.filter((c) => {
      if (filtro !== "todos" && c.formaPago !== filtro) return false;
      if (!q) return true;
      return `${c.razon_social} ${c.correo ?? ""}`.toLowerCase().includes(q);
    });
  }, [cobranza, busqueda, filtro]);

  const totalGlobal = useMemo(() => cobranza.reduce((s, c) => s + c.total, 0), [cobranza]);
  const mesActual = new Date().toISOString().slice(0, 7);
  const conteo = useMemo(
    () => ({
      T: cobranza.filter((c) => c.formaPago === "T").length,
      S: cobranza.filter((c) => c.formaPago === "S").length,
    }),
    [cobranza],
  );

  function abrir(c: CobranzaCliente) {
    setFichaId(c.cliente_id);
    setSeleccion(new Set(c.facturas.map((f) => f.id)));
    setIntro(c.formaPago === "S" ? INTRO_SUSCRIPCION : INTRO_TRANSFIERE);
    setCuenta(DATOS_CUENTA_DEFECTO);
    setInvitar(!c.suscrito && !!c.planLink);
    setCopiaMi(true);
  }

  const totalSel = ficha
    ? ficha.facturas.filter((f) => seleccion.has(f.id)).reduce((s, f) => s + f.monto, 0)
    : 0;
  const nSel = seleccion.size;

  function toggleFactura(id: string) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function enviar() {
    if (!ficha) return;
    if (!ficha.correo) {
      toast.error("El cliente no tiene correo en su ficha.");
      return;
    }
    if (nSel === 0) {
      toast.error("Selecciona al menos una factura.");
      return;
    }
    startTransition(async () => {
      const res = await enviarCobranza({
        clienteId: ficha.cliente_id,
        facturaIds: [...seleccion],
        introHtml: textoAHtml(intro),
        datosCuentaHtml: cuentaAHtml(cuenta),
        modo,
        copiaRemitente: copiaMi,
        planNombre: modo === "transfiere" && invitar ? ficha.planNombre : null,
        planLink: modo === "transfiere" && invitar ? ficha.planLink : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo enviar el correo.");
        return;
      }
      toast.success(`${modo === "suscripcion" ? "Aviso de suscripción" : "Cobranza"} enviado a ${res.enviadoA}.`);
      setFichaId(null);
      await recargar();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Clientes con facturas impagas</p>
          <p className="mt-1 text-2xl font-bold">{cobranza.length}</p>
          <p className="text-xs text-muted-foreground">
            {conteo.T} transfieren · {conteo.S} suscritos
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Documentos por cobrar</p>
          <p className="mt-1 text-2xl font-bold">{cobranza.reduce((s, c) => s + c.docs, 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-muted-foreground">Total por cobrar</p>
          <p className="mt-1 text-2xl font-bold">{montoCLP(Math.round(totalGlobal))}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border bg-white p-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filtro === f.id
                  ? "bg-[var(--brand-navy,#0B2545)] text-white"
                  : "text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {f.label}
              {f.id !== "todos" ? (
                <span className={`ml-1 ${filtro === f.id ? "opacity-80" : "text-muted-foreground"}`}>
                  {f.id === "T" ? conteo.T : conteo.S}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente o correo…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {filtrada.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {cobranza.length === 0 ? "No hay facturas impagas. 🎉" : "Sin coincidencias."}
          </p>
        ) : (
          filtrada.map((c) => (
            <button
              key={c.cliente_id}
              type="button"
              onClick={() => abrir(c)}
              className="flex w-full items-center gap-3 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
              title="Ver detalle de la deuda"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                  {c.ultimoEnvio?.slice(0, 7) === mesActual ? (
                    <Check
                      className="size-4 shrink-0 text-emerald-600"
                      aria-label="Ya cobrado este mes"
                    />
                  ) : null}
                  {c.razon_social}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {c.correo ?? <span className="text-red-600">sin correo en ficha</span>}
                  {c.consolidado ? ` · ${new Set(c.facturas.map((f) => f.empresa)).size} empresas` : ""}
                  {c.ultimoEnvio ? ` · último cobro ${fechaCorta(c.ultimoEnvio)}` : ""}
                </div>
              </div>
              {c.formaPago ? (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    c.formaPago === "S"
                      ? "border border-violet-200 bg-violet-50 text-violet-700"
                      : "border border-sky-200 bg-sky-50 text-sky-700"
                  }`}
                >
                  {c.formaPago === "S" ? "Suscripción" : "Transfiere"}
                </span>
              ) : null}
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {c.docs} doc{c.docs === 1 ? "" : "s"}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{montoCLP(Math.round(c.total))}</span>
            </button>
          ))
        )}
      </div>

      <Sheet open={!!fichaId} onOpenChange={(o) => !o && setFichaId(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:!max-w-lg">
          {ficha ? (
            <>
              <SheetHeader className="border-b">
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle className="text-base leading-snug">
                    {modo === "suscripcion" ? "Suscripción" : "Cobranza"} · {ficha.razon_social}
                  </SheetTitle>
                  <button
                    type="button"
                    onClick={() => setFichaId(null)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Cerrar"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <SheetDescription className="sr-only">Detalle de la deuda y correo</SheetDescription>
              </SheetHeader>

              <div className="space-y-5 p-4">
                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-xs">
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Destinatarios
                  </div>
                  <div>
                    <span className="font-semibold">Para:</span>{" "}
                    {ficha.correo ?? (
                      <span className="text-red-600">sin correo — cárgalo en la ficha del cliente</span>
                    )}
                  </div>
                  {ficha.correosCC.length > 0 ? (
                    <div>
                      <span className="font-semibold">En copia:</span> {ficha.correosCC.join(", ")}
                    </div>
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-2 pt-0.5">
                    <input
                      type="checkbox"
                      checked={copiaMi}
                      onChange={(e) => setCopiaMi(e.target.checked)}
                      className="size-3.5"
                    />
                    <span>Enviarme copia (frodriguez@rstaxlegal.cl)</span>
                  </label>
                  <p className="pt-0.5 text-muted-foreground">
                    {modo === "suscripcion"
                      ? "Avisa el problema de cobro de la suscripción e indica los datos de cuenta para regularizar. Se adjuntan los PDF seleccionados."
                      : "El correo sale a tu nombre. Se adjuntan los PDF seleccionados."}
                  </p>
                </div>

                <div>
                  <label className={labelClase}>Mensaje (editable)</label>
                  <textarea
                    value={intro}
                    onChange={(e) => setIntro(e.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Debajo se agrega automáticamente el detalle de la deuda, el total y los datos de cuenta.
                  </p>
                </div>

                <div>
                  <label className={labelClase}>Detalle de la deuda ({nSel} de {ficha.facturas.length})</label>
                  <div className="overflow-hidden rounded-lg border">
                    {ficha.facturas.map((f) => (
                      <label
                        key={f.id}
                        className="flex cursor-pointer items-center gap-2 border-b px-2.5 py-1.5 text-xs last:border-b-0 hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={seleccion.has(f.id)}
                          onChange={() => toggleFactura(f.id)}
                          className="size-3.5"
                        />
                        <span className="w-16 shrink-0 font-mono text-muted-foreground">N° {f.folio}</span>
                        <span className="flex-1 truncate">
                          {ficha.consolidado ? `${f.empresa} · ${f.periodo}` : f.periodo}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">{montoCLP(Math.round(f.monto))}</span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between bg-muted/40 px-2.5 py-1.5 text-xs font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">{montoCLP(Math.round(totalSel))}</span>
                    </div>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Paperclip className="size-3" /> {nSel} PDF se adjuntará{nSel === 1 ? "" : "n"} al correo.
                  </p>
                </div>

                <div>
                  <label className={labelClase}>Datos de cuenta (editable)</label>
                  <textarea
                    value={cuenta}
                    onChange={(e) => setCuenta(e.target.value)}
                    rows={5}
                    className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-xs shadow-xs focus:outline-2 focus:outline-ring/50"
                  />
                </div>

                {modo === "transfiere" && ficha.planLink ? (
                  <label className="flex items-start gap-2 rounded-lg border bg-white p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={invitar}
                      onChange={(e) => setInvitar(e.target.checked)}
                      className="mt-0.5 size-3.5"
                    />
                    <span>
                      Invitar a la <span className="font-semibold">suscripción de pago automático</span>
                      {ficha.planNombre ? ` (${ficha.planNombre})` : ""}.
                    </span>
                  </label>
                ) : null}

                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Historial de cobros ({ficha.envios.length})
                  </h4>
                  {ficha.envios.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin cobros enviados aún.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border">
                      {ficha.envios.map((e, i) => (
                        <div
                          key={`${e.created_at}-${i}`}
                          className="flex items-center gap-2 border-b px-2.5 py-1.5 text-xs last:border-b-0"
                        >
                          <span className="w-24 shrink-0 font-medium text-teal-700">{fechaCorta(e.created_at)}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {e.docs} doc{e.docs === 1 ? "" : "s"}
                            {e.correo ? ` · ${e.correo}` : ""}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums">{montoCLP(Math.round(e.total))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <div className="flex gap-2 border-t pt-4">
                  <Button size="sm" onClick={enviar} disabled={enviando || !ficha.correo || nSel === 0}>
                    <Mail className="size-4" />
                    {enviando
                      ? "Enviando…"
                      : modo === "suscripcion"
                        ? "Enviar aviso de suscripción"
                        : "Enviar cobranza"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFichaId(null)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
