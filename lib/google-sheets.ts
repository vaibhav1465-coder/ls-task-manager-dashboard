import { SignJWT, importPKCS8 } from "jose";
import { buildMetrics, rowsToTasks } from "@/lib/task-data";
import type { TaskApiResponse } from "@/types/task";

type Credentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type SheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

type ValuesResponse = {
  values?: string[][];
};

let cache: { expiresAt: number; data: TaskApiResponse } | null = null;

function getCredentials(): Credentials {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.");
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf8"),
    ) as Credentials;

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Required service-account fields are missing.");
    }

    return parsed;
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid service-account JSON.",
    );
  }
}

async function getAccessToken(): Promise<string> {
  const credentials = getCredentials();
  const now = Math.floor(Date.now() / 1000);
  const tokenUrl =
    credentials.token_uri || "https://oauth2.googleapis.com/token";
  const privateKey = await importPKCS8(credentials.private_key, "RS256");

  const assertion = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setSubject(credentials.client_email)
    .setAudience(tokenUrl)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || "Google authentication failed.",
    );
  }

  return payload.access_token;
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(
      payload.error?.message || "Google Sheets API request failed.",
    );
  }

  return payload;
}

export async function fetchDashboard(force = false): Promise<TaskApiResponse> {
  const ttl = Number(process.env.GOOGLE_SHEETS_CACHE_TTL_MS || 30_000);

  if (!force && cache && cache.expiresAt > Date.now()) {
    return {
      ...cache.data,
      meta: {
        ...cache.data.meta,
        cacheState: "hit",
      },
    };
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "";
  const gid = Number(process.env.GOOGLE_SHEET_GID || 0);

  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SPREADSHEET_ID.");
  }

  const accessToken = await getAccessToken();

  const metadata = await googleJson<SheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}?fields=sheets.properties(sheetId,title)`,
    accessToken,
  );

  const selectedSheet = metadata.sheets?.find(
    (sheet) => sheet.properties?.sheetId === gid,
  );
  const sheetTitle = selectedSheet?.properties?.title;

  if (!sheetTitle) {
    throw new Error(`No sheet tab found for gid ${gid}.`);
  }

  const escapedTitle = sheetTitle.replace(/'/g, "''");
  const range = encodeURIComponent(`'${escapedTitle}'!A:AZ`);

  const valuesPayload = await googleJson<ValuesResponse>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    accessToken,
  );

  const tasks = rowsToTasks(valuesPayload.values || []);

  const data: TaskApiResponse = {
    tasks,
    metrics: buildMetrics(tasks),
    meta: {
      sheetTitle,
      rowCount: tasks.length,
      fetchedAt: new Date().toISOString(),
      cacheState: "miss",
      readOnly: false,
    },
  };

  cache = {
    expiresAt: Date.now() + ttl,
    data,
  };

  return data;
}
