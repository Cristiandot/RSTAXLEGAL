"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ClipboardList, Table2, Users } from "lucide-react";
import { SolicitudForm, type InfoEmpresa } from "./solicitud-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Portada del portal del cliente: resumen de la empresa y acceso a las
 * secciones. "Panel de solicitudes" es el formulario de gestiones;
 * "Detalle remuneraciones" (novedades del mes) está en construcción.
 */
export function PortalCliente({ token, empresa }: { token: string; empresa: InfoEmpresa }) {
  const [vista, setVista] = useState<"inicio" | "solicitudes">("inicio");

  if (vista === "solicitudes") {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setVista("inicio")}>
          <ArrowLeft className="size-4" />
          Volver al inicio
        </Button>
        <SolicitudForm token={token} empresa={empresa} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {empresa.razon_social}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Portal de la empresa · RS Tax &amp; Legal
        </p>
      </div>

      <Card className="card-soft border-transparent">
        <CardContent className="flex items-center gap-3 pt-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
            <Users className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">
              {empresa.trabajadores.length} trabajador
              {empresa.trabajadores.length === 1 ? "" : "es"} registrado
              {empresa.trabajadores.length === 1 ? "" : "s"} con RS Tax &amp; Legal
            </p>
            <p className="text-xs text-muted-foreground">
              Activos o con contrato reciente. Los nuevos se suman solos al
              solicitar su contrato.
            </p>
          </div>
        </CardContent>
      </Card>

      <button
        type="button"
        onClick={() => setVista("solicitudes")}
        className="block w-full text-left"
      >
        <Card className="card-soft border-transparent transition-shadow hover:shadow-md">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal)]/10 text-[var(--brand-teal)]">
                  <ClipboardList className="size-5" />
                </span>
                <div>
                  <CardTitle className="text-base">Panel de solicitudes</CardTitle>
                  <CardDescription className="mt-1">
                    Contratos nuevos, anexos, cartas de amonestación, finiquitos,
                    papeletas de vacaciones y permisos. Llenas la solicitud y el
                    equipo de RS Tax &amp; Legal la revisa y prepara el documento.
                  </CardDescription>
                </div>
              </div>
              <ArrowRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
            </div>
          </CardHeader>
        </Card>
      </button>

      <Card className="card-soft border-transparent opacity-80">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Table2 className="size-5" />
              </span>
              <div>
                <CardTitle className="text-base">Detalle remuneraciones</CardTitle>
                <CardDescription className="mt-1">
                  Novedades del mes para las liquidaciones: horas extra, turnos
                  en feriados y domingos, licencias médicas, anticipos y bonos.
                  Lo que ya pediste por el panel de solicitudes (permisos,
                  vacaciones, finiquitos) se carga solo — no lo repites acá.
                </CardDescription>
              </div>
            </div>
            <span className="mt-1 shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Próximamente
            </span>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
