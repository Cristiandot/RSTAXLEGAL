"use client";

import { useMemo, useState, type ReactNode } from "react";
import { KeyRound, Pin, Search } from "lucide-react";
import { ClaveCell, RutPreviredCell } from "@/components/credencial-celdas";
import { RutCopiable } from "@/components/rut-copiable";
import { ThSort } from "@/components/th-sort";
import { comparar, ordenarPorGrupo, type Orden } from "@/lib/ordenar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
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
  mutualInstitucion: string | null; // "ACHS" | "IST" | "Mutual de Seguridad" | null
  mutualRut: string | null; // usuario del portal de la mutual
  tieneClaveMutual: boolean;
  afcRut: string | null; // usuario AFC (cesantía)
  tieneClaveAfc: boolean;
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
  const [orden, setOrden] = useState<Orden>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = useMemo(
    () => (selId ? (filas.find((f) => f.id === selId) ?? null) : null),
    [selId, filas],
  );

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((f) => {
      if (!verInactivas && !f.activo) return false;
      if (!q) return true;
      return `${f.razonSocial} ${f.rut ?? ""} ${f.previredRut ?? ""} ${f.mutualRut ?? ""} ${f.mutualInstitucion ?? ""} ${f.grupo ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    // Orden por defecto: fijadas arriba (claves de la oficina) y, dentro de
    // cada bloque, prioridad de cartera por el código que abre `grupo`
    // ("A.4 — Red Barrera" ordena A.1 → D.45 gracias a la collation numérica),
    // con la razón social como desempate.
    if (!orden) {
      return [
        ...ordenarPorGrupo(out.filter((f) => f.fijada), (f) => f.grupo, (f) => f.razonSocial),
        ...ordenarPorGrupo(out.filter((f) => !f.fijada), (f) => f.grupo, (f) => f.razonSocial),
      ];
    }
    const val = (f: CredencialRow): unknown => {
      switch (orden.col) {
        case "empresa":
          return f.razonSocial;
        case "cliente":
          return f.grupo;
        case "rutSii":
          return f.rut;
        // Las claves nunca viajan al navegador: se ordena por si hay credencial o no.
        case "claveSii":
          return f.tieneClaveSii ? 1 : 0;
        case "rutPrevired":
          return f.previredRut;
        case "clavePrevired":
          return f.tieneClavePrevired ? 1 : 0;
        default:
          return null;
      }
    };
    return [...out].sort((a, b) => comparar(val(a), val(b), orden.dir));
  }, [filas, buscar, verInactivas, orden]);

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
          Claves de cada empresa. Vienen ocultas: el ojo la muestra, el otro
          botón la copia sin mostrarla y el lápiz la cambia. Cada vez que
          alguien ve o copia una clave queda registrado.{" "}
          <span className="font-medium text-foreground">
            Haz clic en una empresa
          </span>{" "}
          para ver todas sus credenciales (SII, Previred, AFC y Mutual). {conSii}{" "}
          de {activas.length} empresas activas con clave SII y {conPrevired} con
          clave Previred.
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
              <ThSort col="empresa" orden={orden} setOrden={setOrden} className="w-[280px]">
                Empresa
              </ThSort>
              <ThSort col="cliente" orden={orden} setOrden={setOrden}>
                Cliente
              </ThSort>
              <ThSort col="rutSii" orden={orden} setOrden={setOrden}>
                RUT SII (usuario)
              </ThSort>
              <ThSort col="claveSii" orden={orden} setOrden={setOrden}>
                Clave SII
              </ThSort>
              <ThSort col="rutPrevired" orden={orden} setOrden={setOrden}>
                RUT Previred (usuario)
              </ThSort>
              <ThSort col="clavePrevired" orden={orden} setOrden={setOrden}>
                Clave Previred
              </ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((f) => (
              <TableRow
                key={f.id}
                className="cursor-pointer"
                onClick={() => setSelId(f.id)}
                title="Ver todas las credenciales"
              >
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

      <Dialog open={sel !== null} onOpenChange={(o) => { if (!o) setSelId(null); }}>
        {sel ? (
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading">
                {sel.fijada ? (
                  <Pin className="size-4 text-[var(--brand-teal)]" />
                ) : null}
                {sel.razonSocial}
              </DialogTitle>
              <DialogDescription>
                {sel.grupo ? `${sel.grupo} · ` : ""}
                {sel.rut ?? "sin RUT"}. Ver o copiar una clave queda auditado.
              </DialogDescription>
            </DialogHeader>
            <CredencialDetalle fila={sel} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** Detalle de una empresa: todas sus credenciales (SII, Previred, AFC, Mutual),
 * cada una con usuario y clave oculta con revelar/copiar/editar auditado. */
function CredencialDetalle({ fila }: { fila: CredencialRow }) {
  return (
    <div className="space-y-4">
      <BloqueCredencial titulo="SII" subtitulo="Clave tributaria de la empresa">
        <CampoUsuario etiqueta="Usuario (RUT empresa)">
          <RutCopiable rut={fila.rut} />
        </CampoUsuario>
        <CampoClave>
          <ClaveCell
            clienteId={fila.id}
            campo="clave_sii"
            etiqueta="Clave SII"
            razonSocial={fila.razonSocial}
            tiene={fila.tieneClaveSii}
          />
        </CampoClave>
      </BloqueCredencial>

      <BloqueCredencial titulo="Previred">
        <CampoUsuario etiqueta="Usuario (RUT)">
          <RutPreviredCell
            clienteId={fila.id}
            valorInicial={fila.previredRut}
            campo="previred_rut"
            etiqueta="RUT Previred"
          />
        </CampoUsuario>
        <CampoClave>
          <ClaveCell
            clienteId={fila.id}
            campo="previred_clave"
            etiqueta="Clave Previred"
            razonSocial={fila.razonSocial}
            tiene={fila.tieneClavePrevired}
          />
        </CampoClave>
      </BloqueCredencial>

      <BloqueCredencial titulo="AFC" subtitulo="Seguro de cesantía">
        <CampoUsuario etiqueta="Usuario (RUT)">
          <RutPreviredCell
            clienteId={fila.id}
            valorInicial={fila.afcRut}
            campo="afc_rut"
            etiqueta="RUT AFC"
          />
        </CampoUsuario>
        <CampoClave>
          <ClaveCell
            clienteId={fila.id}
            campo="afc_clave"
            etiqueta="Clave AFC"
            razonSocial={fila.razonSocial}
            tiene={fila.tieneClaveAfc}
          />
        </CampoClave>
      </BloqueCredencial>

      <BloqueCredencial
        titulo="Mutual"
        subtitulo={fila.mutualInstitucion ?? "Sin institución registrada"}
      >
        <CampoUsuario etiqueta="Usuario (RUT)">
          <RutPreviredCell
            clienteId={fila.id}
            valorInicial={fila.mutualRut}
            campo="mutual_rut"
            etiqueta="RUT Mutual"
          />
        </CampoUsuario>
        <CampoClave>
          <ClaveCell
            clienteId={fila.id}
            campo="mutual_clave"
            etiqueta="Clave Mutual"
            razonSocial={fila.razonSocial}
            tiene={fila.tieneClaveMutual}
          />
        </CampoClave>
      </BloqueCredencial>
    </div>
  );
}

function BloqueCredencial({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2">
        <span className="text-sm font-semibold">{titulo}</span>
        {subtitulo ? (
          <span className="ml-2 text-xs text-muted-foreground">{subtitulo}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

function CampoUsuario({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      {children}
    </div>
  );
}

function CampoClave({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-muted-foreground">Clave</div>
      {children}
    </div>
  );
}
