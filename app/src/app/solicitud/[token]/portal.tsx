"use client";

import { useState } from "react";
import {
  ArrowLeft, ArrowRight, PieChart, Users, ClipboardList,
  ClipboardType, Table2, Receipt,
} from "lucide-react";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";
import { DetalleRemuneraciones } from "./remuneraciones";
import { GastosMenores } from "./gastos-menores";
import { FranjaIndicadores } from "./indicadores";
import { Contabilidad } from "./contabilidad";
import { RecursosHumanos } from "./rrhh";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";

type Tab = "contabilidad" | "rrhh" | "solicitudes";
type VistaSol = "inicio" | "solicitudes" | "remuneraciones" | "gastos";

/**
 * Portal del cliente — diseño de pestañas (Contabilidad · Recursos humanos ·
 * Solicitudes) sobre la marca RSTL, con la franja de indicadores Previred.
 * Contabilidad y RRHH leen datos reales por RPC de token; Solicitudes reúne las
 * gestiones existentes (formulario, novedades del mes y gastos menores).
 */
export function PortalCliente({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [tab, setTab] = useState<Tab>(
    empresa.hace_contabilidad_completa ? "contabilidad" : "solicitudes",
  );

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "contabilidad", label: "Contabilidad", icon: <PieChart className="size-4" /> },
    { key: "rrhh", label: "Recursos humanos", icon: <Users className="size-4" /> },
    { key: "solicitudes", label: "Solicitudes", icon: <ClipboardList className="size-4" /> },
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

      {tab === "contabilidad" ? <Contabilidad token={token} /> : null}
      {tab === "rrhh" ? <RecursosHumanos token={token} /> : null}
      {tab === "solicitudes" ? <SeccionSolicitudes token={token} empresa={empresa} /> : null}
    </div>
  );
}

/** Sub-sección Solicitudes: los 3 accesos existentes con navegación propia. */
function SeccionSolicitudes({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [vista, setVista] = useState<VistaSol>("inicio");

  if (vista !== "inicio") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setVista("inicio")}
          className="inline-flex items-center gap-1 text-sm text-[var(--brand-teal)]"
        >
          <ArrowLeft className="size-4" />
          Volver a solicitudes
        </button>
        {vista === "solicitudes" ? (
          <SolicitudForm token={token} empresa={empresa} />
        ) : vista === "remuneraciones" ? (
          <DetalleRemuneraciones token={token} empresa={empresa} />
        ) : (
          <GastosMenores token={token} empresa={empresa} />
        )}
      </div>
    );
  }

  const accesos: {
    key: VistaSol;
    icon: React.ReactNode;
    titulo: string;
    desc: string;
  }[] = [
    {
      key: "solicitudes",
      icon: <ClipboardType className="size-5" />,
      titulo: "Panel de solicitudes",
      desc: "Contratos nuevos, anexos, cartas de amonestación, finiquitos, papeletas de vacaciones y permisos.",
    },
    {
      key: "remuneraciones",
      icon: <Table2 className="size-5" />,
      titulo: "Detalle remuneraciones",
      desc: "Novedades del mes para las liquidaciones: horas extra, turnos, anticipos y bonos. Cierre mensual.",
    },
    {
      key: "gastos",
      icon: <Receipt className="size-5" />,
      titulo: "Gastos e ingresos menores",
      desc: "Compras y ventas con boleta que no van al SII mensual, pero sí a tu Operación Renta.",
    },
  ];

  return (
    <div className="space-y-4">
      {accesos.map((a) => (
        <button key={a.key} type="button" onClick={() => setVista(a.key)} className="block w-full text-left">
          <Card className="card-soft border-transparent transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
                    {a.icon}
                  </span>
                  <div>
                    <CardTitle className="text-base">{a.titulo}</CardTitle>
                    <CardDescription className="mt-1">{a.desc}</CardDescription>
                  </div>
                </div>
                <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </div>
            </CardHeader>
          </Card>
        </button>
      ))}
    </div>
  );
}
