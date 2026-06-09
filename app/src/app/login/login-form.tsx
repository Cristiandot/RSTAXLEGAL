"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { enviarMagicLink, type EstadoLogin } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const estadoInicial: EstadoLogin = { ok: false, mensaje: "" };

function BotonEnviar({ enviado }: { enviado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || enviado}>
      {pending
        ? "Enviando…"
        : enviado
          ? "Link enviado"
          : "Enviar link de acceso"}
    </Button>
  );
}

export function LoginForm() {
  const [estado, formAction] = useActionState(enviarMagicLink, estadoInicial);

  useEffect(() => {
    if (!estado.mensaje) return;
    if (estado.ok) {
      toast.success(estado.mensaje);
    } else {
      toast.error(estado.mensaje);
    }
  }, [estado]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="correo">Correo corporativo</Label>
        <Input
          id="correo"
          name="correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="usuario@rstaxlegal.cl"
          required
          disabled={estado.ok}
        />
      </div>
      <BotonEnviar enviado={estado.ok} />
      {estado.mensaje ? (
        <p
          className={`text-sm ${estado.ok ? "text-emerald-600" : "text-destructive"}`}
          role="status"
        >
          {estado.mensaje}
        </p>
      ) : null}
    </form>
  );
}
