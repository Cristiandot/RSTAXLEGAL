/**
 * Envío de correos vía Resend API (dominio rstaxlegal.cl ya verificado).
 * Requiere RESEND_API_KEY en las variables de entorno (Vercel / .env.local).
 *
 * Remitente: si se pasa `de` con un correo @rstaxlegal.cl (el usuario
 * conectado, vía getUsuarioActual), el correo sale A SU NOMBRE — el dominio
 * completo está verificado en Resend, así que cualquier casilla de la firma
 * es remitente válido (DKIM alineado). El remitente además va en copia oculta
 * (queda registro en su buzón M365, ya que el envío no pasa por Outlook) y en
 * reply-to (las respuestas del cliente le llegan directo). Sin `de`, fallback
 * al remitente genérico notificaciones@.
 */

const REMITENTE_GENERICO = "RS Tax & Legal <notificaciones@rstaxlegal.cl>";

export type Adjunto = { filename: string; content: string }; // content en base64

export async function enviarCorreo({
  para,
  asunto,
  html,
  adjuntos,
  de,
}: {
  para: string;
  asunto: string;
  html: string;
  adjuntos?: Adjunto[];
  /** Usuario conectado que envía — el correo sale a su nombre. */
  de?: { nombre: string; correo: string };
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Falta configurar RESEND_API_KEY en las variables de entorno (Vercel → Settings → Environment Variables). Mientras tanto, usa 'Marcar enviado' y envíalo manualmente.",
    };
  }

  // Solo casillas del dominio verificado pueden ser remitente.
  const remitentePropio = de && de.correo.toLowerCase().endsWith("@rstaxlegal.cl");
  const from = remitentePropio ? `${de!.nombre} <${de!.correo}>` : REMITENTE_GENERICO;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [para],
      subject: asunto,
      html,
      attachments: adjuntos,
      ...(de
        ? {
            reply_to: [de.correo],
            bcc: [de.correo],
          }
        : {}),
    }),
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => "");
    return { ok: false, error: `Resend respondió ${res.status}: ${detalle.slice(0, 300)}` };
  }
  return { ok: true };
}

/** Plantilla simple de correo con la identidad de la firma. */
export function htmlCorreoDocumento({
  titulo,
  cuerpo,
}: {
  titulo: string;
  cuerpo: string;
}): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#0b2545;border-radius:12px 12px 0 0;padding:18px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:bold;">Rodríguez Samith · Tax &amp; Legal</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:24px;color:#0a1a2f;font-size:14px;line-height:1.6;">
      <h1 style="font-size:18px;margin:0 0 12px;">${titulo}</h1>
      ${cuerpo}
      <p style="margin:20px 0 0;color:#64748b;font-size:12px;">
        Este correo fue enviado por RS Tax &amp; Legal. Si tienes dudas, responde
        directamente a tu ejecutivo o escríbenos.
      </p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:14px;">
      Rodríguez Samith Tax &amp; Legal · Viña del Mar
    </p>
  </div>
</body></html>`;
}
