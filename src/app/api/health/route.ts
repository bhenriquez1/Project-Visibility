import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Infrastructure connectivity check — see INFRASTRUCTURE.md. Never claims a connection that
 * doesn't exist; a failure here means exactly what it says, not a transient blip to retry past.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: "unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
