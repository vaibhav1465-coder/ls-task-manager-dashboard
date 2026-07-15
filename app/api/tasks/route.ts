import { NextRequest, NextResponse } from "next/server";
import { fetchTaskDashboard } from "@/lib/google-sheets";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: NextRequest): boolean {
  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60000 });
    return false;
  }
  current.count += 1;
  return current.count > 60;
}

export async function GET(request: NextRequest) {
  if (!verifySessionToken(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (rateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }
  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const data = await fetchTaskDashboard(force);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    console.error("Task dashboard API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Google Sheet data." },
      { status: 500 }
    );
  }
}
