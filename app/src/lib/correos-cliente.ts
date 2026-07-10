import { createClient } from "@/lib/supabase/server";

/**
 * Correos adicionales de uno o más clientes (clientes.correos_adicionales),
 * para mandarlos en copia (CC) en todo correo que sale al cliente. Limpia,
 * deduplica (case-insensitive) y excluye los que ya van como destinatario.
 * Solo para uso en server actions.
 */
export async function correosCopiaCliente(
  clienteIds: string[],
  excluir: (string | null | undefined)[],
): Promise<string[]> {
  const ids = clienteIds.filter(Boolean);
  if (ids.length === 0) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("correos_adicionales")
    .in("id", ids);

  const excl = new Set(
    excluir.filter(Boolean).map((c) => c!.trim().toLowerCase()),
  );
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const fila of data ?? []) {
    const lista = Array.isArray(fila.correos_adicionales)
      ? (fila.correos_adicionales as unknown[])
      : [];
    for (const raw of lista) {
      const correo = String(raw ?? "").trim();
      const clave = correo.toLowerCase();
      if (!correo.includes("@") || excl.has(clave) || vistos.has(clave)) continue;
      vistos.add(clave);
      out.push(correo);
    }
  }
  return out;
}
