"use client";

/**
 * Selector de empresa de la sección Tesorería, agrupado por categoría de la
 * cartera (código del grupo: A → B → C → D, luego el resto), y dentro de cada
 * letra por número (A.1, A.2… C.2 antes que C.10).
 */
export type EmpresaOpcion = {
  id: string;
  razonSocial: string;
  codigo: string | null; // grupos_cliente.codigo, ej. "C.12"
};

const ORDEN_LETRAS = ["A", "B", "C", "D"];

function partes(codigo: string | null): { letra: string; num: number } {
  const m = (codigo ?? "").trim().match(/^([A-Za-z]+)\.?(\d+)?/);
  return { letra: (m?.[1] ?? "").toUpperCase(), num: m?.[2] ? Number(m[2]) : 9999 };
}

function claveLetra(letra: string): number {
  const i = ORDEN_LETRAS.indexOf(letra);
  if (i >= 0) return i;
  if (letra) return ORDEN_LETRAS.length; // otras letras (W, Z...) después de la D
  return ORDEN_LETRAS.length + 1; // sin grupo al final
}

export function agruparEmpresas(empresas: EmpresaOpcion[]) {
  const orden = [...empresas].sort((a, b) => {
    const pa = partes(a.codigo);
    const pb = partes(b.codigo);
    if (claveLetra(pa.letra) !== claveLetra(pb.letra)) return claveLetra(pa.letra) - claveLetra(pb.letra);
    if (pa.letra !== pb.letra) return pa.letra.localeCompare(pb.letra);
    if (pa.num !== pb.num) return pa.num - pb.num;
    return a.razonSocial.localeCompare(b.razonSocial, "es");
  });
  const grupos: { etiqueta: string; items: EmpresaOpcion[] }[] = [];
  for (const e of orden) {
    const { letra } = partes(e.codigo);
    const etiqueta = letra ? `Categoría ${letra}` : "Sin categoría";
    const g = grupos[grupos.length - 1];
    if (g && g.etiqueta === etiqueta) g.items.push(e);
    else grupos.push({ etiqueta, items: [e] });
  }
  return grupos;
}

export function EmpresaSelect({
  empresas,
  value,
  onChange,
  className,
}: {
  empresas: EmpresaOpcion[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const grupos = agruparEmpresas(empresas);
  return (
    <select
      className={
        className ??
        "mt-1 h-9 w-72 rounded-md border border-input bg-card px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      }
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {grupos.map((g) => (
        <optgroup key={g.etiqueta} label={g.etiqueta}>
          {g.items.map((e) => (
            <option key={e.id} value={e.id}>
              {e.codigo ? `${e.codigo} · ` : ""}
              {e.razonSocial}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
