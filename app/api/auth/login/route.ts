import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_SECONDS, createSessionToken, validCredentials } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  if (!validCredentials(username, password)) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(COOKIE_NAME, createSessionToken(username), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS
  });
  return response;
}

