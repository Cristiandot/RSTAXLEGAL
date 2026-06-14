"use client";

import { useState } from "react";
import { Building2, PieChart, Users } from "lucide-react";
import { type InfoEmpresa } from "./solicitud-form";
import { FranjaIndicadores } from "./indicadores";
import { Empresa } from "./empresa";
import { Contabilidad } from "./contabilidad";
import { RecursosHumanos } from "./rrhh";

type Tab = "empresa" | "contabilidad" | "rrhh";

/**
 * Portal del cliente — pestañas Empresa (inicio) · Contabilidad · Recursos
 * humanos, sobre la marca RSTL y con la franja de indicadores Previred.
 * Contabilidad reúne sus datos + gastos e ingresos menores; Recursos humanos
 * reúne su panel + detalle de remuneraciones + solicitudes laborales. Empresa
 * muestra los datos editables y un resumen del mes.
 */
export function PortalCliente({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [tab, setTab] = useState<Tab>("empresa");

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "empresa", label: "Empresa", icon: <Building2 className="size-4" /> },
    { key: "contabilidad", label: "Contabilidad", icon: <PieChart className="size-4" /> },
    { key: "rrhh", label: "Recursos humanos", icon: <Users className="size-4" /> },
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

      {/* Pestañas */}
      <div className="flex flex-wrap justify-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm transition-colors ${
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
      {tab === "contabilidad" ? <Contabilidad token={token} empresa={empresa} /> : null}
      {tab === "rrhh" ? <RecursosHumanos token={token} empresa={empresa} /> : null}
    </div>
  );
}
