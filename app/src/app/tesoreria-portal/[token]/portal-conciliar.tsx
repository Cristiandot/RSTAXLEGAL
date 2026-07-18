"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Loader2, Undo2, Zap } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import type { Sugerencia } from "@/lib/banco/conciliacion";

export type MovPortal = {
  id: string;
  fecha: string;
  glosa: string | null;
  abono: number;
  cargo: number;
  estado: string;
};

async function llamar(body: Record<string, unknown>) {
  const res = await fetch("/api/tesoreria/conciliacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Conciliación autoservicio del cliente: mismas reglas que el panel interno
 * (lib compartida), acotado a su empresa por el token.
 */
export function PortalConciliar({
  token,
  movimientos,
  cuentas,
  pendientes,
}: {
  token: string;
  movimientos: MovPortal[];
  cuentas: { id: string; alias: string }[];
  pendientes: number;
}) {
  const router = useRouter();
  const [expandido, setExpandido] = useState<string | null>(null);
  const [sugs, setSugs] = useState<Record<string, Sugerencia[] | "cargando">>({});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function toggle(m: MovPortal) {
    if (expandido === m.id) {
      setExpandido(null);
      return;
    }
    setExpandido(m.id);
    if (!sugs[m.id]) {
      setSugs((s) => ({ ...s, [m.id]: "cargando" }));
      const res = await llamar({ token, accion: "sugerencias", movimientoId: m.id });
      setSugs((s) => ({ ...s, [m.id]: res.sugerencias ?? [] }));
    }
  }

  async function accion(body: Record<string, unknown>, exito?: string) {
    setOcupado(true);
    setMsg(null);
    const res = await llamar({ token, ...body });
    setOcupado(false);
    if (!res.ok) setMsg({ ok: false, texto: res.error ?? "No se pudo completar la acción." });
    else {
      if (exito) setMsg({ ok: true, texto: exito });
      setExpandido(null);
      setSugs({});
      router.refresh();
    }
    return res;
  }

  async function auto() {
    setOcupado(true);
    setMsg(null);
    let conciliados = 0;
    let revisar = 0;
    for (const c of cuentas) {
      const res = await llamar({ token, accion: "auto", cuentaId: c.id });
      if (res.ok) {
        conciliados += res.conciliados ?? 0;
        revisar += res.revisar ?? 0;
      }
    }
    setOcupado(false);
    setMsg({ ok: true, texto: `Cruce automático: ${conciliados} conciliados · ${revisar} para revisar.` });
    setSugs({});
    router.refresh();
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Movimientos y conciliación</h2>
        {pendientes > 0 && cuentas.length > 0 && (
          <button
            onClick={auto}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Conciliar automáticamente
          </button>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Cruza cada movimiento del banco con tus facturas del SII. Lo que calce sin duda se concilia
        solo; el resto lo confirmas tú (y te apoyamos nosotros).
      </p>

      {msg && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      <div className="card-soft mt-3 overflow-hidden rounded-xl bg-card">
        {movimientos.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aún no hay movimientos. Sube tu cartola para empezar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Glosa</th>
                <th className="px-4 py-2 text-right">Cargo</th>
                <th className="px-4 py-2 text-right">Abono</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const abierto = expandido === m.id;
                const sug = sugs[m.id];
                return (
                  <Fragment key={m.id}>
                    <tr className={`border-b border-border/60 last:border-0 ${m.estado === "ignorado" ? "opacity-60" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatFecha(m.fecha)}</td>
                      <td className="px-4 py-2">{m.glosa || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-600">
                        {m.cargo > 0 ? formatMonto(m.cargo) : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                        {m.abono > 0 ? formatMonto(m.abono) : ""}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {m.estado === "conciliado"
                          ? "Conciliado"
                          : m.estado === "parcial"
                            ? "Parcial"
                            : m.estado === "ignorado"
                              ? "Sin documento"
                              : "Por conciliar"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m.estado === "pendiente" ? (
                          <button
                            onClick={() => toggle(m)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                          >
                            Conciliar
                            <ChevronDown className={`h-3.5 w-3.5 transition ${abierto ? "rotate-180" : ""}`} />
                          </button>
                        ) : (
                          <button
                            onClick={() => accion({ accion: "deshacer", movimientoId: m.id })}
                            disabled={ocupado}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Deshacer
                          </button>
                        )}
                      </td>
                    </tr>
                    {abierto && (
                      <tr className="bg-muted/30">
                        <td colSpan={6} className="p-4">
                          <div className="text-xs font-medium text-muted-foreground">
                            Sugerencias para {formatMonto(Math.abs(m.abono - m.cargo))}
                            {m.cargo > 0 ? " (pago)" : " (cobro)"}
                          </div>
                          {sug === "cargando" ? (
                            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" /> Buscando documentos…
                            </div>
                          ) : sug && sug.length > 0 ? (
                            <div className="mt-2 space-y-1.5">
                              {sug.map((s, i) => (
                                <div
                                  key={`${s.docTipo}-${s.docId}-${i}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                                >
                                  <div className="text-sm">
                                    <span className="font-medium">{s.ref}</span>
                                    <span className="text-muted-foreground"> · {s.contraparte ?? "—"}</span>
                                    <span className="ml-2 tabular-nums text-muted-foreground">
                                      {formatMonto(s.monto)} · {formatFecha(s.fecha)}
                                    </span>
                                    {s.rutMatch ? (
                                      <span className="ml-2 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                                        RUT calza
                                      </span>
                                    ) : s.docTipo === "impuesto" || s.docTipo === "remuneracion" ? (
                                      <span className="ml-2 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
                                        registro del panel
                                      </span>
                                    ) : null}
                                  </div>
                                  <button
                                    onClick={() =>
                                      accion(
                                        {
                                          accion: "conciliar",
                                          movimientoId: m.id,
                                          docTipo: s.docTipo,
                                          docId: s.docId,
                                          docRef: s.ref,
                                          monto: Math.abs(m.abono - m.cargo),
                                        },
                                        "Movimiento conciliado.",
                                      )
                                    }
                                    disabled={ocupado}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Conciliar
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-muted-foreground">
                              No se encontró ningún documento que calce por monto.
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                            <span className="text-xs text-muted-foreground">O marcar como:</span>
                            {(
                              [
                                ["transferencia_interna", "Traspaso entre cuentas"],
                                ["comision", "Comisión / gasto banco"],
                                ["sin_documento", "Sin documento"],
                              ] as const
                            ).map(([cat, label]) => (
                              <button
                                key={cat}
                                onClick={() => accion({ accion: "categorizar", movimientoId: m.id, categoria: cat })}
                                disabled={ocupado}
                                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted/50 disabled:opacity-50"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
