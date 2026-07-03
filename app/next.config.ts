import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Carga de documentos vía Server Actions (RCV SII, facturas en lote): el
  // default de 1 MB queda corto. OJO: el límite duro de Vercel por request es
  // ~4.5MB — las cargas masivas deben ir en tandas bajo ese tope.
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  // Las plantillas .docx se leen del filesystem en runtime (generación de
  // contratos); hay que incluirlas explícitamente en el bundle serverless.
  outputFileTracingIncludes: {
    "/contratos": ["./plantillas/**/*"],
    "/contratos/**": ["./plantillas/**/*"],
    "/gestiones": ["./plantillas/**/*"],
    "/gestiones/**": ["./plantillas/**/*"],
    "/finiquitos": ["./plantillas/**/*"],
    "/finiquitos/**": ["./plantillas/**/*"],
    "/mutuo": ["./plantillas/**/*"],
    "/mutuo/**": ["./plantillas/**/*"],
    "/rihs": ["./plantillas/**/*"],
    "/rihs/**": ["./plantillas/**/*"],
    "/casa-particular": ["./plantillas/**/*"],
    "/casa-particular/**": ["./plantillas/**/*"],
    "/solicitud/**": ["./plantillas/**/*"],
  },
};

export default nextConfig;
