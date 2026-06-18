"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { fechaLarga, montoCLP } from "@/lib/format";
import { montoEnPalabras } from "@/lib/numero-a-letras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generarMutuo } from "./actions";

/** Valores iniciales tomados del mutuo de ejemplo (editables por caso). */
const INICIAL = {
  ciudad: "Viña del Mar",
  fechaContrato: new Date().toLocaleDateString("sv-SE"),
  mutNombre: "ANGELO ALEJANDRO RODRÍGUEZ ROJAS",
  mutNacionalidad: "chileno",
  mutEstadoCivil: "",
  mutProfesion: "",
  mutRut: "15.951.083-2",
  mutDomicilio: "",
  mutComuna: "",
  empRazon: "AARR ATENCIONES EN SALUD LIMITADA",
  empRut: "78.266.628-2",
  empGiro: "de su denominación",
  empRep: "ANGELO ALEJANDRO RODRÍGUEZ ROJAS",
  empDomicilio: "",
  destino:
    "los fines corporativos de la empresa, específicamente para la adquisición de activo fijo (vehículo de trabajo)",
  montoCapital: 43000000,
  plazoMeses: 48,
  plazoPalabras: "cuatro años",
  nCuotas: 48,
  valorCuota: 1000000,
  fechaPrimeraCuota: "2026-04-05",
  diaPago: "05",
  montoTotal: 48000000,
  fechaConstitucion: "2025-10-07",
  ciudadJurisdiccion: "Viña del Mar",
};

