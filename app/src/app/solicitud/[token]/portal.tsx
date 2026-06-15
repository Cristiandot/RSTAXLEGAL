"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Building2, PieChart, Users, Receipt, Table2, ClipboardList,
} from "lucide-react";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";
import { DetalleRemuneraciones } from "./remuneraciones";
import { GastosMenores } from "./gastos-menores";
import { FranjaIndicadores } from "./indicadores";
import { Empresa } from "./empresa";
import { Contabilidad } from "./contabilidad";
import { RecursosHumanos } from "./rrhh";

type Tab =
  | "empresa"
  | "contabilidad"
  | "rrhh"
  | "gastos"
  | "remuneraciones"
  | "solicitudes";

const TABS_VALIDOS: Tab[] = [
  "empresa", "contabilidad", "rrhh", "gastos", "remuneraciones", "solicitudes",
];

/**
 * Portal del cliente — menú de pestañas: Empresa (inicio) · Contabilidad ·
 * Recursos humanos · Ingreso gastos menores · Detalle remuneraciones ·
 * Solicitudes laborales. Sobre la marca RSTL, con la franja de indicadores
 * Previred. Cada pestaña carga datos por RPC de token.
 */
export function PortalCliente({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [tab, setTab] = useState<Tab>("empresa");
  const claveTab = `rstl_portal_tab_${token}`;

  // Recordar la pestaña al refrescar (se lee tras montar para no romper la
  // hidratación; el primer render siempre es "empresa").
  useEffect(() => {
    const guardado = localStorage.getItem(claveTab);
    if (guardado && (TABS_VALIDOS as string[]).includes(guardado)) {
      setTab(guardado as Tab);
    }
  }, [claveTab]);

  function irTab(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(claveTab, t);
    } catch {
      // almacenamiento no disponible (modo privado, etc.) — no es crítico
    }
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "empresa", label: "Empresa", icon: <Building2 className="size-4" /> },
    { key: "contabilidad", label: "Contabilidad", icon: <PieChart className="size-4" /> },
    { key: "rrhh", label: "Recursos humanos", icon: <Users className="size-4" /> },
    { key: "remuneraciones", label: "Detalle remuneraciones", icon: <Table2 className="size-4" /> },
    { key: "solicitudes", label: "Solicitudes laborales", icon: <ClipboardList className="size-4" /> },
    { key: "gastos", label: "Ingreso gastos menores", icon: <Receipt className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Encabezado: empresa a la izquierda, logo a la derecha */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {empresa.razon_social}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {empresa.rut_empresa ? `RUT ${empresa.rut_empresa}` : null}
            {empresa.rut_empresa && empresa.giro ? " · " : null}
            {empresa.giro ? empresa.giro : null}
            {(empresa.rut_empresa || empresa.giro) ? " · " : null}
            Portal de la empresa
          </p>
        </div>
        <Image
          src="/logo-claro.png"
          alt="Rodríguez Samith Tax & Legal"
          width={200}
          height={56}
          priority
          className="h-auto w-[130px] shrink-0 sm:w-[180px]"
        />
      </div>

      <FranjaIndicadores token={token} />

      {/* Correos de la oficina (contacto del equipo) */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Correos de la oficina
        </p>
        <div className="space-y-2">
          <a
            href="mailto:admin@rstaxlegal.cl"
            className="block rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 no-underline transition-colors hover:bg-amber-100"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-amber-900">admin@rstaxlegal.cl</span>
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800">
                Principal
              </span>
            </div>
            <p className="mt-0.5 text-xs text-amber-800">
              Lo ve toda la oficina — si necesitas algo, escríbenos aquí.
            </p>
          </a>
          <div className="grid gap-2 sm:grid-cols-2">
            <a href="mailto:frodriguez@rstaxlegal.cl" className="block rounded-md border border-border bg-card px-3 py-2 no-underline transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium text-foreground">Felipe Rodríguez Samith</p>
              <span className="text-xs text-[var(--brand-teal)]">frodriguez@rstaxlegal.cl</span>
            </a>
            <a href="mailto:dtapia@rstaxlegal.cl" className="block rounded-md border border-border bg-card px-3 py-2 no-underline transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium text-foreground">Danilo Tapia Salinas</p>
              <span className="text-xs text-[var(--brand-teal)]">dtapia@rstaxlegal.cl</span>
            </a>
            <a href="mailto:squintana@rstaxlegal.cl" className="block rounded-md border border-border bg-card px-3 py-2 no-underline transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium text-foreground">Solange Quintana Pizarro</p>
              <span className="text-xs text-[var(--brand-teal)]">squintana@rstaxlegal.cl</span>
            </a>
            <a href="mailto:clopez@rstaxlegal.cl" className="block rounded-md border border-border bg-card px-3 py-2 no-underline transition-colors hover:bg-muted/40">
              <p className="text-sm font-medium text-foreground">Cristian López Thienel</p>
              <span className="text-xs text-[var(--brand-teal)]">clopez@rstaxlegal.cl</span>
            </a>
          </div>
        </div>
      </div>

      {/* Pestañas — una sola línea (scroll horizontal si no cabe) */}
      <div className="flex flex-nowrap justify-center gap-0.5 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => irTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === t.key
                ? "border-[var(--brand-teal)] font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "empresa" ? <Empresa token={token} /> : null}
      {tab === "contabilidad" ? <Contabilidad token={token} /> : null}
      {tab === "rrhh" ? <RecursosHumanos token={token} /> : null}
      {tab === "gastos" ? <GastosMenores token={token} empresa={empresa} /> : null}
      {tab === "remuneraciones" ? <DetalleRemuneraciones token={token} empresa={empresa} /> : null}
      {tab === "solicitudes" ? <SolicitudForm token={token} empresa={empresa} /> : null}
    </div>
  );
}
