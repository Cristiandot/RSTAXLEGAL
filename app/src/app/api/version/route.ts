import { NextResponse } from "next/server";

/** Diagnóstico: qué commit está sirviendo producción. */
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    mensaje: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? null,
  });
}
