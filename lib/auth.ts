import crypto from "crypto";

export const COOKIE_NAME =
  "ls_task_dashboard_session";
export const SESSION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  username: string;
  exp: number;
};

function getSecret(): string {
  const secret =
    process.env.DASHBOARD_SESSION_SECRET || "";

  if (secret.length < 24) {
    throw new Error(
      "DASHBOARD_SESSION_SECRET must be at least 24 characters.",
    );
  }

  return secret;
}

function sign(value: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(
  username: string,
): string {
  const payload: SessionPayload = {
    username,
    exp:
      Math.floor(Date.now() / 1000) +
      SESSION_SECONDS,
  };

  const encoded = Buffer.from(
    JSON.stringify(payload),
  ).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(
  token?: string | null,
): boolean {
  if (!token) return false;

  try {
    const [encoded, signature] = token.split(".");

    if (!encoded || !signature) return false;

    const expected = Buffer.from(sign(encoded));
    const received = Buffer.from(signature);

    if (
      expected.length !== received.length ||
      !crypto.timingSafeEqual(expected, received)
    ) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(
        "utf8",
      ),
    ) as SessionPayload;

    return (
      Boolean(payload.username) &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export function validCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUsername =
    process.env.DASHBOARD_USERNAME || "";
  const expectedPassword =
    process.env.DASHBOARD_PASSWORD || "";

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const actualUser = Buffer.from(username);
  const savedUser = Buffer.from(expectedUsername);
  const actualPassword = Buffer.from(password);
  const savedPassword = Buffer.from(
    expectedPassword,
  );

  return (
    actualUser.length === savedUser.length &&
    actualPassword.length ===
      savedPassword.length &&
    crypto.timingSafeEqual(
      actualUser,
      savedUser,
    ) &&
    crypto.timingSafeEqual(
      actualPassword,
      savedPassword,
    )
  );
}
