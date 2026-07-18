"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Loader2, Undo2, Zap, Search, X } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import type { Sugerencia, ParConciliacion } from "@/lib/banco/conciliacion";

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

const claveDoc = (s: Sugerencia) => `${s.docTipo}:${s.docId ?? s.ref}`;

function BadgeSug({ s }: { s: Sugerencia }) {
  const cls =
    "ml-2 rounded border px-1.5 py-0.5 text-[11px] " +
    (s.parcial
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : s.rutMatch
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : s.folioMatch
          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
          : s.docTipo === "impuesto" || s.docTipo === "remuneracion"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : "border-border bg-muted text-muted-foreground");
  const texto = s.parcial
    ? "abono parcial"
    : s.rutMatch
      ? "RUT calza"
      : s.folioMatch
        ? "folio en glosa"
        : s.docTipo === "impuesto" || s.docTipo === "remuneracion"
          ? "registro del panel"
          : "resultado búsqueda";
  return <span className={cls}>{texto}</span>;
}

/**
 * Banco de trabajo de conciliación del cliente (patrones Chipax): pestañas
 * Por conciliar / Sugerencias / Conciliados, búsqueda de movimientos, búsqueda
 * manual de documentos (folio/nombre/monto), conciliación multidocumento
 * (un movimiento contra varias facturas) y "Conciliar todas" las sugerencias.
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
  const [tab, setTab] = useState<"pendientes" | "sugerencias" | "conciliados" | "todos">("pendientes");
  const [buscarMov, setBuscarMov] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [sugs, setSugs] = useState<Record<string, Sugerencia[] | "cargando">>({});
  const [busqueda, setBusqueda] = useState<Record<string, { q: string; resultados: Sugerencia[] | "cargando" | null }>>({});
  const [seleccion, setSeleccion] = useState<Record<string, Sugerencia>>({}); // del movimiento expandido
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Pestaña Sugerencias (pares del cruce, sin conciliar aún)
  const [pares, setPares] = useState<ParConciliacion[] | "cargando" | null>(null);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const q = buscarMov.trim().toLowerCase();
    return movimientos.filter((m) => {
      if (tab === "pendientes" && m.estado !== "pendiente") return false;
      if (tab === "conciliados" && m.estado !== "conciliado" && m.estado !== "parcial") return false;
      if (q) {
        const hay = `${m.glosa ?? ""} ${m.abono || m.cargo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [movimientos, tab, buscarMov]);

  async function abrirSugerencias() {
    setTab("sugerencias");
    if (pares === null) {
      setPares("cargando");
      const res = await llamar({ token, accion: "sugerencias_lote" });
      setPares(res.ok ? (res.pares ?? []) : []);
    }
  }

  async function toggle(m: MovPortal) {
    if (expandido === m.id) {
      setExpandido(null);
      return;
    }
    setExpandido(m.id);
    setSeleccion({});
    if (!sugs[m.id]) {
      setSugs((s) => ({ ...s, [m.id]: "cargando" }));
      const res = await llamar({ token, accion: "sugerencias", movimientoId: m.id });
      setSugs((s) => ({ ...s, [m.id]: res.sugerencias ?? [] }));
    }
  }

  async function buscarDocs(m: MovPortal) {
    const q = busqueda[m.id]?.q ?? "";
    if (q.trim().length < 2) return;
    setBusqueda((b) => ({ ...b, [m.id]: { q, resultados: "cargando" } }));
    const res = await llamar({ token, accion: "buscar", movimientoId: m.id, q });
    setBusqueda((b) => ({ ...b, [m.id]: { q, resultados: res.sugerencias ?? [] } }));
  }

  async function refrescar(exito?: string) {
    if (exito) setMsg({ ok: true, texto: exito });
    setExpandido(null);
    setSugs({});
    setSeleccion({});
    setPares(null);
    setDescartados(new Set());
    router.refresh();
  }

  async function conciliarUno(m: MovPortal, s: Sugerencia) {
    setOcupado(true);
    setMsg(null);
    const movMonto = Math.abs(m.abono - m.cargo);
    const res = await llamar({
      token,
      accion: "conciliar",
      movimientoId: m.id,
      docTipo: s.docTipo,
      docId: s.docId,
      docRef: s.ref,
      monto: Math.min(movMonto, s.monto),
    });
    setOcupado(false);
    if (!res.ok) setMsg({ ok: false, texto: res.error ?? "No se pudo conciliar." });
    else await refrescar("Movimiento conciliado.");
  }

  // Multidocumento (patrón Chipax): un movimiento contra varios documentos.
  async function conciliarSeleccion(m: MovPortal) {
    const docs = Object.values(seleccion);
    if (!docs.length) return;
    setOcupado(true);
    setMsg(null);
    let restante = Math.abs(m.abono - m.cargo);
    for (const s of docs) {
      if (restante <= 0) break;
      const asignar = Math.min(restante, s.monto);
      const res = await llamar({
        token,
        accion: "conciliar",
        movimientoId: m.id,
        docTipo: s.docTipo,
        docId: s.docId,
        docRef: s.ref,
        monto: asignar,
      });
      if (!res.ok) {
        setMsg({ ok: false, texto: res.error ?? "No se pudo conciliar." });
        setOcupado(false);
        return;
      }
      restante -= asignar;
    }
    setOcupado(false);
    await refrescar(`Movimiento conciliado contra ${docs.length} documento${docs.length !== 1 ? "s" : ""}.`);
  }

  async function accionSimple(body: Record<string, unknown>, exito?: string) {
    setOcupado(true);
    setMsg(null);
    const res = await llamar({ token, ...body });
    setOcupado(false);
    if (!res.ok) setMsg({ ok: false, texto: res.error ?? "No se pudo completar la acción." });
    else await refrescar(exito);
  }

  async function conciliarAutoTodas() {
    setOcupado(true);
    setMsg(null);
    let conciliados = 0;
    for (const c of cuentas) {
      const res = await llamar({ token, accion: "auto", cuentaId: c.id });
      if (res.ok) conciliados += res.conciliados ?? 0;
    }
    setOcupado(false);
    await refrescar(`Cruce automático: ${conciliados} movimientos conciliados.`);
  }

  // "Conciliar todas" las sugerencias no descartadas (patrón Chipax).
  async function conciliarTodas() {
    if (!Array.isArray(pares)) return;
    const lista = pares.filter((p) => !descartados.has(p.movimientoId));
    if (!lista.length) return;
    setOcupado(true);
    setMsg(null);
    let hechas = 0;
    for (const p of lista) {
      const res = await llamar({
        token,
        accion: "conciliar",
        movimientoId: p.movimientoId,
        docTipo: p.docTipo,
        docId: p.docId,
        docRef: p.docRef,
        monto: p.monto,
      });
      if (res.ok) hechas++;
    }
    setOcupado(false);
    await refrescar(`${hechas} sugerencia${hechas !== 1 ? "s" : ""} conciliada${hechas !== 1 ? "s" : ""}.`);
  }

  function toggleSel(s: Sugerencia) {
    setSeleccion((sel) => {
      const k = claveDoc(s);
      const nuevo = { ...sel };
      if (nuevo[k]) delete nuevo[k];
      else nuevo[k] = s;
      return nuevo;
    });
  }

  const nParesVivos = Array.isArray(pares) ? pares.filter((p) => !descartados.has(p.movimientoId)).length : null;

  const TABS: { id: typeof tab; label: string }[] = [
    { id: "pendientes", label: `Por conciliar (${pendientes})` },
    { id: "sugerencias", label: `Sugerencias${nParesVivos != null ? ` (${nParesVivos})` : ""}` },
    { id: "conciliados", label: "Conciliados" },
    { id: "todos", label: "Todos" },
  ];

  function renderFilaSugerencia(m: MovPortal, s: Sugerencia, key: string) {
    const k = claveDoc(s);
    return (
      <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!seleccion[k]}
            onChange={() => toggleSel(s)}
            className="size-4 accent-[var(--brand-teal,#17a2b8)]"
          />
          <span className="min-w-0">
            <span className="font-medium">{s.ref}</span>
            <span className="text-muted-foreground"> · {s.contraparte ?? "—"}</span>
            <span className="ml-2 tabular-nums text-muted-foreground">
              {formatMonto(s.monto)} · {formatFecha(s.fecha)}
            </span>
            <BadgeSug s={s} />
          </span>
        </label>
        <button
          onClick={() => conciliarUno(m, s)}
          disabled={ocupado}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" /> Conciliar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Movimientos y conciliación</h2>
        {pendientes > 0 && cuentas.length > 0 && (
          <button
            onClick={conciliarAutoTodas}
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

      {/* Pestañas (cola de trabajo) */}
      <nav className="mt-3 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => (t.id === "sugerencias" ? abrirSugerencias() : setTab(t.id))}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-[var(--brand-teal,#17a2b8)] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {msg && (
        <div
          className={`mt-3 rounded-lg border p-3 text-sm ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </div>
      )}

      {/* ── Pestaña Sugerencias: pares movimiento ↔ documento, estilo Chipax ── */}
      {tab === "sugerencias" ? (
        <div className="mt-3">
          {pares === "cargando" || pares === null ? (
            <div className="card-soft flex items-center gap-2 rounded-xl bg-card p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando coincidencias…
            </div>
          ) : nParesVivos === 0 ? (
            <div className="card-soft rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
              No hay sugerencias pendientes: lo que calzaba sin duda ya está conciliado o descartado.
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Revisa cada par y descarta lo que no corresponda; el resto se concilia de una vez.
                </span>
                <button
                  onClick={conciliarTodas}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Conciliar todas ({nParesVivos})
                </button>
              </div>
              <div className="space-y-1.5">
                {(pares as ParConciliacion[])
                  .filter((p) => !descartados.has(p.movimientoId))
                  .map((p) => (
                    <div
                      key={p.movimientoId}
                      className="card-soft grid grid-cols-1 items-center gap-2 rounded-xl bg-card px-3 py-2 sm:grid-cols-[1fr_auto_1fr_auto]"
                    >
                      <div className="min-w-0 text-sm">
                        <span className="block truncate">{p.movGlosa || "—"}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">
                          {formatFecha(p.movFecha)} · {p.esCargo ? "−" : "+"}
                          {formatMonto(p.monto)}
                        </span>
                      </div>
                      <span className="hidden text-muted-foreground sm:block">⇄</span>
                      <div className="min-w-0 text-sm">
                        <span className="block truncate font-medium">{p.docRef}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.contraparte}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 justify-self-end">
                        <button
                          onClick={() =>
                            llamar({
                              token,
                              accion: "conciliar",
                              movimientoId: p.movimientoId,
                              docTipo: p.docTipo,
                              docId: p.docId,
                              docRef: p.docRef,
                              monto: p.monto,
                            }).then(() => refrescar("Sugerencia conciliada."))
                          }
                          disabled={ocupado}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Conciliar
                        </button>
                        <button
                          onClick={() => setDescartados((d) => new Set(d).add(p.movimientoId))}
                          disabled={ocupado}
                          title="Descartar esta sugerencia"
                          className="rounded-md border border-border p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Búsqueda de movimientos */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={buscarMov}
                onChange={(e) => setBuscarMov(e.target.value)}
                placeholder="Buscar por glosa o monto…"
                className="h-9 w-64 rounded-md border border-input bg-card pl-8 pr-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <span className="text-sm text-muted-foreground">{filtrados.length} movimientos</span>
          </div>

          <div className="card-soft mt-3 overflow-hidden rounded-xl bg-card">
            {filtrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {movimientos.length === 0
                  ? "Aún no hay movimientos. Sube tu cartola para empezar."
                  : "Sin movimientos para este filtro."}
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
                  {filtrados.map((m) => {
                    const abierto = expandido === m.id;
                    const sug = sugs[m.id];
                    const bus = busqueda[m.id];
                    const nSel = abierto ? Object.keys(seleccion).length : 0;
                    const sumaSel = abierto
                      ? Object.values(seleccion).reduce((a, s) => a + s.monto, 0)
                      : 0;
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
                            {m.estado === "pendiente" || m.estado === "parcial" ? (
                              <button
                                onClick={() => toggle(m)}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/50"
                              >
                                Conciliar
                                <ChevronDown className={`h-3.5 w-3.5 transition ${abierto ? "rotate-180" : ""}`} />
                              </button>
                            ) : (
                              <button
                                onClick={() => accionSimple({ accion: "deshacer", movimientoId: m.id })}
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
                                {m.cargo > 0 ? " (pago)" : " (cobro)"} — marca varias para conciliar contra
                                más de un documento
                              </div>

                              {sug === "cargando" ? (
                                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando documentos…
                                </div>
                              ) : sug && sug.length > 0 ? (
                                <div className="mt-2 space-y-1.5">
                                  {sug.map((s, i) => (
                                    renderFilaSugerencia(m, s, `${claveDoc(s)}-${i}`)
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-2 text-sm text-muted-foreground">
                                  No se encontró ningún documento que calce por monto.
                                </div>
                              )}

                              {/* Búsqueda manual de documentos (folio / nombre / monto) */}
                              <div className="mt-3 border-t border-border pt-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-muted-foreground">¿No está? Búscalo:</span>
                                  <input
                                    value={bus?.q ?? ""}
                                    onChange={(e) =>
                                      setBusqueda((b) => ({
                                        ...b,
                                        [m.id]: { q: e.target.value, resultados: b[m.id]?.resultados ?? null },
                                      }))
                                    }
                                    onKeyDown={(e) => e.key === "Enter" && buscarDocs(m)}
                                    placeholder="Folio, proveedor/cliente o monto…"
                                    className="h-8 w-64 rounded-md border border-input bg-card px-2.5 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  />
                                  <button
                                    onClick={() => buscarDocs(m)}
                                    disabled={ocupado || (bus?.q ?? "").trim().length < 2}
                                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-40"
                                  >
                                    <Search className="h-3.5 w-3.5" /> Buscar documento
                                  </button>
                                </div>
                                {bus?.resultados === "cargando" ? (
                                  <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
                                  </div>
                                ) : Array.isArray(bus?.resultados) ? (
                                  bus.resultados.length > 0 ? (
                                    <div className="mt-2 space-y-1.5">
                                      {bus.resultados.map((s, i) => (
                                        renderFilaSugerencia(m, s, `b-${claveDoc(s)}-${i}`)
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-sm text-muted-foreground">Sin resultados para esa búsqueda.</div>
                                  )
                                ) : null}
                              </div>

                              {/* Barra multidocumento */}
                              {nSel > 0 && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--brand-teal,#17a2b8)]/40 bg-card px-3 py-2">
                                  <span className="text-sm">
                                    {nSel} documento{nSel !== 1 ? "s" : ""} seleccionado{nSel !== 1 ? "s" : ""} ·{" "}
                                    <span className="font-medium tabular-nums">{formatMonto(sumaSel)}</span> de{" "}
                                    <span className="tabular-nums">{formatMonto(Math.abs(m.abono - m.cargo))}</span> del movimiento
                                  </span>
                                  <button
                                    onClick={() => conciliarSeleccion(m)}
                                    disabled={ocupado}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                  >
                                    <Check className="h-3.5 w-3.5" /> Conciliar seleccionados
                                  </button>
                                </div>
                              )}

                              {/* Categorizar (no va contra documento) */}
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
                                    onClick={() => accionSimple({ accion: "categorizar", movimientoId: m.id, categoria: cat })}
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
        </>
      )}
    </div>
  );
}
