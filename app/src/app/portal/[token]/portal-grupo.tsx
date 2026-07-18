"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Building2, Home, LayoutGrid, KeyRound, Loader2, Check } from "lucide-react";
import { PortalCliente } from "@/app/solicitud/[token]/portal";
import { TesoreriaBoton } from "@/app/solicitud/[token]/tesoreria-boton";
import { type InfoEmpresa } from "@/app/solicitud/[token]/solicitud-form";
import { cambiarPinPortal } from "./portal-auth";

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
}: {
  grupo: string;
  empresas: EmpresaCargada[];
  /** Slug del portal (si se entró por link con PIN). Habilita "Cambiar PIN". */
  slug?: string | null;
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
            {empresas.map((e) => (
              <TesoreriaBoton key={e.meta.token} token={e.meta.token} />
            ))}
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
            Selecciona la empresa para ver y completar su información.
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
        <ResumenGrupo empresas={ordenadas} />
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

/**
 * Resumen del grupo (contenido a definir). Por ahora, tarjetas por empresa con
 * lo básico, como placeholder navegable.
 */
function ResumenGrupo({ empresas }: { empresas: EmpresaCargada[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {empresas.map((e) => (
          <div key={e.meta.token} className="card-soft rounded-xl bg-card p-4">
            <div className="flex items-center gap-2">
              {esCasaParticular(e.meta) ? (
                <Home className="size-4 text-[var(--brand-teal)]" />
              ) : (
                <Building2 className="size-4 text-[var(--brand-teal)]" />
              )}
              <p className="font-medium">{etiquetaEmpresa(e.meta)}</p>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.meta.rut_empresa ? `RUT ${e.meta.rut_empresa}` : "Sin RUT"}
            </p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Resumen del grupo — en construcción.
      </p>
    </div>
  );
}
