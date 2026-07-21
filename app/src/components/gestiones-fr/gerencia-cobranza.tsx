"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, Paperclip, Search, X } from "lucide-react";
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

const INTRO_DEFECTO =
  "Estimados,\n\nJunto con saludar, compartimos el estado de cuenta de los honorarios pendientes de pago a la fecha. Agradeceremos regularizar el saldo indicado; se adjuntan las facturas correspondientes.\n\nQuedamos atentos a cualquier consulta.";

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Convierte el texto del intro (párrafos separados por línea en blanco) a HTML. */
function introAHtml(texto: string): string {
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escaparHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function TabCobranza({
  cobranza,
  recargar,
}: {
  cobranza: CobranzaCliente[];
  recargar: () => Promise<void>;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  // Estado de la ficha abierta
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [intro, setIntro] = useState(INTRO_DEFECTO);
  const [invitar, setInvitar] = useState(true);

  const ficha = fichaId ? (cobranza.find((c) => c.cliente_id === fichaId) ?? null) : null;

  const filtrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cobranza;
    return cobranza.filter((c) => `${c.razon_social} ${c.correo ?? ""}`.toLowerCase().includes(q));
  }, [cobranza, busqueda]);

  const totalGlobal = useMemo(() => cobranza.reduce((s, c) => s + c.total, 0), [cobranza]);

  function abrir(c: CobranzaCliente) {
    setFichaId(c.cliente_id);
    setSeleccion(new Set(c.facturas.map((f) => f.id)));
    setIntro(INTRO_DEFECTO);
    setInvitar(!c.suscrito && !!c.planLink);
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
        introHtml: introAHtml(intro),
        planNombre: invitar ? ficha.planNombre : null,
        planLink: invitar ? ficha.planLink : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo enviar la cobranza.");
        return;
      }
      toast.success(`Cobranza enviada a ${res.enviadoA}.`);
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente o correo…"
          className="pl-8"
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {filtrada.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {cobranza.length === 0 ? "No hay facturas impagas. 🎉" : "Sin coincidencias."}
          </p>
        ) : (
          filtrada.map((c) => (
            <div key={c.cliente_id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.razon_social}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {c.correo ?? <span className="text-red-600">sin correo en ficha</span>}
                  {c.suscrito ? " · suscrito" : ""}
                  {c.ultimoEnvio ? ` · último cobro ${fechaCorta(c.ultimoEnvio)}` : ""}
                </div>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{c.docs} doc{c.docs === 1 ? "" : "s"}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{montoCLP(Math.round(c.total))}</span>
              <Button size="sm" variant="outline" onClick={() => abrir(c)} className="shrink-0">
                <Mail className="size-4" />
                Preparar
              </Button>
            </div>
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
                    Cobranza · {ficha.razon_social}
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
                <SheetDescription className="sr-only">Preparar correo de cobranza</SheetDescription>
              </SheetHeader>

              <div className="space-y-5 p-4">
                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <span className="font-semibold">Destinatario:</span>{" "}
                  {ficha.correo ?? <span className="text-red-600">sin correo — cárgalo en la ficha del cliente</span>}
                  <br />
                  <span className="text-muted-foreground">
                    El correo sale a tu nombre, con copia a tu buzón. Se adjuntan los PDF de las facturas seleccionadas.
                  </span>
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
                    Debajo del mensaje se agrega automáticamente el detalle de las facturas y el total.
                  </p>
                </div>

                <div>
                  <label className={labelClase}>Facturas a cobrar ({nSel} de {ficha.facturas.length})</label>
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
                        <span className="flex-1 truncate">{f.periodo}</span>
                        <span className="shrink-0 font-medium tabular-nums">{montoCLP(Math.round(f.monto))}</span>
                      </label>
                    ))}
                    <div className="flex items-center justify-between bg-muted/40 px-2.5 py-1.5 text-xs font-semibold">
                      <span>Total a cobrar</span>
                      <span className="tabular-nums">{montoCLP(Math.round(totalSel))}</span>
                    </div>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Paperclip className="size-3" /> {nSel} PDF se adjuntará{nSel === 1 ? "" : "n"} al correo.
                  </p>
                </div>

                {ficha.planLink ? (
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
                      {ficha.suscrito ? (
                        <span className="text-amber-700"> Este cliente ya figura como suscrito.</span>
                      ) : null}
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
                    {enviando ? "Enviando…" : `Enviar cobranza`}
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
