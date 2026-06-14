"use client";

import { useState } from "react";
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

/**
 * Portal del cliente — menú de pestañas: Empresa (inicio) · Contabilidad ·
 * Recursos humanos · Ingreso gastos menores · Detalle remuneraciones ·
 * Solicitudes laborales. Sobre la marca RSTL, con la franja de indicadores
 * Previred. Cada pestaña carga datos por RPC de token.
 */
export function PortalCliente({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [tab, setTab] = useState<Tab>("empresa");

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "empresa", label: "Empresa", icon: <Building2 className="size-4" /> },
    { key: "contabilidad", label: "Contabilidad", icon: <PieChart className="size-4" /> },
    { key: "rrhh", label: "Recursos humanos", icon: <Users className="size-4" /> },
    { key: "gastos", label: "Ingreso gastos menores", icon: <Receipt className="size-4" /> },
    { key: "remuneraciones", label: "Detalle remuneraciones", icon: <Table2 className="size-4" /> },
    { key: "solicitudes", label: "Solicitudes laborales", icon: <ClipboardList className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Encabezado de la empresa */}
      <div className="text-center">
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

      <FranjaIndicadores token={token} />

      {/* Pestañas — una sola línea (scroll horizontal si no cabe) */}
      <div className="flex flex-nowrap justify-center gap-0.5 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
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

      {tab === "empresa" ? <Empresa token={token} onIr={setTab} /> : null}
      {tab === "contabilidad" ? <Contabilidad token={token} /> : null}
      {tab === "rrhh" ? <RecursosHumanos token={token} /> : null}
      {tab === "gastos" ? <GastosMenores token={token} empresa={empresa} /> : null}
      {tab === "remuneraciones" ? <DetalleRemuneraciones token={token} empresa={empresa} /> : null}
      {tab === "solicitudes" ? <SolicitudForm token={token} empresa={empresa} /> : null}
    </div>
  );
}
