"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { activarContabilidadCompleta } from "./actions";
import { opcionesPeriodo } from "@/lib/periodos";
import { comparar, type Orden } from "@/lib/ordenar";
import { ThSort } from "@/components/th-sort";
import {
  claseEstado,
  type ConciliacionRow,
  type UsuarioOpcion,
} from "@/lib/ciclos";
import {
  CATEGORIAS_ADICIONALES,
  CATEGORIAS_PRINCIPALES,
  type CategoriaDocumento,
} from "./categorias";
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
  iva_credito_rcv: number;
  iva_debito_rcv: number;
  f29_iva_debito: number | null;
  f29_iva_credito: number | null;
};

const ESTADOS = [
  "Sin iniciar",
  "Descargando",
  "Listo para conciliar",
  "Conciliado",
];

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

function BadgeKame({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-muted-foreground">—</span>;
  return estado === "ON" ? (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      ON
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
      OFF
    </Badge>
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

/** Mini-checklist documental de la fila: una sigla por categoría principal. */
function ChecklistDocs({
  conteos,
  adicionales,
}: {
  conteos: Record<string, number>;
  adicionales: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {CATEGORIAS_PRINCIPALES.map((c) => {
        const n = conteos[c.value] ?? 0;
        return (
          <span
            key={c.value}
            title={`${c.label}: ${n > 0 ? `${n} archivo${n > 1 ? "s" : ""}` : "pendiente"}`}
            className={`inline-flex h-6 min-w-7 items-center justify-center rounded-md border px-1 text-[11px] font-semibold ${
              n > 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border bg-muted/40 text-muted-foreground/60"
            }`}
          >
            {c.corta}
            {n > 1 ? `·${n}` : ""}
          </span>
        );
      })}
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
  usuarios,
  documentos,
  rcvResumen = [],
  errorCarga,
}: {
  periodo: string;
  filas: ConciliacionRow[];
  usuarios: UsuarioOpcion[];
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
  const [estadoF, setEstadoF] = useState("");
  const [docsF, setDocsF] = useState("");
  const [kameF, setKameF] = useState("");
  const [saludF, setSaludF] = useState("");
  const [respF, setRespF] = useState("");
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
  const adicionalesDe = (clienteId: string) => {
    const c = conteosDe(clienteId);
    return CATEGORIAS_ADICIONALES.reduce(
      (acc, cat) => acc + (c[cat.value] ?? 0),
      (c["otro"] ?? 0),
    );
  };
  const facturasCompletas = (clienteId: string) => {
    const c = conteosDe(clienteId);
    return (c["fact_compras"] ?? 0) > 0 && (c["fact_ventas"] ?? 0) > 0;
  };
  const sinDocumentos = (clienteId: string) =>
    Object.keys(conteosDe(clienteId)).length === 0;

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const out = filas.filter((c) => {
      if (q) {
        const t = `${c.razon_social} ${c.rut_empresa ?? ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }
      if (contabF === "activadas" && !rcvPorCliente.has(c.cliente_id)) return false;
      if (contabF === "standby" && rcvPorCliente.has(c.cliente_id)) return false;
      if (estadoF && c.estado !== estadoF) return false;
      if (docsF === "completos" && !facturasCompletas(c.cliente_id)) return false;
      if (docsF === "parciales" && (facturasCompletas(c.cliente_id) || sinDocumentos(c.cliente_id))) return false;
      if (docsF === "sin_docs" && !sinDocumentos(c.cliente_id)) return false;
      if (kameF && c.kame_cert_estado !== kameF) return false;
      if (saludF === "si" && !c.es_profesional_salud) return false;
      if (saludF === "no" && c.es_profesional_salud) return false;
      if (respF === "__SIN_ASIGNAR__") {
        if (c.responsable) return false;
      } else if (respF && c.responsable !== respF) return false;
      return true;
    });
    if (!orden) return out;
    const valor = (c: ConciliacionRow): unknown => {
      switch (orden.col) {
        case "cliente": return c.razon_social;
        case "kame": return c.kame_cert_estado;
        case "salud": return c.es_profesional_salud ? 0 : 1;
        case "estado": return c.estado;
        case "responsable": return c.responsable;
        case "docs": {
          const conteo = conteosDe(c.cliente_id);
          return -Object.values(conteo).reduce((a, b) => a + b, 0);
        }
        case "iva": return c.es_profesional_salud ? c.iva_salud_ejecuciones : null;
        default: return null;
      }
    };
    return [...out].sort((a, b) => comparar(valor(a), valor(b), orden.dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, buscar, contabF, estadoF, docsF, kameF, saludF, respF, orden, conteosPorCliente, rcvPorCliente]);

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
      label: "Facturas C+V",
      valor: filas.filter((c) => facturasCompletas(c.cliente_id)).length,
      tono: "ok",
    },
    {
      label: "Conciliados",
      valor: filas.filter((c) => c.estado === "Conciliado").length,
      tono: "ok",
    },
    {
      label: "KAME OFF",
      valor: filas.filter((c) => c.kame_cert_estado === "OFF").length,
      tono: "alerta",
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Contabilidad mensual
        </h1>
        <p className="text-sm text-muted-foreground">
          Documentos contables del mes por empresa: facturas, boletas,
          honorarios y otros. Haz click en una empresa para cargar sus archivos.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
        <select
          aria-label="Período"
          className={selectCls}
          value={periodo}
          onChange={(e) => router.push(`/contabilidad?periodo=${e.target.value}`)}
        >
          {opcionesPeriodo().map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

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
          <option value="completos">Facturas C+V completas</option>
          <option value="parciales">Carga parcial</option>
          <option value="sin_docs">Sin documentos</option>
        </select>

        <select
          aria-label="Estado"
          className={selectCls}
          value={estadoF}
          onChange={(e) => setEstadoF(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          aria-label="KAME"
          className={selectCls}
          value={kameF}
          onChange={(e) => setKameF(e.target.value)}
        >
          <option value="">KAME: todos</option>
          <option value="ON">KAME ON</option>
          <option value="OFF">KAME OFF</option>
        </select>

        <select
          aria-label="Salud"
          className={selectCls}
          value={saludF}
          onChange={(e) => setSaludF(e.target.value)}
        >
          <option value="">Todos</option>
          <option value="si">Solo Salud (IVA semanal)</option>
          <option value="no">No salud</option>
        </select>

        <select
          aria-label="Responsable"
          className={selectCls}
          value={respF}
          onChange={(e) => setRespF(e.target.value)}
        >
          <option value="">Todos los responsables</option>
          <option value="__SIN_ASIGNAR__">Sin asignar</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.nombre}>
              {u.nombre}
            </option>
          ))}
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

      <div className="card-soft overflow-x-auto rounded-xl bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <ThSort col="cliente" orden={orden} setOrden={setOrden} className="w-[240px]">Cliente</ThSort>
              <TableHead>RUT</TableHead>
              <ThSort col="docs" orden={orden} setOrden={setOrden}>Documentos del mes</ThSort>
              <TableHead>Libros RCV</TableHead>
              <ThSort col="estado" orden={orden} setOrden={setOrden}>Estado</ThSort>
              <ThSort col="kame" orden={orden} setOrden={setOrden}>KAME</ThSort>
              <ThSort col="salud" orden={orden} setOrden={setOrden}>Salud</ThSort>
              <ThSort col="responsable" orden={orden} setOrden={setOrden}>Responsable</ThSort>
              <ThSort col="iva" orden={orden} setOrden={setOrden}>IVA cambios</ThSort>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
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
                  <TableCell>
                    <Badge variant="outline" className={claseEstado(c.estado)}>
                      {c.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BadgeKame estado={c.kame_cert_estado} />
                  </TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      <Badge
                        variant="outline"
                        className="border-pink-200 bg-pink-50 text-pink-700"
                      >
                        Salud
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{c.responsable ?? "—"}</TableCell>
                  <TableCell>
                    {c.es_profesional_salud ? (
                      c.iva_salud_ejecuciones > 0 ? (
                        <span>
                          <strong>{c.iva_salud_ejecuciones}</strong> cambios
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          Sin cambios
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Checklist: FC facturas de compras · FV facturas de ventas · BV ventas
        con boleta · BC compras con boleta · +N documentos adicionales
        (honorarios, otros gastos/ingresos). Verde = archivo cargado este mes.
        Libros RCV (contabilidad completa): C/V = documentos importados del
        SII · ✓ F29 = el IVA del RCV cuadra exacto con el F29 del período ·
        standby = empresa aún no activada (pasa el cursor sobre la fila para
        activarla). La grilla parte mostrando solo las activadas — usa el
        filtro &quot;Contabilidad&quot; para ver el resto.
      </p>
    </div>
  );
}
