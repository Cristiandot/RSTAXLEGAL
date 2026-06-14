"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Building2, Save } from "lucide-react";
import {
  cargarEmpresa, guardarEmpresa,
  type EmpresaDatos,
} from "./portal-actions";
import { Sucursales } from "./sucursales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function Empresa({ token }: { token: string }) {
  const [emp, setEmp] = useState<EmpresaDatos | null>(null);
  const [guardando, startGuardar] = useTransition();

  const recargar = useCallback(async () => {
    const r = await cargarEmpresa(token);
    if (r.ok && r.empresa) setEmp(r.empresa);
  }, [token]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

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

  return (
    <div className="space-y-5">
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
