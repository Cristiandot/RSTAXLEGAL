"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Building2, Save, PieChart, Users, ArrowRight, Coins, TrendingUp,
} from "lucide-react";
import {
  cargarEmpresa, guardarEmpresa, cargarContabilidad, cargarRrhh,
  type EmpresaDatos, type ContabilidadInfo, type RrhhInfo,
} from "./portal-actions";
import { Sucursales } from "./sucursales";
import { formatMonto } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tab = "empresa" | "contabilidad" | "rrhh";

const MESES_PORTAL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const selectPortalCls =
  "h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm";

function periodoPorDefecto(): string {
  const d = new Date();
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Campo({
  label, name, defaultValue, type = "text", placeholder,
}: { label: string; name: string; defaultValue: string; type?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}

function Mini({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

export function Empresa({
  token,
  onIr,
}: {
  token: string;
  onIr: (t: Tab) => void;
}) {
  const [emp, setEmp] = useState<EmpresaDatos | null>(null);
  const [contab, setContab] = useState<ContabilidadInfo | null>(null);
  const [rrhh, setRrhh] = useState<RrhhInfo | null>(null);
  const [guardando, startGuardar] = useTransition();
  const anioActual = new Date().getFullYear();
  const [anioSel, setAnioSel] = useState(anioActual);
  const [mesSel, setMesSel] = useState(""); // "" = año completo (acumulado)

  const recargar = useCallback(async () => {
    const r = await cargarEmpresa(token);
    if (r.ok && r.empresa) setEmp(r.empresa);
  }, [token]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  useEffect(() => {
    void cargarRrhh(token, periodoPorDefecto()).then((r) => {
      if (r.ok && r.info) setRrhh(r.info);
    });
  }, [token]);

  useEffect(() => {
    if (emp?.hace_contabilidad_completa) {
      void cargarContabilidad(token, anioSel).then((r) => {
        if (r.ok && r.info) setContab(r.info);
      });
    }
  }, [token, emp?.hace_contabilidad_completa, anioSel]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    startGuardar(async () => {
      const r = await guardarEmpresa(token, {
        giro: s("giro"),
        domicilio: s("domicilio"),
        comuna: s("comuna"),
        ciudad: s("ciudad"),
        telefono_empresa: s("telefono_empresa"),
        correo_empresa: s("correo_empresa"),
        representante_legal: s("representante_legal"),
        representante_legal_rut: s("representante_legal_rut"),
      });
      if (r.ok) {
        toast.success("Datos de la empresa guardados");
        await recargar();
      } else {
        toast.error(r.error ?? "No se pudieron guardar los datos.");
      }
    });
  }

  if (!emp) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  }

  const totales = contab?.totales;
  const ultimoF29 = contab?.f29 && contab.f29.length > 0 ? contab.f29[contab.f29.length - 1] : null;
  const mesData = mesSel
    ? (contab?.meses ?? []).find((m) => m.periodo === `${anioSel}-${mesSel}`) ?? null
    : null;
  const ventasResumen = mesSel ? (mesData?.ventas_neto ?? 0) : (totales?.ventas_neto ?? 0);
  const ivaResumen = mesSel
    ? (mesData?.iva_debito ?? 0) - (mesData?.iva_credito ?? 0)
    : (totales?.iva_pagar ?? 0);
  const etiquetaResumen = mesSel
    ? `${MESES_PORTAL[Number(mesSel) - 1].toLowerCase()} ${anioSel}`
    : `${anioSel}`;

  return (
    <div className="space-y-5">
      {/* Resumen del mes */}
      <div className="grid gap-4 sm:grid-cols-2">
        {emp.hace_contabilidad_completa ? (
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart className="size-4 text-[var(--brand-teal)]" />
                Contabilidad — resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <select
                  aria-label="Mes"
                  className={selectPortalCls}
                  value={mesSel}
                  onChange={(e) => setMesSel(e.target.value)}
                >
                  <option value="">Año completo</option>
                  {MESES_PORTAL.map((m, i) => (
                    <option key={m} value={String(i + 1).padStart(2, "0")}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Año"
                  className={selectPortalCls}
                  value={anioSel}
                  onChange={(e) => setAnioSel(Number(e.target.value))}
                >
                  {[anioActual, anioActual - 1].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Mini label={`Ventas netas ${etiquetaResumen}`} valor={formatMonto(ventasResumen)} />
                <Mini
                  label={mesSel ? "IVA a pagar" : "IVA a pagar (acum.)"}
                  valor={formatMonto(ivaResumen)}
                />
              </div>
              {ultimoF29 ? (
                <p className="text-xs text-muted-foreground">
                  Último F29 ({ultimoF29.periodo}):{" "}
                  {ultimoF29.fecha_f29_presentado ? "presentado" : "en proceso"}.
                </p>
              ) : null}
              <Button variant="outline" size="sm" className="w-full" onClick={() => onIr("contabilidad")}>
                Ver contabilidad <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-soft border-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Coins className="size-4 text-[var(--brand-teal)]" />
                Contabilidad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Puedes registrar gastos e ingresos menores y solicitar tus documentos contables.
              </p>
              <Button variant="outline" size="sm" className="w-full" onClick={() => onIr("contabilidad")}>
                Ir a contabilidad <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-[var(--brand-teal)]" />
              Recursos humanos — resumen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Nómina activa" valor={String(rrhh?.nomina_activa ?? "—")} />
              <Mini label="Contratos plazo fijo" valor={String(rrhh?.plazo_fijo ?? "—")} />
              <Mini label="Indefinidos" valor={String(rrhh?.indefinidos ?? "—")} />
              <Mini label="Licencias vigentes" valor={String(rrhh?.licencias_vigentes ?? "—")} />
            </div>
            {rrhh && rrhh.plazo_fijo_por_vencer > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                {rrhh.plazo_fijo_por_vencer} contrato{rrhh.plazo_fijo_por_vencer === 1 ? "" : "s"} a plazo fijo
                {rrhh.plazo_fijo_por_vencer === 1 ? " vence" : " vencen"} en los próximos 30 días.
              </p>
            ) : null}
            <Button variant="outline" size="sm" className="w-full" onClick={() => onIr("rrhh")}>
              Ver recursos humanos <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Datos de la empresa (editables) */}
      <form onSubmit={onSubmit}>
        <Card className="card-soft border-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-[var(--brand-teal)]" />
              Datos de la empresa
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Mantén estos datos al día: se usan para tus contratos y documentos. La razón social y
              el RUT los administra RS Tax &amp; Legal; si necesitas corregirlos, avísanos.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Razón social</Label>
                <Input value={emp.razon_social} readOnly className="bg-muted/40" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">RUT</Label>
                <Input value={emp.rut_empresa ?? "—"} readOnly className="bg-muted/40" />
              </div>
              <Campo label="Giro" name="giro" defaultValue={emp.giro ?? ""} placeholder="Giro o actividad económica" />
              <Campo label="Teléfono" name="telefono_empresa" defaultValue={emp.telefono_empresa ?? ""} />
              <Campo label="Correo de la empresa" name="correo_empresa" type="email" defaultValue={emp.correo_empresa ?? ""} />
              <Campo label="Dirección" name="domicilio" defaultValue={emp.domicilio ?? ""} />
              <Campo label="Comuna" name="comuna" defaultValue={emp.comuna ?? ""} />
              <Campo label="Ciudad" name="ciudad" defaultValue={emp.ciudad ?? ""} />
              <Campo label="Representante legal" name="representante_legal" defaultValue={emp.representante_legal ?? ""} />
              <Campo label="RUT representante legal" name="representante_legal_rut" defaultValue={emp.representante_legal_rut ?? ""} placeholder="12.345.678-9" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={guardando}>
                <Save className="size-4" />
                {guardando ? "Guardando…" : "Guardar datos"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Sucursales token={token} />
    </div>
  );
}
