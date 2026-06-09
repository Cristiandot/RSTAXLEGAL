import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublishableKey } from "./config";

/**
 * Cliente Supabase para componentes de cliente (browser).
 * Usa la publishable key, protegida por RLS.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
