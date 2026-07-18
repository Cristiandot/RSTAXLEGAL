"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";

/**
 * Acceso de PRUEBA a la conciliación bancaria desde el portal del cliente.
 * Discreto (arriba a la derecha) para no interferir con el diseño del portal;
 * solo aparece si la empresa tiene el servicio de tesorería activo
 * (clientes.hace_tesoreria). Abre el panel de tesorería en otra pestaña.
 */
/**
 * Variante para el portal del GRUPO: un solo boton que apunta a la primera
 * empresa con tesoreria activa (adentro el cliente cambia de empresa con los
 * chips del propio panel de tesoreria).
 */
export function TesoreriaBotonGrupo({ tokens }: { tokens: string[] }) {
  const [tokenActivo, setTokenActivo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all(
      tokens.map((t) =>
        fetch("/api/tesoreria/conciliacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: t, accion: "estado" }),
        })
          .then((r) => r.json())
          .then((d) => (d?.ok ? t : null))
          .catch(() => null),
      ),
    ).then((res) => {
      if (vivo) setTokenActivo(res.find(Boolean) ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [tokens]);

  if (!tokenActivo) return null;
  return (
    <a
      href={`/tesoreria-portal/${tokenActivo}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
    >
      <Landmark className="size-3.5" />
      Conciliación bancaria (prueba)
    </a>
  );
}

export function TesoreriaBoton({ token }: { token: string }) {
  const [activo, setActivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/tesoreria/conciliacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, accion: "estado" }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d?.ok) setActivo(true);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [token]);

  if (!activo) return null;

  return (
    <a
      href={`/tesoreria-portal/${token}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
    >
      <Landmark className="size-3.5" />
      Conciliación bancaria (prueba)
    </a>
  );
}
