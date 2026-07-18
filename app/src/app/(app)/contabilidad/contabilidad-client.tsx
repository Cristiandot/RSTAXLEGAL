"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { activarContabilidadCompleta } from "./actions";
import { SelectorPeriodo } from "@/components/selector-periodo";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import { type ConciliacionRow } from "@/lib/ciclos";
import { type CategoriaDocumento } from "./categorias";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type DocumentoContable = {
  id: string;
  cliente_id: string;
  categoria: CategoriaDocumento;
  etiqueta: string | null;
  archivo_path: string;
  nombre_original: string;
  tamano_bytes: number | null;
  created_at: string;
  subido_por_nombre: string | null;
};

/** Estado de los libros RCV del período (solo empresas con contabilidad completa). */
export type RcvResumenFila = {
  cliente_id: string;
  docs_compras: number;
  docs_ventas: number;
  docs_honorarios: number;
  iva_credito_rcv: number;
  iva_debito_rcv: number;
  f29_iva_debito: number | null;
  f29_iva_credito: number | null;
};

const selectCls =
  "h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ResumenCard({
  label,
  valor,
  tono,
}: {
  label: string;
  valor: number;
  tono?: "ok" | "alerta";
}) {
  const color =
    tono === "ok"
      ? "text-emerald-600"
      : tono === "alerta"
        ? "text-red-600"
        : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold ${color}`}>{valor}</div>
    </div>
  );
}

/** Celda standby: la empresa aún no entra a contabilidad completa. */
function CeldaStandby({
  clienteId,
  razonSocial,
}: {
  clienteId: string;
  razonSocial: string;
}) {
  const router = useRouter();
  const [activando, start] = useTransition();

  function activar(e: React.MouseEvent) {
    e.stopPropagation();
    if (
      !window.confirm(
        `¿Activar la contabilidad completa de ${razonSocial}?\n\nLa empresa entra al proceso de libros RCV, plan de cuentas y validación F29 (como las pilotos).`,
      )
    )
      return;
    start(async () => {
      const res = await activarContabilidadCompleta(clienteId);
      if (res.ok) {
        toast.success(`${razonSocial}: contabilidad completa activada`);
        router.refresh();
      } else toast.error(res.error ?? "Error al activar");
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-6 items-center rounded-md border border-dashed border-border px-1.5 text-[11px] font-medium text-muted-foreground/70">
        standby
      </span>
      <button
        type="button"
        onClick={activar}
        disabled={activando}
        className="rounded-md px-1 text-[11px] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
      >
        {activando ? "Activando…" : "Activar"}
      </button>
    </span>
  );
}

/**
 * Celda de libros RCV (contabilidad completa): conteo importado y cuadratura
 * contra el F29. Click → grilla de libros, sin pasar por el detalle.
 */
function CeldaRcv({
  resumen,
  href,
}: {
  resumen: RcvResumenFila;
  href: string;
}) {
  const sinDocs = resumen.docs_compras === 0 && resumen.docs_ventas === 0;
  const sinF29 =
    resumen.f29_iva_debito === null && resumen.f29_iva_credito === null;
  const cuadra =
    !sinF29 &&
    Number(resumen.f29_iva_debito ?? 0) === Number(resumen.iva_debito_rcv) &&
    Number(resumen.f29_iva_credito ?? 0) === Number(resumen.iva_credito_rcv);

  return (
    <a
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-muted"
      title="Abrir libros de compras y ventas (RCV)"
    >
      {sinDocs ? (
        <span className="text-xs font-medium text-primary">Importar RCV →</span>
      ) : (
        <>
          <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted/40 px-1.5 text-[11px] font-semibold tabular-nums">
            C·{resumen.docs_compras}
          </span>
          <span className="inline-flex h-6 items-center rounded-md border border-border bg-muted/40 px-1.5 text-[11px] font-semibold tabular-nums">
            V·{resumen.docs_ventas}
          </span>
          {sinF29 ? (
            <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
              sin F29
            </Badge>
          ) : cuadra ? (
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              ✓ F29
            </Badge>
          ) : (
            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
              ≠ F29
            </Badge>
          )}
        </>
      )}
    </a>
  );
}

/**
 * Mini-checklist documental de la fila. Tres ítems (pedido de Cristian
 * 17-07-2026): RCV (compras+ventas del SII), BH boletas de honorarios y BT
 * boletas a terceros. Se encienden con datos ya importados del SII O con un
 * archivo subido; el resto de las categorías cuenta en el "+N".
 * BT se descarga junto con las BH (mismo informe de recibidas del SII), por
 * eso comparte su señal.
 */
function ChecklistDocs({
  conteos,
  adicionales,
  rcv,
}: {
  conteos: Record<string, number>;
  adicionales: number;
  rcv?: RcvResumenFila;
}) {
  const nC = rcv?.docs_compras ?? 0;
  const nV = rcv?.docs_ventas ?? 0;
  const nH = rcv?.docs_honorarios ?? 0;
  const archRcv = (conteos["fact_compras"] ?? 0) + (conteos["fact_ventas"] ?? 0);
  const archHon = conteos["honorarios"] ?? 0;
  const detalleSii = (n: number) => (n > 0 ? `${n} doc${n > 1 ? "s" : ""} del SII` : null);
  const detalleArch = (n: number) => (n > 0 ? `${n} archivo${n > 1 ? "s" : ""}` : null);
  const arma = (partes: (string | null)[]) =>
    partes.filter(Boolean).join(" + ") || "pendiente";

  const chips = [
    {
      key: "rcv",
      corta: "RCV",
      on: nC > 0 || nV > 0 || archRcv > 0,
      title: `Libros RCV del SII (compras y ventas): ${arma([
        nC + nV > 0 ? `C·${nC} V·${nV} del SII` : null,
        detalleArch(archRcv),
      ])}`,
    },
    {
      key: "bh",
      corta: "BH",
      on: nH > 0 || archHon > 0,
      title: `Boletas de honorarios recibidas: ${arma([
        detalleSii(nH),
        detalleArch(archHon),
      ])}`,
    },
    {
      key: "bt",
      corta: "BT",
      on: nH > 0 || archHon > 0,
      title:
        "Boletas a terceros (BTE): vienen incluidas en la descarga de boletas de honorarios del SII (la empresa es el receptor).",
    },
  ];
  return (
    <div className="flex items-center gap-1">
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={`inline-flex h-6 min-w-8 items-center justify-center rounded-md border px-1 text-[11px] font-semibold ${
            c.on
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-border bg-muted/40 text-muted-foreground/60"
          }`}
        >
          {c.corta}
        </span>
      ))}
      {adicionales > 0 ? (
        <span
          className="inline-flex h-6 items-center justify-center rounded-md border border-sky-200 bg-sky-50 px-1.5 text-[11px] font-semibold text-sky-700"
          title={`${adicionales} documento${adicionales > 1 ? "s" : ""} adicional${adicionales > 1 ? "es" : ""} (honorarios, otros gastos/ingresos)`}
        >
          +{adicionales}
        </span>
      ) : null}
    </div>
  );
}

export function ContabilidadClient({
  periodo,
  filas,
  documentos,
  rcvResumen = [],
  errorCarga,
}: {
  periodo: string;
  filas: ConciliacionRow[];
  documentos: DocumentoContable[];
  rcvResumen?: RcvResumenFila[];
  errorCarga: string | null;
}) {
  const router = useRouter();
  const [buscar, setBuscar] = useState("");
  // Proceso de aprendizaje contabilidad completa: la grilla parte mostrando
  // solo las empresas activadas (pilotos); el resto queda en standby y se va
  // activando una a una desde la misma grilla.
  const [contabF, setContabF] = useState("activadas");
  const [docsF, setDocsF] = useState("");
  const [orden, setOrden] = useState<Orden>(null);

  const rcvPorCliente = useMemo(
    () => new Map(rcvResumen.map((r) => [r.cliente_id, r])),
    [rcvResumen],
  );

  // Conteo de documentos por cliente y categoría
  const conteosPorCliente = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const d of documentos) {
      const c = m.get(d.cliente_id) ?? {};
      c[d.categoria] = (c[d.categoria] ?? 0) + 1;
      m.set(d.cliente_id, c);
    }
    return m;
  }, [documentos]);

  const conteosDe = (clienteId: string) =>
    conteosPorCliente.get(clienteId) ?? {};
  // Todo lo que no está en el checklist (RCV/BH/BT) cuenta en el "+N"
  const adicionalesDe = (clienteId: string) => {
    const c = conteosDe(clienteId);
    return ["boleta_ventas", "boleta_compras", "otro_gasto", "otro_ingreso", "otro"].reduce(
      (acc, cat) => acc + (c[cat] ?? 0),
      0,
    );
  };
  // Un documento "está" si alguien subió el archivo O si ya se importó del SII
  const facturasCompletas = (clienteId: string) => {
    const c = conteosDe(clienteId);
    const r = rcvPorCliente.get(clienteId);
    return (
      ((c["fact_compras"] ?? 0) > 0 || (r?.docs_compras ?? 0) > 0) &&
      ((c["fact_ventas"] ?? 0) > 0 || (r?.docs_ventas ?? 0) > 0)
    );
  };
  const sinDocumentos = (clienteId: string) => {
    const r = rcvPorCliente.get(clienteId);
    return (
      Object.keys(conteosDe(clienteId)).length === 0 &&
      (r?.docs_compras ?? 0) === 0 &&
      (r?.docs_ventas ?? 0) === 0 &&
      (r?.docs_honorarios ?? 0) === 0
    );
  };

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (contabF === "activadas" && !rcvPorCliente.has(c.cliente_id)) return false;
      if (contabF === "standby" && rcvPorCliente.has(c.cliente_id)) return false;
      if (docsF === "completos" && !facturasCompletas(c.cliente_id)) return false;
      if (docsF === "parciales" && (facturasCompletas(c.cliente_id) || sinDocumentos(c.cliente_id))) return false;
      if (docsF === "sin_docs" && !sinDocumentos(c.cliente_id)) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: ConciliacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "docs": {
          const conteo = conteosDe(c.cliente_id);
          return -Object.values(conteo).reduce((a, b) => a + b, 0);
        }
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, buscar, contabF, docsF, orden, conteosPorCliente, rcvPorCliente]);

  const resumen: {
    label: string;
    valor: number;
    tono?: "ok" | "alerta";
  }[] = [
    { label: "Total", valor: filas.length },
    {
      label: "Sin documentos",
      valor: filas.filter((c) => sinDocumentos(c.cliente_id)).length,
    },
    {
      label: "Carga parcial",
      valor: filas.filter(
        (c) => !sinDocumentos(c.cliente_id) && !facturasCompletas(c.cliente_id),
      ).length,
    },
    {
      label: "RCV completo",
      valor: filas.filter((c) => facturasCompletas(c.cliente_id)).length,
      tono: "ok",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Contabilidad
        </h1>
        <p className="text-sm text-muted-foreground">
          Documentos contables del mes por empresa: facturas, boletas,
          honorarios y otros. Haz click en una empresa para cargar sus archivos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {resumen.map((r) => (
          <ResumenCard
            key={r.label}
            label={r.label}
            valor={r.valor}
            tono={r.tono}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SelectorPeriodo
          periodo={periodo}
          onCambio={(p) => router.push(`/contabilidad?periodo=${p}`)}
        />

        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente o RUT…"
            className="h-9 w-56 bg-card pl-8"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </div>

        <select
          aria-label="Contabilidad completa"
          className={selectCls}
          value={contabF}
          onChange={(e) => setContabF(e.target.value)}
        >
          <option value="activadas">Contabilidad: activadas</option>
          <option value="standby">Contabilidad: en standby</option>
          <option value="">Todas las empresas</option>
        </select>

        <select
          aria-label="Documentos"
          className={selectCls}
          value={docsF}
          onChange={(e) => setDocsF(e.target.value)}
        >
          <option value="">Docs: todos</option>
          <option value="completos">RCV completo (compras y ventas)</option>
          <option value="parciales">Carga parcial</option>
          <option value="sin_docs">Sin documentos</option>
        </select>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtradas.length} de {filas.length} clientes
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
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[280px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="docs" orden={orden} setOrden={setOrden}>Documentos del mes</ThSort>
              <TableHead>Libros RCV</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  Sin resultados para este período y filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtradas.map((c) => (
                <TableRow
                  key={c.ciclo_id}
                  onClick={() =>
                    router.push(`/contabilidad/${c.cliente_id}?periodo=${periodo}`)
                  }
                  className="group cursor-pointer"
                >
                  <TableCell className="font-medium">
                    <span
                      className="block max-w-[240px] truncate"
                      title={c.razon_social}
                    >
                      {c.razon_social}
                    </span>
                  </TableCell>
                  <TableCell>{c.rut_empresa ?? "—"}</TableCell>
                  <TableCell>
                    <ChecklistDocs
                      conteos={conteosDe(c.cliente_id)}
                      adicionales={adicionalesDe(c.cliente_id)}
                      rcv={rcvPorCliente.get(c.cliente_id)}
                    />
                  </TableCell>
                  <TableCell>
                    {rcvPorCliente.has(c.cliente_id) ? (
                      <CeldaRcv
                        resumen={rcvPorCliente.get(c.cliente_id)!}
                        href={`/contabilidad/${c.cliente_id}/rcv?periodo=${periodo}`}
                      />
                    ) : (
                      <CeldaStandby
                        clienteId={c.cliente_id}
                        razonSocial={c.razon_social}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Checklist: RCV libros de compras y ventas del SII · BH boletas de
        honorarios · BT boletas a terceros (vienen incluidas en la descarga de
        honorarios) · +N documentos adicionales (boletas de venta/compra,
        otros gastos/ingresos). Verde = datos importados del SII o archivo
        cargado este mes.
        Libros RCV (contabilidad completa): C/V = documentos importados del
        SII · ✓ F29 = el IVA del RCV cuadra exacto con el F29 del período ·
        standby = empresa aún no activada (pasa el cursor sobre la fila para
        activarla). La grilla parte mostrando solo las activadas — usa el
        filtro &quot;Contabilidad&quot; para ver el resto.
      </p>
    </div>
  );
}
