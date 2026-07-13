"use client";

import { useMemo, useState } from "react";
import { KeyRound, Pin, Search } from "lucide-react";
import { ClaveCell, RutPreviredCell } from "@/components/credencial-celdas";
import { RutCopiable } from "@/components/rut-copiable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CredencialRow = {
  id: string;
  razonSocial: string;
  rut: string | null; // RUT empresa = usuario SII
  previredRut: string | null; // usuario Previred
  tieneClaveSii: boolean;
  tieneClavePrevired: boolean;
  activo: boolean;
  grupo: string | null; // "A.4 — Red Barrera"
  fijada: boolean; // fijada arriba (claves de la oficina, p. ej. el contador)
};

export function CredencialesClient({
  filas,
  errorCarga,
}: {
  filas: CredencialRow[];
  errorCarga: string | null;
}) {
  const [buscar, setBuscar] = useState("");
  const [verInactivas, setVerInactivas] = useState(false);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter((f) => {
      if (!verInactivas && !f.activo) return false;
      if (!q) return true;
      return `${f.razonSocial} ${f.rut ?? ""} ${f.previredRut ?? ""} ${f.grupo ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [filas, buscar, verInactivas]);

  const activas = filas.filter((f) => f.activo);
  const conSii = activas.filter((f) => f.tieneClaveSii).length;
  const conPrevired = activas.filter((f) => f.tieneClavePrevired).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold tracking-tight">
          <KeyRound className="size-6 text-[var(--brand-teal)]" />
          Credenciales
        </h1>
        <p className="text-sm text-muted-foreground">
          Claves SII y Previred de cada empresa. Vienen ocultas: el ojo la
          muestra, el otro botón la copia sin mostrarla y el lápiz la cambia.
          Cada vez que alguien ve o copia una clave queda registrado. {conSii}{" "}
          de {activas.length} empresas activas con clave SII y {conPrevired}{" "}
          con clave Previred.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa, RUT o cliente…"
            className="h-9 w-72 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={verInactivas}
            onChange={(e) => setVerInactivas(e.target.checked)}
          />
          Mostrar empresas inactivas
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtradas.length} empresa{filtradas.length === 1 ? "" : "s"}
        </span>
      </div>

      {errorCarga ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar: {errorCarga}
        </div>
      ) : null}

      <div className="card-soft rounded-xl bg-card">
        <Table stickyHeader>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[280px]">Empresa</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>RUT SII (usuario)</TableHead>
              <TableHead>Clave SII</TableHead>
              <TableHead>RUT Previred (usuario)</TableHead>
              <TableHead>Clave Previred</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  <span className="flex max-w-[280px] items-center gap-1.5">
                    {f.fijada ? (
                      <Pin
                        className="size-3.5 shrink-0 text-[var(--brand-teal)]"
                        aria-label="Credencial fijada"
                      />
                    ) : null}
                    <span className="truncate" title={f.razonSocial}>
                      {f.razonSocial}
                    </span>
                  </span>
                  {!f.activo ? (
                    <Badge variant="outline" className="mt-0.5 text-[10px] text-muted-foreground">
                      Inactiva
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  <span className="block max-w-[180px] truncate" title={f.grupo ?? undefined}>
                    {f.grupo ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <RutCopiable rut={f.rut} />
                </TableCell>
                <TableCell>
                  <ClaveCell
                    clienteId={f.id}
                    campo="clave_sii"
                    etiqueta="Clave SII"
                    razonSocial={f.razonSocial}
                    tiene={f.tieneClaveSii}
                  />
                </TableCell>
                <TableCell>
                  <RutPreviredCell clienteId={f.id} valorInicial={f.previredRut} />
                </TableCell>
                <TableCell>
                  <ClaveCell
                    clienteId={f.id}
                    campo="previred_clave"
                    etiqueta="Clave Previred"
                    razonSocial={f.razonSocial}
                    tiene={f.tieneClavePrevired}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sin resultados para la búsqueda.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
