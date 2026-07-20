"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import {
  Building2, Home, LayoutGrid, KeyRound, Loader2, Check, ChevronDown, Pencil,
  History, FileText, MessageCircle, Mail,
} from "lucide-react";
import { PortalCliente } from "@/app/solicitud/[token]/portal";
import { TesoreriaBotonGrupo } from "@/app/solicitud/[token]/tesoreria-boton";
import { DatosEmpresa } from "@/app/solicitud/[token]/datos-empresa";
import { cargarEmpresaDetalle } from "@/app/solicitud/[token]/datos-actions";
import { type InfoEmpresa } from "@/app/solicitud/[token]/solicitud-form";
import { formatFecha } from "@/lib/format";
import { cambiarPinPortal, cargarBitacoraGrupo, type BitacoraItem } from "./portal-auth";

export type EmpresaMeta = {
  token: string;
  razon_social: string;
  rut_empresa: string | null;
  tipo_cliente: string | null;
  hace_f29: boolean;
  hace_liquidaciones: boolean;
  hace_contabilidad_completa: boolean;
};

export type EmpresaCargada = { meta: EmpresaMeta; info: InfoEmpresa };

const esCasaParticular = (m: EmpresaMeta) => m.tipo_cliente === "casa_particular";

/** Etiqueta del chip: casa particular se muestra como "Asesora del hogar". */
function etiquetaEmpresa(m: EmpresaMeta): string {
  return esCasaParticular(m) ? "Asesora del hogar" : m.razon_social;
}

/**
 * Portal por grupo: un solo link para el cliente, con selector de sus empresas.
 * Delega el render de cada empresa en el PortalCliente existente (token propio).
 * "Todas" muestra el resumen del grupo; la casa particular va al final.
 */
