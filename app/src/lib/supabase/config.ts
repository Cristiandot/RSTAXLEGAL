/**
 * Configuración pública de Supabase (proyecto nnwoknmbbxbjzswrkzmw).
 *
 * Estos valores NO son secretos: la "publishable key" es pública por diseño y
 * está protegida por RLS (la misma que usan los HTML del repo). Se usan como
 * respaldo cuando no hay variables de entorno definidas (ej. si el deploy en
 * Vercel no las trae), para que la app funcione igual. Si se definen
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY, esas tienen prioridad.
 */
export const SUPABASE_URL = "https://nnwoknmbbxbjzswrkzmw.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_QCWRO4MqJqIzYPNQx7q6HQ_DE9g9zH6";

export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SUPABASE_PUBLISHABLE_KEY;
