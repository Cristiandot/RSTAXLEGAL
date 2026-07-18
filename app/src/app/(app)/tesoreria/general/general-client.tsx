"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Landmark, ArrowUpRight } from "lucide-react";
import { formatMonto, formatFecha } from "@/lib/format";
import { TesoreriaNav } from "../tesoreria-nav";
import { EmpresaSelect, type EmpresaOpcion } from "../empresa-select";

export type TopContraparte = { nombre: string; rut: string | null; monto: number; docs: number };
export type MovReciente = { id: string; fecha: string; glosa: string | null; abono: number; cargo: number; estado: string };
export type CuentaSaldo = { id: string; alias: string; fuente: string; saldo: number | null; pendientes: number };

function KpiCard({ label, valor, tono, sub }: { label: string; valor: string; tono?: "ok" | "alerta"; sub?: string }) {
  const color = tono === "ok" ? "text-emerald-600" : tono === "alerta" ? "text-red-600" : "";
  return (
    <div className="card-soft rounded-xl bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${color}`}>{valor}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TopTabla({
  titulo,
  filas,
  href,
  tono,
}: {
  titulo: string;
  filas: TopContraparte[];
  href: string;
  tono: "ok" | "alerta";
}) {
  return (
    <div className="card-soft rounded-xl bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold">{titulo}</h2>
        <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
          Ver todo <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {filas.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nada pendiente.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {filas.map((f, i) => (
              <tr key={`${f.rut}-${i}`} className="border-b border-border/50 last:border-0">
                <td className="py-1.5">
                  <span className="block">{f.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{f.docs} doc{f.docs !== 1 ? "s" : ""}</span>
                </td>
                <td className={`py-1.5 text-right tabular-nums font-medium ${tono === "ok" ? "text-emerald-600" : "text-red-600"}`}>
                  {formatMonto(f.monto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GeneralClient({
  clientes,
  clienteSeleccionado,
  saldo,
  totalCxC,
  totalCxP,
  topCobrar,
  topPagar,
  cuentas,
  movs,
  generado,
}: {
  clientes: EmpresaOpcion[];
  clienteSeleccionado: string | null;
  saldo: number;
  totalCxC: number;
  totalCxP: number;
  topCobrar: TopContraparte[];
  topPagar: TopContraparte[];
  cuentas: CuentaSaldo[];
  movs: MovReciente[];
  generado: string;
}) {
  const router = useRouter();
  const proyectado = saldo + totalCxC - totalCxP;
  const q = clienteSeleccionado ? `?cliente=${clienteSeleccionado}` : "";

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-muted-foreground" />
        <h1 className="font-heading text-2xl font-semibold">Tesorería</h1>
      </div>

      <TesoreriaNav cliente={clienteSeleccionado} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="block text-xs text-muted-foreground">Empresa</label>
          <EmpresaSelect
            empresas={clientes}
            value={clienteSeleccionado ?? ""}
            onChange={(id) => router.push(`/tesoreria/general?cliente=${id}`)}
          />
        </div>
        <span className="text-xs text-muted-foreground">Al día {formatFecha(generado)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Saldo en banco" valor={formatMonto(saldo)} />
        <KpiCard label="Por cobrar" valor={formatMonto(totalCxC)} tono="ok" />
        <KpiCard label="Por pagar" valor={formatMonto(totalCxP)} tono="alerta" />
        <KpiCard
          label="Saldo proyectado"
          valor={formatMonto(proyectado)}
          tono={proyectado >= 0 ? "ok" : "alerta"}
          sub="si se cobra y paga todo lo pendiente"
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <TopTabla titulo="Top por cobrar" filas={topCobrar} href={`/tesoreria/cuentas?tipo=cobrar${clienteSeleccionado ? `&cliente=${clienteSeleccionado}` : ""}`} tono="ok" />
        <TopTabla titulo="Top por pagar" filas={topPagar} href={`/tesoreria/cuentas?tipo=pagar${clienteSeleccionado ? `&cliente=${clienteSeleccionado}` : ""}`} tono="alerta" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {/* Cuentas bancarias */}
        <div className="card-soft rounded-xl bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">Cuentas bancarias</h2>
            <Link href={`/tesoreria${q}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              Conciliar <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {cuentas.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin cuentas cargadas. El cliente sube su cartola desde su portal.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {cuentas.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5">
                      <span className="block">{c.alias}</span>
                      {c.pendientes > 0 && <span className="block text-xs text-amber-600">{c.pendientes} por conciliar</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{c.saldo == null ? "—" : formatMonto(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Últimos movimientos */}
        <div className="card-soft rounded-xl bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">Últimos movimientos</h2>
            <Link href={`/tesoreria${q}`} className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
              Ver banco <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {movs.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin movimientos.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 last:border-0">
                    <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-muted-foreground">{formatFecha(m.fecha)}</td>
                    <td className="py-1.5">{m.glosa || "—"}</td>
                    <td className={`py-1.5 text-right tabular-nums ${m.abono > 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {m.abono > 0 ? formatMonto(m.abono) : `-${formatMonto(m.cargo)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
