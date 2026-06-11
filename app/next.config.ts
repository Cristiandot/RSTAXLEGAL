import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Carga de documentos SII (RCV) vía Server Actions: el default de 1 MB
  // queda corto para algunos CSV/Excel mensuales.
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
  },
};

export default nextConfig;