type Campos = typeof INICIAL;

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="card-soft rounded-xl bg-card p-4">
      <h3 className="mb-3 font-heading text-sm font-semibold">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Campo({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function MutuoClient() {
  const [f, setF] = useState<Campos>(INICIAL);
  const [generando, startGenerar] = useTransition();
  function set(k: keyof Campos, v: string | number) {
    setF((prev) => ({ ...prev, [k]: v }) as Campos);
  }

  const capitalPalabras = useMemo(() => montoEnPalabras(Number(f.montoCapital)), [f.montoCapital]);
  const cuotaPalabras = useMemo(() => montoEnPalabras(Number(f.valorCuota)), [f.valorCuota]);

  function descargar(base64: string, filename: string) {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generar() {
    const variables: Record<string, string> = {
      CIUDAD: f.ciudad,
      FECHA_CONTRATO: fechaLarga(f.fechaContrato),
      MUTUANTE_NOMBRE: f.mutNombre,
      MUTUANTE_NACIONALIDAD: f.mutNacionalidad,
      MUTUANTE_ESTADO_CIVIL: f.mutEstadoCivil,
      MUTUANTE_PROFESION: f.mutProfesion,
      MUTUANTE_RUT: f.mutRut,
      MUTUANTE_DOMICILIO: f.mutDomicilio,
      MUTUANTE_COMUNA: f.mutComuna,
      EMPRESA_RAZON_SOCIAL: f.empRazon,
      EMPRESA_RUT: f.empRut,
      EMPRESA_GIRO: f.empGiro,
      EMPRESA_REP_NOMBRE: f.empRep,
      EMPRESA_DOMICILIO: f.empDomicilio,
      DESTINO: f.destino.trim(),
      MONTO_CAPITAL: montoCLP(f.montoCapital),
      MONTO_CAPITAL_PALABRAS: capitalPalabras,
      PLAZO_MESES: String(f.plazoMeses),
      PLAZO_PALABRAS: f.plazoPalabras,
      N_CUOTAS: String(f.nCuotas),
      VALOR_CUOTA: montoCLP(f.valorCuota),
      VALOR_CUOTA_PALABRAS: cuotaPalabras,
      FECHA_PRIMERA_CUOTA: fechaLarga(f.fechaPrimeraCuota),
      DIA_PAGO: f.diaPago,
      MONTO_TOTAL: montoCLP(f.montoTotal),
      FECHA_CONSTITUCION: fechaLarga(f.fechaConstitucion),
      CIUDAD_JURISDICCION: f.ciudadJurisdiccion,
    };
    startGenerar(async () => {
      const res = await generarMutuo(variables);
      if (res.ok && res.base64 && res.filename) {
        descargar(res.base64, res.filename);
        toast.success("Documento generado");
      } else {
        toast.error(res.error ?? "Error al generar");
      }
    });
  }

  const num = (k: keyof Campos) => (
    <Input
      type="number"
      inputMode="numeric"
      value={Number(f[k]) === 0 ? "" : (f[k] as number)}
      onChange={(e) => set(k, e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
  const txt = (k: keyof Campos) => (
    <Input value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
  );
  const fecha = (k: keyof Campos) => (
    <Input type="date" value={f[k] as string} onChange={(e) => set(k, e.target.value)} />
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Mutuo</h1>
        <p className="text-sm text-muted-foreground">
          Genera un contrato de mutuo de dinero desde la plantilla. Completa los
          datos y descarga el .docx.
        </p>
      </div>

      <Seccion titulo="Celebración">
        <Campo label="Ciudad">{txt("ciudad")}</Campo>
        <Campo label="Fecha del contrato">{fecha("fechaContrato")}</Campo>
      </Seccion>

      <Seccion titulo="Mutuante / Acreedor (persona)">
        <Campo label="Nombre completo" full>{txt("mutNombre")}</Campo>
        <Campo label="Nacionalidad">{txt("mutNacionalidad")}</Campo>
        <Campo label="Estado civil">{txt("mutEstadoCivil")}</Campo>
        <Campo label="Profesión u oficio">{txt("mutProfesion")}</Campo>
        <Campo label="RUT">{txt("mutRut")}</Campo>
        <Campo label="Domicilio">{txt("mutDomicilio")}</Campo>
        <Campo label="Comuna">{txt("mutComuna")}</Campo>
      </Seccion>

      <Seccion titulo="Mutuaria / Deudora (empresa)">
        <Campo label="Razón social" full>{txt("empRazon")}</Campo>
        <Campo label="RUT">{txt("empRut")}</Campo>
        <Campo label="Giro">{txt("empGiro")}</Campo>
        <Campo label="Representante legal">{txt("empRep")}</Campo>
        <Campo label="Domicilio de la empresa">{txt("empDomicilio")}</Campo>
        <Campo label="Fecha escritura de constitución">{fecha("fechaConstitucion")}</Campo>
      </Seccion>

      <Seccion titulo="Contexto / destino del préstamo">
        <Campo label="¿Para qué se destina el mutuo? (va en la cláusula PRIMERO)" full>
          <Textarea
            rows={3}
            value={f.destino}
            onChange={(e) => set("destino", e.target.value)}
            placeholder="Ej.: la adquisición de activo fijo (vehículo de trabajo)…"
          />
        </Campo>
      </Seccion>

      <Seccion titulo="Préstamo, plazo y cuotas">
        <Campo label="Monto del capital ($)">{num("montoCapital")}</Campo>
        <Campo label="Total a devolver ($)">{num("montoTotal")}</Campo>
        <Campo label="Plazo (meses)">{num("plazoMeses")}</Campo>
        <Campo label="Plazo en palabras">{txt("plazoPalabras")}</Campo>
        <Campo label="N° de cuotas">{num("nCuotas")}</Campo>
        <Campo label="Valor de cada cuota ($)">{num("valorCuota")}</Campo>
        <Campo label="Fecha primera cuota">{fecha("fechaPrimeraCuota")}</Campo>
        <Campo label="Día de pago mensual">{txt("diaPago")}</Campo>
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground sm:col-span-2">
          Capital en palabras: <span className="font-medium text-foreground">{capitalPalabras || "—"}</span>
          {" · "}Cuota en palabras: <span className="font-medium text-foreground">{cuotaPalabras || "—"}</span>
          {" · "}Intereses (total − capital): <span className="font-medium text-foreground">{montoCLP(Number(f.montoTotal) - Number(f.montoCapital))}</span>
        </div>
      </Seccion>

      <Seccion titulo="Jurisdicción">
        <Campo label="Ciudad y comuna de jurisdicción">{txt("ciudadJurisdiccion")}</Campo>
      </Seccion>

      <div className="flex justify-end">
        <Button onClick={generar} disabled={generando}>
          <FileText className="size-4" />
          {generando ? "Generando…" : "Generar contrato (.docx)"}
        </Button>
      </div>
    </div>
  );
}
