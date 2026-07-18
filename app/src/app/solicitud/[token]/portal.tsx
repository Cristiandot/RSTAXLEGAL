"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PieChart, Users, Table2, MapPin, MessageCircle } from "lucide-react";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";
import { DetalleRemuneraciones } from "./remuneraciones";
import { GastosMenores } from "./gastos-menores";
import { DatosEmpresa } from "./datos-empresa";
import { EstadoResultado } from "./estado-resultado";
import { Reportes } from "./reportes";
import { ClasificarGastos } from "./clasificar";
import { AlertasFinancieras } from "./alertas";
import { RentaProyectada } from "./renta";
import { Contabilidad } from "./contabilidad";
import { RecursosHumanos } from "./rrhh";
import { TesoreriaBoton } from "./tesoreria-boton";

type Tab = "financiera" | "rrhh" | "remuneraciones";

const TABS_VALIDOS: Tab[] = ["financiera", "rrhh", "remuneraciones"];

/**
 * Portal del cliente — menú de pestañas: Empresa (inicio) · Contabilidad ·
 * Recursos humanos · Ingreso gastos menores · Detalle remuneraciones ·
 * Solicitudes laborales. Sobre la marca RSTL, con la franja de indicadores
 * Previred. Cada pestaña carga datos por RPC de token.
 */
export function PortalCliente({
  token,
  empresa,
  embedded = false,
}: {
  token: string;
  empresa: InfoEmpresa;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("financiera");
  const [anioFin, setAnioFin] = useState(2026);
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
    { key: "financiera", label: "Financiero", icon: <PieChart className="size-4" /> },
    { key: "rrhh", label: "Recursos humanos", icon: <Users className="size-4" /> },
    { key: "remuneraciones", label: "Remuneraciones", icon: <Table2 className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      {!embedded ? (
        <div className="flex items-center justify-end gap-3">
          <TesoreriaBoton token={token} />
          <Image
            src="/logo-claro.png"
            alt="Rodríguez Samith Tax & Legal"
            width={200}
            height={56}
            priority
            className="h-auto w-[150px] sm:w-[180px]"
          />
        </div>
      ) : (
        <div className="flex justify-end">
          <TesoreriaBoton token={token} />
        </div>
      )}

      {/* Datos de la empresa: % de cumplimiento, faltantes en rojo y accesos */}
      <DatosEmpresa token={token} />

      {/* Vistas */}
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

      {tab === "financiera" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Información del año</span>
            <div className="inline-flex rounded-md bg-muted p-0.5">
              {[2025, 2026].map((a) => (
                <button
                  key={a}
                  onClick={() => setAnioFin(a)}
                  className={`rounded px-3 py-1 text-sm font-medium transition ${
                    anioFin === a ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <AlertasFinancieras token={token} anio={anioFin} />
          <EstadoResultado token={token} anio={anioFin} />
          <RentaProyectada token={token} anio={anioFin} />
          <ClasificarGastos token={token} />
          <Reportes token={token} anio={anioFin} />
          <Contabilidad token={token} />
          <GastosMenores token={token} empresa={empresa} />
        </div>
      ) : null}
      {tab === "rrhh" ? (
        <div className="space-y-6">
          <RecursosHumanos token={token} />
          <SolicitudForm token={token} empresa={empresa} />
        </div>
      ) : null}
      {tab === "remuneraciones" ? (
        <DetalleRemuneraciones token={token} empresa={empresa} />
      ) : null}

      {/* Pie de página: contacto de la oficina */}
      <footer className="mt-8 space-y-4 border-t border-border pt-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Oficina
            </p>
            <p className="mt-1.5 flex items-start gap-2 text-sm text-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--brand-teal)]" />
              Avenida Borgoño N° 14.439, of. 309, Reñaca, Viña del Mar
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Teléfono
            </p>
            <a
              href="https://wa.me/56973928662"
              className="mt-1.5 inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-teal)] no-underline"
            >
              <MessageCircle className="size-4 shrink-0" />
              +56 9 7392 8662
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              Solo atendemos por <strong>WhatsApp</strong> — mensajes o llamadas por
              WhatsApp a este número.
            </p>
          </div>
        </div>

        <div>
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
      </footer>
    </div>
  );
}