export function PortalGrupo({
  grupo,
  empresas,
  slug,
  grupoToken,
}: {
  grupo: string;
  empresas: EmpresaCargada[];
  /** Slug del portal (si se entró por link con PIN). Habilita "Cambiar PIN". */
  slug?: string | null;
  /** Token del grupo (para cargar la bitácora de gestiones). */
  grupoToken?: string | null;
}) {
  // Orden: empresas primero (como vienen, alfabético), casa particular al final.
  const ordenadas = [
    ...empresas.filter((e) => !esCasaParticular(e.meta)),
    ...empresas.filter((e) => esCasaParticular(e.meta)),
  ];

  // "todas" = resumen del grupo; o el índice de una empresa en `ordenadas`.
  const [sel, setSel] = useState<"todas" | number>("todas");

  const chipBase =
    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition";
  const chipOn = "bg-primary text-primary-foreground shadow-sm";
  const chipOff = "bg-muted text-muted-foreground hover:text-foreground";

  return (
    <div className="space-y-5">
      {/* Logo de la oficina arriba-izquierda; arriba a la derecha el acceso de
          prueba a la conciliación bancaria (solo empresas con tesorería activa) */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Image
            src="/logo-claro.png"
            alt="Rodríguez Samith Tax & Legal"
            width={200}
            height={56}
            priority
            className="h-auto w-[150px] sm:w-[180px]"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <TesoreriaBotonGrupo tokens={empresas.map((e) => e.meta.token)} />
          </div>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {grupo}
            </h1>
            {slug ? <CambiarPin slug={slug} /> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            En «Todas» administras los datos de tus empresas. Selecciona una para
            ver su información.
          </p>
        </div>
      </div>

      {/* Selector: Todas + empresas (casa particular al final) */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSel("todas")}
          className={`${chipBase} ${sel === "todas" ? chipOn : chipOff}`}
        >
          <LayoutGrid className="size-4" />
          Todas
        </button>
        {ordenadas.map((e, i) => (
          <button
            key={e.meta.token}
            onClick={() => setSel(i)}
            className={`${chipBase} ${sel === i ? chipOn : chipOff}`}
          >
            {esCasaParticular(e.meta) ? (
              <Home className="size-4" />
            ) : (
              <Building2 className="size-4" />
            )}
            {etiquetaEmpresa(e.meta)}
          </button>
        ))}
      </div>

      {sel === "todas" ? (
        <TablaEmpresas empresas={ordenadas} grupoToken={grupoToken} />
      ) : (
        <PortalCliente
          key={ordenadas[sel].meta.token}
          token={ordenadas[sel].meta.token}
          empresa={{
            ...ordenadas[sel].info,
            trabajadores: ordenadas[sel].info.trabajadores ?? [],
          }}
          embedded
        />
      )}
    </div>
  );
}

/**
 * "Cambiar PIN" del cliente, junto al nombre del grupo. Pide el PIN actual y el
 * nuevo (con confirmación). No afecta el acceso interno de la oficina (por token
 * sin PIN). Panel inline para no depender de un modal.
 */
function CambiarPin({ slug }: { slug: string }) {
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, startGuardar] = useTransition();

  const soloDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  function guardar() {
    setMsg(null);
    if (!/^\d{4}$/.test(nuevo)) {
      setMsg({ tipo: "error", texto: "El PIN nuevo debe ser de 4 dígitos." });
      return;
    }
    if (nuevo !== confirma) {
      setMsg({ tipo: "error", texto: "El PIN nuevo y su confirmación no coinciden." });
      return;
    }
    startGuardar(async () => {
      const r = await cambiarPinPortal(slug, actual, nuevo);
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "PIN actualizado. Úsalo la próxima vez que ingreses." });
        setActual("");
        setNuevo("");
        setConfirma("");
      } else {
        setMsg({ tipo: "error", texto: r.error ?? "No se pudo cambiar el PIN." });
      }
    });
  }

  const inputCls =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.3em] tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setAbierto((v) => !v); setMsg(null); }}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        <KeyRound className="size-3.5" />
        Cambiar PIN
      </button>

      {abierto ? (
        <div className="card-soft absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-lg">
          <p className="mb-3 text-sm font-medium">Cambiar PIN de acceso</p>
          <div className="flex flex-col gap-2.5">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              PIN actual
              <input
                type="password" inputMode="numeric" autoComplete="off"
                value={actual} onChange={(e) => setActual(soloDigitos(e.target.value))}
                placeholder="••••" className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              PIN nuevo
              <input
                type="password" inputMode="numeric" autoComplete="off"
                value={nuevo} onChange={(e) => setNuevo(soloDigitos(e.target.value))}
                placeholder="••••" className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Repetir PIN nuevo
              <input
                type="password" inputMode="numeric" autoComplete="off"
                value={confirma} onChange={(e) => setConfirma(soloDigitos(e.target.value))}
                placeholder="••••" className={inputCls}
              />
            </label>
          </div>

          {msg ? (
            <p
              className={`mt-2 flex items-start gap-1 text-xs ${
                msg.tipo === "ok" ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {msg.tipo === "ok" ? <Check className="mt-0.5 size-3.5 shrink-0" /> : null}
              {msg.texto}
            </p>
          ) : null}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button" onClick={() => setAbierto(false)}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cerrar
            </button>
            <button
              type="button" onClick={guardar}
              disabled={guardando || !actual || !nuevo || !confirma}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Guardar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function colorPct(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 60) return "text-amber-600";
  return "text-red-600";
}
function barPct(pct: number): string {
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-red-500";
}

/**
 * Vista "Todas": tabla adaptable con una fila por empresa (razón social · RUT ·
 * completitud). Cada fila se expande para editar los datos maestros y accesos
 * mediante el editor DatosEmpresa. Es el único lugar donde el cliente ingresa o
 * modifica información de sus empresas.
 */
function TablaEmpresas({ empresas, grupoToken }: { empresas: EmpresaCargada[]; grupoToken?: string | null }) {
  const [pcts, setPcts] = useState<Record<string, number | null>>({});
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargarPct = useCallback((token: string) => {
    void cargarEmpresaDetalle(token).then((r) => {
      setPcts((p) => ({ ...p, [token]: r.ok && r.detalle ? r.detalle.pct : null }));
    });
  }, []);

  useEffect(() => {
    for (const e of empresas) cargarPct(e.meta.token);
  }, [empresas, cargarPct]);

  const cols = "sm:grid sm:grid-cols-[1fr_150px_170px_110px] sm:items-center";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
      {/* Cabecera (solo desde sm) */}
      <div className={`hidden gap-3 px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${cols}`}>
        <span>Empresa</span>
        <span>RUT</span>
        <span>Completitud</span>
        <span className="text-right">Datos</span>
      </div>

      {empresas.map((e) => {
        const token = e.meta.token;
        const pct = pcts[token];
        const cargandoPct = pct === undefined;
        const editando = abierta === token;
        return (
          <div key={token} className="card-soft overflow-hidden rounded-xl bg-card">
            <button
              type="button"
              onClick={() => setAbierta((v) => (v === token ? null : token))}
              className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-muted/40 ${cols}`}
            >
              {/* Empresa */}
              <span className="flex min-w-0 items-center gap-2">
                {esCasaParticular(e.meta) ? (
                  <Home className="size-4 shrink-0 text-[var(--brand-teal)]" />
                ) : (
                  <Building2 className="size-4 shrink-0 text-[var(--brand-teal)]" />
                )}
                <span className="truncate font-medium">{etiquetaEmpresa(e.meta)}</span>
              </span>
              {/* RUT */}
              <span className="text-sm text-muted-foreground">
                {e.meta.rut_empresa ?? "—"}
              </span>
              {/* Completitud */}
              <span className="flex items-center gap-2">
                {cargandoPct ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : pct == null ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${barPct(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className={`text-sm font-semibold ${colorPct(pct)}`}>{pct}%</span>
                  </>
                )}
              </span>
              {/* Acción */}
              <span className="flex items-center justify-end gap-1 text-sm font-medium text-[var(--brand-teal)]">
                <Pencil className="size-3.5" />
                {editando ? "Cerrar" : "Editar"}
                <ChevronDown
                  className={`size-4 transition-transform ${editando ? "rotate-180" : ""}`}
                />
              </span>
            </button>

            {editando ? (
              <div className="border-t border-border bg-muted/20 px-4 py-4">
                <DatosEmpresa token={token} onGuardado={() => cargarPct(token)} />
              </div>
            ) : null}
          </div>
        );
      })}
      </div>
      {grupoToken ? <BitacoraGestiones token={grupoToken} /> : null}
    </div>
  );
}

