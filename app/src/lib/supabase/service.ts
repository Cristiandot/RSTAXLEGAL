import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Cliente Supabase con service role (salta RLS). SOLO para route handlers del
 * agente (/api/agent/*) y procesos de servidor sin sesión de usuario. Jamás
 * importarlo desde componentes ni exponer su key al navegador.
 */
export function createServiceClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no está configurada en el entorno.");
  }
  return createSupabaseClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
