"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { desbloquearPortal } from "./portal-auth";

/**
 * Pantalla de acceso: pide el PIN de 4 dígitos. No revela ningún dato del
 * cliente hasta validar. Al validar, recarga y la página muestra el portal.
 */
export function PinGate({ slug }: { slug: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(pin)) {
      setError("Ingresa los 4 dígitos.");
      return;
    }
    start(async () => {
      const r = await desbloquearPortal(slug, pin);
      if (r.ok) {
        window.location.reload();
        return;
      }
      if (r.bloqueado) {
        setError("Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.");
      } else if (typeof r.restantes === "number") {
        setError(`Código incorrecto. Te quedan ${r.restantes} intento(s).`);
      } else {
        setError("Código incorrecto.");
      }
      setPin("");
    });
  }

  return (
    <div className="card-soft rounded-xl bg-card p-8 text-center">
      <div className="mb-6 flex justify-center">
        <Image
          src="/logo-claro.png"
          alt="Rodríguez Samith Tax & Legal"
          width={220}
          height={62}
          priority
          className="h-auto w-[200px]"
        />
      </div>
      <h1 className="font-heading text-xl font-semibold">Acceso al portal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ingresa tu código de 4 dígitos para ver la información de tu empresa.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          autoFocus
          className="mx-auto block w-40 rounded-md border border-input bg-background px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={pending || pin.length < 4}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition disabled:opacity-50"
        >
          {pending ? "Verificando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
