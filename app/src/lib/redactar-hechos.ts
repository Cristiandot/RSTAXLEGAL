import Anthropic from "@anthropic-ai/sdk";

/**
 * Reescribe la descripción de hechos que envió el cliente (a menudo con faltas
 * de ortografía o ideas poco claras) en un párrafo formal apto para un
 * documento legal, usando Claude. Guardarraíles: no inventa hechos, conserva
 * fechas/nombres/montos exactos. El texto ORIGINAL del cliente queda siempre
 * guardado en la solicitud (datos.descripcion) — esto solo afecta al Word.
 *
 * Si no hay ANTHROPIC_API_KEY configurada o la llamada falla, devuelve el
 * texto original sin cambios (la generación de la carta nunca se bloquea).
 */
export async function redactarHechosFormales(
  descripcion: string,
  trabajadorNombre: string,
): Promise<{ texto: string; redactadoPorIA: boolean }> {
  const original = descripcion.trim();
  if (!original || !process.env.ANTHROPIC_API_KEY) {
    return { texto: original, redactadoPorIA: false };
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "Eres asistente legal de RS Tax & Legal, firma chilena. Recibirás la descripción de hechos que un empleador escribió para una carta de amonestación laboral, posiblemente con faltas de ortografía o redacción informal. Reescríbela como UN solo párrafo formal y claro, en español de Chile, en tercera persona (referida a el trabajador o la trabajadora según el nombre indicado; si el género no es inequívoco, usa una formulación neutra), con tono profesional y neutro apto para un documento legal.\n\nREGLAS ESTRICTAS:\n1. NO agregues hechos, conductas, causas ni calificaciones jurídicas que no estén en el texto original.\n2. Conserva EXACTAMENTE las fechas, horas, nombres, montos y lugares mencionados.\n3. Si algo es ambiguo, exprésalo de la forma más fiel posible sin inventar detalles.\n4. No incluyas la sanción ni artículos legales (eso va en otra parte de la carta).\n5. Responde SOLO con el párrafo reescrito — sin comillas, sin títulos, sin comentarios.",
      messages: [
        {
          role: "user",
          content: `Trabajador(a): ${trabajadorNombre}\n\nDescripción escrita por el empleador:\n${original}`,
        },
      ],
    });

    const texto = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!texto) return { texto: original, redactadoPorIA: false };
    return { texto, redactadoPorIA: true };
  } catch {
    // Cualquier error (key inválida, red, rate limit) → texto original
    return { texto: original, redactadoPorIA: false };
  }
}
