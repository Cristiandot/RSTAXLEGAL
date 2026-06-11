import Anthropic from "@anthropic-ai/sdk";

/**
 * Convierte el texto libre del cliente sobre "otras consideraciones
 * remuneracionales" (bonos, comisiones, aguinaldos, descuentos pactados —
 * a menudo mal escrito o desordenado) en redacción de cláusula contractual
 * formal, y pule las cláusulas adicionales escritas por el equipo. Devuelve
 * el texto listo para el placeholder {CLAUSULAS_ADICIONALES} del contrato.
 *
 * Sin ANTHROPIC_API_KEY (o si la llamada falla): devuelve solo las cláusulas
 * internas tal cual (comportamiento previo) — el texto crudo del cliente
 * NUNCA entra al contrato sin pasar por la IA; queda en observaciones para
 * que el equipo lo redacte a mano.
 */
export async function redactarClausulasContrato(
  consideracionesCliente: string,
  clausulasInternas: string,
): Promise<{ texto: string; redactadoPorIA: boolean }> {
  const cliente = consideracionesCliente.trim();
  const internas = clausulasInternas.trim();
  const fallback = { texto: internas, redactadoPorIA: false };
  if ((!cliente && !internas) || !process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system:
        "Eres asistente legal de RS Tax & Legal, firma chilena. Recibirás texto libre sobre condiciones remuneracionales adicionales de un contrato de trabajo chileno: lo que escribió el EMPLEADOR (posiblemente con faltas de ortografía o ideas desordenadas: bonos, comisiones, aguinaldos, asignaciones o descuentos pactados) y/o un borrador de cláusula del equipo. Redáctalo como texto de cláusula contractual formal: una o más oraciones en tercera persona (\"El Empleador pagará…\", \"Las partes pactan…\"), español de Chile, claro y preciso.\n\nREGLAS ESTRICTAS:\n1. Incluye SOLO lo que está en el texto recibido — no agregues beneficios, condiciones ni montos que no estén.\n2. Conserva EXACTAMENTE los montos, porcentajes, metas y plazos mencionados; si una condición es ambigua, redáctala fiel a lo dicho sin completarla.\n3. NO repitas conceptos que ya tienen cláusula propia en el contrato (sueldo base, movilización, colación, pérdida de caja, gratificación), salvo que el texto agregue una condición distinta sobre ellos.\n4. No cites artículos legales que no estén en el texto.\n5. Si el texto no contiene ninguna condición pactable (ej. \"ninguna\", saludos, comentarios), responde exactamente: NADA\n6. Responde SOLO con el texto de la cláusula — sin título, sin comillas, sin comentarios.",
      messages: [
        {
          role: "user",
          content: [
            cliente ? `Texto del empleador (consideraciones remuneracionales):\n${cliente}` : null,
            internas ? `Borrador de cláusula del equipo:\n${internas}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    const texto = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!texto || texto === "NADA") return { texto: internas, redactadoPorIA: texto === "NADA" };
    return { texto, redactadoPorIA: true };
  } catch {
    return fallback;
  }
}

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
