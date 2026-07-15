import crypto from "crypto";

const COOKIE_NAME = "ls_task_dashboard_session";
const SESSION_SECONDS = 60 * 60 * 12;

type SessionPayload = { username: string; exp: number };

function secret(): string {
  const value = process.env.DASHBOARD_SESSION_SECRET;
  if (!value || value.length < 24) {
    throw new Error("DASHBOARD_SESSION_SECRET must be at least 24 characters.");
  }
  return value;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    username,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return false;
    const expected = sign(encoded);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return Boolean(payload.username) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function validCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.DASHBOARD_USERNAME ?? "";
  const expectedPass = process.env.DASHBOARD_PASSWORD ?? "";
  if (!expectedUser || !expectedPass) return false;
  const userA = Buffer.from(username);
  const userB = Buffer.from(expectedUser);
  const passA = Buffer.from(password);
  const passB = Buffer.from(expectedPass);
  return (
    userA.length === userB.length &&
    passA.length === passB.length &&
    crypto.timingSafeEqual(userA, userB) &&
    crypto.timingSafeEqual(passA, passB)
  );
}

export { COOKIE_NAME, SESSION_SECONDS };
