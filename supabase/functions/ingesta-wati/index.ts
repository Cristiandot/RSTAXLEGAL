// Edge Function: ingesta-wati
//
// Recibe un requerimiento enviado por WhatsApp (comando #req) a través de
// Make/Wati y lo inserta en public.tareas_oficina, para que aparezca en la
// bandeja "Inicio y requerimientos" del panel (canal = 'whatsapp').
//
// Autorización propia (por eso se despliega con verify_jwt = false): valida un
// secreto compartido en el header `x-wati-secret` contra la variable de entorno
// WATI_INGESTA_SECRET. La inserción usa el SERVICE_ROLE_KEY que el runtime de
// edge provee automáticamente, de modo que esa clave NUNCA vive en Make: Make
// solo conoce el secreto acotado, que únicamente permite crear requerimientos.
//
// Body esperado (JSON):
//   { "texto": "<requerimiento>", "waId": "<numero>", "operatorName": "<opcional>" }
// También acepta { "text": "... #req <requerimiento>" } y extrae lo posterior a #req.
//
// Deploy: vía MCP de Supabase (deploy_edge_function, verify_jwt = false).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-wati-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const secret = Deno.env.get("WATI_INGESTA_SECRET");
  if (!secret) return json({ error: "Función sin secreto configurado" }, 500);
  if ((req.headers.get("x-wati-secret") ?? "").trim() !== secret.trim()) {
    return json({ error: "No autorizado" }, 401);
  }

  const raw = await req.json().catch(() => ({} as Record<string, unknown>));
  // Make con "Body input method = Data structure" de un solo campo (p.ej. "Version")
  // envuelve el JSON real como STRING dentro de esa clave. Si no vienen los campos
  // esperados al nivel superior, buscamos un valor string que sea JSON y lo abrimos.
  let body = raw as Record<string, unknown>;
  if (body && body.texto === undefined && body.text === undefined) {
    for (const v of Object.values(raw)) {
      if (typeof v === "string" && v.trim().startsWith("{")) {
        try {
          const inner = JSON.parse(v);
          if (inner && typeof inner === "object") {
            body = inner as Record<string, unknown>;
            break;
          }
        } catch {
          // no era JSON; seguir
        }
      }
    }
  }
  // Tolerante al nombre del campo del número (waId / wald / wa_id / phone / numero / from).
  const waId = String(
    body.waId ?? body.wald ?? body.wa_id ?? body.phone ?? body.numero ?? body.from ?? "",
  ).trim();
  const operador = String(body.operatorName ?? body.operator ?? "").trim();

  // Texto del requerimiento: prioriza `texto`; si viene `text` crudo, extrae lo
  // que sigue a "#req".
  let texto = String(body.texto ?? "").trim();
  if (!texto && typeof body.text === "string") {
    const raw = body.text as string;
    const i = raw.toLowerCase().indexOf("#req");
    texto = (i >= 0 ? raw.slice(i + 4) : raw).trim();
  }
  if (!texto) return json({ error: "Falta el texto del requerimiento" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolver el cliente por su número de WhatsApp (tabla cliente_whatsapp).
  // Devuelve cliente_id (empresa) solo si el grupo tiene una; el nombre del
  // grupo se usa para mostrar el cliente aunque no haya empresa unívoca.
  let clienteId: string | null = null;
  let clienteNombre: string | null = null;
  if (waId) {
    const { data } = await supabase.rpc("resolver_cliente_por_whatsapp", {
      p_wa: waId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      clienteId = row.cliente_id ?? null;
      clienteNombre = row.grupo_nombre ?? null;
    }
  }

  // La vista de la bandeja muestra `titulo — detalle`, así que el detalle NO
  // repite el texto (solo lo incluye si el título quedó truncado).
  const MAX_TITULO = 200;
  const truncado = texto.length > MAX_TITULO;
  const titulo = truncado ? texto.slice(0, MAX_TITULO) + "…" : texto;
  const fecha = new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
  const detalle = [
    truncado ? texto + "\n" : null,
    clienteNombre
      ? `Cliente: ${clienteNombre}`
      : "Cliente no identificado (número sin coincidencia)",
    `Vía #req desde WhatsApp (Wati)${operador ? ` · Operador: ${operador}` : ""}`,
    waId ? `WhatsApp: ${waId}` : null,
    `Recibido: ${fecha}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const { data: inserted, error } = await supabase
    .from("tareas_oficina")
    .insert({ titulo, detalle, cliente_id: clienteId, canal: "whatsapp" })
    .select("id")
    .single();

  if (error) return json({ error: error.message }, 500);

  return json(
    {
      ok: true,
      id: inserted.id,
      cliente_id: clienteId,
      cliente: clienteNombre,
      identificado: !!clienteNombre,
    },
    201,
  );
});