const ETIQUETA_GESTION: Record<string, string> = {
  contrato: "Contrato nuevo",
  anexo: "Anexo de contrato",
  amonestacion: "Amonestación",
  finiquito: "Finiquito",
  permiso: "Permiso",
  vacaciones: "Vacaciones",
};
function etiquetaGestion(tipo: string | null): string {
  if (!tipo) return "Gestión";
  return ETIQUETA_GESTION[tipo] ?? tipo.charAt(0).toUpperCase() + tipo.slice(1);
}
function canalLabel(canal: string | null): string {
  if (!canal) return "Requerimiento";
  if (/wa|whats/i.test(canal)) return "WhatsApp";
  if (/mail|correo|email/i.test(canal)) return "Correo";
  return canal;
}

/** Bitácora del grupo (vista "Todas"): gestiones RRHH + requerimientos, más recientes primero. */
function BitacoraGestiones({ token }: { token: string }) {
  const [items, setItems] = useState<BitacoraItem[] | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cargarBitacoraGrupo(token).then((r) => {
      if (!vivo) return;
      setItems(r.ok && r.items ? r.items : []);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, [token]);

  return (
    <div className="card-soft rounded-xl bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <History className="size-4 text-[var(--brand-teal)]" />
        <h2 className="font-heading text-base font-semibold">Bitácora de gestiones</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Lo que hemos gestionado para tus empresas — solicitudes laborales y requerimientos, del más reciente al más antiguo.
      </p>
      {cargando ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando…
        </p>
      ) : !items || items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Aún no hay gestiones registradas para tus empresas.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-3 border-b border-border pb-2.5 last:border-0 last:pb-0">
              <span className="mt-0.5 shrink-0 text-[var(--brand-teal)]">
                {it.fuente === "requerimiento" ? (
                  canalLabel(it.canal) === "WhatsApp" ? <MessageCircle className="size-4" /> : <Mail className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium">
                    {it.fuente === "requerimiento" ? it.tipo : etiquetaGestion(it.tipo)}
                  </span>
                  {it.trabajador ? <span className="text-sm text-muted-foreground">· {it.trabajador}</span> : null}
                  {it.empresa ? <span className="text-xs text-muted-foreground">· {it.empresa}</span> : null}
                  {it.fuente === "requerimiento" ? (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800">{canalLabel(it.canal)}</span>
                  ) : null}
                  {it.estado ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                      {it.estado.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
                {it.detalle ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.detalle}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {it.fecha ? formatFecha(it.fecha.slice(0, 10)) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
