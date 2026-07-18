"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Loader2, CheckCircle2 } from "lucide-react";

const FUENTES = [
  { valor: "mercadopago", label: "Mercado Pago (cartola)" },
  { valor: "generico", label: "Otro banco (Excel / CSV con columnas)" },
];

export function PortalUpload({ token }: { token: string }) {
  const router = useRouter();
  const [fuente, setFuente] = useState("mercadopago");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function subir() {
    if (!archivo) {
      setMsg({ ok: false, texto: "Selecciona un archivo primero." });
      return;
    }
    setSubiendo(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("token", token);
      fd.set("fuente", fuente);
      fd.set("archivo", archivo);
      const res = await fetch("/api/tesoreria/cartola", { method: "POST", body: fd });
      const data = await res.json();
      if (!data.ok) {
        setMsg({ ok: false, texto: data.error ?? "No se pudo procesar el archivo." });
      } else {
        const auto = Number(data.conciliados ?? 0);
        setMsg({
          ok: true,
          texto: `Cartola cargada: ${data.insertados} movimientos nuevos (de ${data.total})${
            auto > 0 ? ` · ${auto} conciliados automáticamente` : ""
          }.`,
        });
        setArchivo(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, texto: "Error de conexión al subir el archivo." });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="card-soft mt-5 rounded-xl bg-card p-5">
      <div className="flex items-center gap-2">
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-heading text-lg font-semibold">Subir cartola</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Descarga la cartola desde tu banco y súbela acá. No te pedimos ninguna clave bancaria.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted-foreground">Origen</label>
          <select
            className="mt-1 h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={fuente}
            onChange={(e) => setFuente(e.target.value)}
          >
            {FUENTES.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Archivo (.xlsx o .csv)</label>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
          />
        </div>
        <button
          onClick={subir}
          disabled={subiendo || !archivo}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Subir
        </button>
      </div>

      {msg && (
        <div
          className={`mt-3 flex items-center gap-2 rounded-lg border p-3 text-sm ${
            msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.ok && <CheckCircle2 className="h-4 w-4" />}
          {msg.texto}
        </div>
      )}
    </div>
  );
}
