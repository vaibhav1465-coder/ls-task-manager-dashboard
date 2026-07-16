import crypto from "crypto";

export const COOKIE_NAME = "ls_task_dashboard_session";
export const SESSION_SECONDS = 60 * 60 * 12;
type Payload = { username: string; exp: number };

function getSecret(): string {
  const value = process.env.DASHBOARD_SESSION_SECRET || "";
  if (value.length < 24) throw new Error("DASHBOARD_SESSION_SECRET must be at least 24 characters.");
  return value;
}
function sign(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}
export function createSessionToken(username: string): string {
  const encoded = Buffer.from(JSON.stringify({ username, exp: Math.floor(Date.now()/1000)+SESSION_SECONDS } satisfies Payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}
export function verifySessionToken(token?: string | null): boolean {
  if (!token) return false;
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return false;
    const a = Buffer.from(signature); const b = Buffer.from(sign(encoded));
    if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return false;
    const payload = JSON.parse(Buffer.from(encoded,"base64url").toString("utf8")) as Payload;
    return Boolean(payload.username) && payload.exp > Math.floor(Date.now()/1000);
  } catch { return false; }
}
export function validCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.DASHBOARD_USERNAME || "";
  const expectedPass = process.env.DASHBOARD_PASSWORD || "";
  if (!expectedUser || !expectedPass) return false;
  const ua=Buffer.from(username), ub=Buffer.from(expectedUser), pa=Buffer.from(password), pb=Buffer.from(expectedPass);
  return ua.length===ub.length && pa.length===pb.length && crypto.timingSafeEqual(ua,ub) && crypto.timingSafeEqual(pa,pb);
}
