"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Página pública con los datos bancarios de RS para que el cliente los copie y
 * pegue en su banco al transferir los fondos del F29. Sin login (la enlaza el
 * correo de aviso F29 cuando "Paga RS"). Son datos de RS para RECIBIR pagos.
 */
const CAMPOS: { label: string; valor: string }[] = [
  { label: "Titular", valor: "Rodríguez Samith Servicios Legales y Contables II Limitada" },
  { label: "RUT", valor: "78.073.973-8" },
  { label: "Banco", valor: "Mercado Pago" },
  { label: "Tipo de cuenta", valor: "Cuenta Vista" },
  { label: "N° de cuenta", valor: "1093709982" },
  { label: "Correo", valor: "admin@rstaxlegal.cl" },
];

const TEXTO_COMPLETO = CAMPOS.map((c) => `${c.label}: ${c.valor}`).join("\n");

export default function DatosTransferenciaPage() {
  const [copiado, setCopiado] = useState<string | null>(null);

  async function copiar(clave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((c) => (c === clave ? null : c)), 1500);
    } catch {
      // Si el navegador bloquea el portapapeles, el texto igual es seleccionable.
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-8">
      <div className="rounded-xl bg-[#0b2545] px-5 py-4">
        <span className="text-lg font-semibold text-white">
          Rodríguez Samith · Tax &amp; Legal
        </span>
      </div>

      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Datos para transferir
        </h1>
        <p className="text-sm text-muted-foreground">
          Copia cada dato y pégalo en tu banco para transferir los fondos de tu F29.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {CAMPOS.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-input bg-card px-3 py-2.5"
          >
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="font-medium break-words">{c.valor}</div>
          </div>
        ))}
      </div>

      <Button onClick={() => copiar("__todo", TEXTO_COMPLETO)}>
        {copiado === "__todo" ? (
          <>
            <Check className="size-4" /> Copiado todo
          </>
        ) : (
          <>
            <Copy className="size-4" /> Copiar todos los datos
          </>
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Rodríguez Samith Tax &amp; Legal · Viña del Mar
      </p>
    </main>
  );
}
