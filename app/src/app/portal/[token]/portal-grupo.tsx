"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, Home, LayoutGrid } from "lucide-react";
import { PortalCliente } from "@/app/solicitud/[token]/portal";
import { type InfoEmpresa } from "@/app/solicitud/[token]/solicitud-form";

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
}: {
  grupo: string;
  empresas: EmpresaCargada[];
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
      {/* Logo de la oficina arriba-izquierda, sobre el nombre del grupo */}
      <div className="space-y-3">
        <Image
          src="/logo-claro.png"
          alt="Rodríguez Samith Tax & Legal"
          width={200}
          height={56}
          priority
          className="h-auto w-[150px] sm:w-[180px]"
        />
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {grupo}
          </h1>
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
