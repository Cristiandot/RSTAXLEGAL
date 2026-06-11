"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCopy, ExternalLink, Link2, Search } from "lucide-react";
import { generarLinkCliente } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type LinkClienteRow = {
  id: string;
  razonSocial: string;
  rut: string | null;
  token: string | null;
  correo: string | null;
};

function urlPortal(token: string): string {
  return `${window.location.origin}/solicitud/${token}`;
}

export function LinksClient({
  filas,
  errorCarga,
}: {
  filas: LinkClienteRow[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  const [soloConLink, setSoloConLink] = useState(false);
  const [ocupado, startAccion] = useTransition();

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (q && !`${f.razonSocial} ${f.rut ?? ""}`.toLowerCase().includes(q)) return false;
      if (soloConLink && !f.token) return false;
      return true;
    });
  }, [filas, buscar, soloConLink]);

  const conLink = filas.filter((f) => f.token).length;

  function copiar(token: string, razonSocial: string) {
    navigator.clipboard.writeText(urlPortal(token));
    toast.success(`Link de ${razonSocial} copiado — pégaselo al cliente`);
  }

  function generar(f: LinkClienteRow) {
    startAccion(async () => {
      const res = await generarLinkCliente(f.id);
      if (res.ok && res.token) {
        navigator.clipboard.writeText(urlPortal(res.token));
        toast.success(`Link de ${f.razonSocial} generado y copiado`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo generar el link.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Links clientes</h1>
        <p className="text-sm text-muted-foreground">
          El link del portal de cada empresa (solicitudes + detalle
          remuneraciones). Cada empresa tiene su token propio — generar uno
          nuevo no afecta a las demás. {conLink} de {filas.length} empresas con
          link activo.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa o RUT…"
            className="h-9 w-64 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={soloConLink}
            onChange={(e) => setSoloConLink(e.target.checked)}
          />
          Solo con link
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length}
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[320px]">Empresa</TableHead>
              <TableHead>RUT</TableHead>
              <TableHead>Correo de envíos</TableHead>
              <TableHead>Link</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Sin empresas para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">
                    <span className="block max-w-[320px] truncate" title={f.razonSocial}>
                      {f.razonSocial}
                    </span>
                  </TableCell>
                  <TableCell>{f.rut ?? "—"}</TableCell>
                  <TableCell>
                    <span className="block max-w-[220px] truncate" title={f.correo ?? undefined}>
                      {f.correo ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {f.token ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin link
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {f.token ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copiar(f.token as string, f.razonSocial)}
                        >
                          <ClipboardCopy className="size-3.5" />
                          Copiar link
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Abrir portal"
                          onClick={() => window.open(urlPortal(f.token as string), "_blank")}
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={ocupado}
                        onClick={() => generar(f)}
                      >
                        <Link2 className="size-3.5" />
                        Generar link
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
