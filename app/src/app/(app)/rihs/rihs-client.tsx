"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HardHat, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generarRihs, urlReglamento } from "./actions";

export type EmpresaOpcion = {
  id: string;
  razon_social: string;
  rut_empresa: string | null;
};

export type ReglamentoRow = {
  id: string;
  tipo: string;
  razonSocial: string;
  documentoPath: string;
  nombreOriginal: string | null;
  createdAt: string;
  cliente: string | null;
  autor: string | null;
};

export function RihsClient({
  empresas,
  documentos,
}: {
  empresas: EmpresaOpcion[];
  documentos: ReglamentoRow[];
}) {
  const router = useRouter();
  const [razonSocial, setRazonSocial] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [buscarEmp, setBuscarEmp] = useState("");
  const [generando, startGenerar] = useTransition();
  const [descargando, setDescargando] = useState<string | null>(null);

  const empresasFiltradas = useMemo(() => {
    const q = buscarEmp.trim().toLowerCase();
    const base = q
      ? empresas.filter((e) =>
          `${e.razon_social} ${e.rut_empresa ?? ""}`.toLowerCase().includes(q),
        )
      : empresas;
    return base.slice(0, 30);
  }, [empresas, buscarEmp]);

  function fillEmpresa(id: string) {
    const e = empresas.find((x) => x.id === id);
    if (!e) return;
    setRazonSocial(e.razon_social ?? "");
    setClienteId(e.id);
    toast.success(`${e.razon_social} cargada`);
  }

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
    const razon = razonSocial.trim();
    if (!razon) {
      toast.error("Indica la razón social de la empresa");
      return;
    }
    startGenerar(async () => {
      const res = await generarRihs({ clienteId, razonSocial: razon });
      if (res.ok && res.base64 && res.filename) {
        descargar(res.base64, res.filename);
        toast.success("RIHS generado y guardado");
        router.refresh();
      } else {
        toast.error(res.error ?? "Error al generar");
      }
    });
  }

  async function descargarDoc(d: ReglamentoRow) {
    setDescargando(d.id);
    const res = await urlReglamento(d.documentoPath, d.nombreOriginal ?? "RIHS.docx");
    setDescargando(null);
    if (res.ok && res.url) {
      window.open(res.url, "_blank");
    } else {
      toast.error(res.error ?? "No se pudo descargar");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          RIHS — Reglamento Interno de Higiene y Seguridad
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Genera el RIHS desde la plantilla tipo (D.S. N° 44, para entidades
          empleadoras con menos de 10 trabajadores). Elige la empresa de la cartera
          o escribe la razón social, y descarga el .docx. Cada documento queda
          registrado en el listado de abajo.
        </p>
      </div>

      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">Empresa</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Buscar empresa de la cartera (activas) para autorrellenar</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                placeholder="Razón social o RUT…"
                value={buscarEmp}
                onChange={(e) => setBuscarEmp(e.target.value)}
                className="sm:flex-1"
              />
              <select
                className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-80"
                value=""
                onChange={(e) => {
                  if (e.target.value) fillEmpresa(e.target.value);
                }}
                aria-label="Empresa de la cartera"
              >
                <option value="">Elegir empresa…</option>
                {empresasFiltradas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.razon_social}
                    {e.rut_empresa ? ` — ${e.rut_empresa}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Razón social (como aparecerá en el documento)</Label>
            <Input
              value={razonSocial}
              onChange={(e) => {
                setRazonSocial(e.target.value);
                setClienteId(null);
              }}
              placeholder="Ej.: ARBORISMO SPA"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={generar} disabled={generando}>
            <HardHat className="size-4" />
            {generando ? "Generando…" : "Generar RIHS (.docx)"}
          </Button>
        </div>
      </div>

      <div className="card-soft rounded-xl bg-card p-4">
        <h3 className="mb-3 font-heading text-sm font-semibold">
          Documentos generados
        </h3>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay reglamentos generados.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {documentos.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-[var(--brand-teal)]">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {d.tipo} — {d.cliente ?? d.razonSocial}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString("es-CL")}
                      {d.autor ? ` · ${d.autor}` : ""}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => descargarDoc(d)}
                  disabled={descargando === d.id}
                >
                  <Download className="size-3.5" />
                  {descargando === d.id ? "Generando link…" : "Descargar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
