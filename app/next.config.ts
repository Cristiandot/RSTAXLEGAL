import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las plantillas .docx se leen del filesystem en runtime (generación de
  // contratos); hay que incluirlas explícitamente en el bundle serverless.
  outputFileTracingIncludes: {
    "/contratos/**": ["./plantillas/**/*"],
  },
};

export default nextConfig;
