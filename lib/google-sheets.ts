import { GoogleAuth } from "google-auth-library";
import { buildDataHealth, buildMetrics } from "./metrics";
import { rowsToTasks } from "./task-normalizer";
import type { TaskApiResponse } from "../types/task";

let memoryCache: {
  expiresAt: number;
  data: Omit<TaskApiResponse, "meta"> & {
    meta: Omit<TaskApiResponse["meta"], "cacheState">;
  };
} | null = null;

function getCredentials(): Record<string, unknown> {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.");

  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64-encoded JSON.");
  }
}

async function googleSheetsRequest<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API returned ${response.status}: ${body.slice(0, 500)}`);
  }

  return (await response.json()) as T;
}

export async function fetchTaskDashboard(force = false): Promise<TaskApiResponse> {
  const ttl = Number(process.env.GOOGLE_SHEETS_CACHE_TTL_MS ?? 30000);
  if (!force && memoryCache && memoryCache.expiresAt > Date.now()) {
    return { ...memoryCache.data, meta: { ...memoryCache.data.meta, cacheState: "hit" } };
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetId = Number(process.env.GOOGLE_SHEET_GID ?? 0);

  if (!spreadsheetId) throw new Error("Missing GOOGLE_SPREADSHEET_ID.");
  if (!Number.isInteger(sheetId) || sheetId < 0) {
    throw new Error("GOOGLE_SHEET_GID must be a valid numeric gid.");
  }

  const auth = new GoogleAuth({
    credentials: getCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const accessToken = await auth.getAccessToken();
  if (!accessToken) throw new Error("Google service account could not obtain an access token.");

  const metadataUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `?fields=${encodeURIComponent("sheets.properties(sheetId,title)")}`;

  const metadata = await googleSheetsRequest<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(metadataUrl, accessToken);

  const sheet = metadata.sheets?.find((item) => item.properties?.sheetId === sheetId);
  const sheetTitle = sheet?.properties?.title;
  if (!sheetTitle) throw new Error(`No sheet tab found for gid ${sheetId}.`);

  const range = `'${sheetTitle.replace(/'/g, "''")}'!A:AZ`;
  const valuesUrl =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(range)}` +
    `?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

  const response = await googleSheetsRequest<{ values?: string[][] }>(valuesUrl, accessToken);
  const tasks = rowsToTasks(response.values ?? []);
  if (tasks.length === 0) {
    const rowCount = response.values?.length ?? 0;
    throw new Error(`Google Sheet connected, but no Task Manager records were parsed from ${rowCount} rows. Confirm the header row includes Task ID, Task Name, Status, Owner or Priority.`);
  }

  const data = {
    tasks,
    metrics: buildMetrics(tasks),
    health: buildDataHealth(tasks),
    meta: {
      spreadsheetId,
      sheetId,
      sheetTitle,
      rowCount: tasks.length,
      fetchedAt: new Date().toISOString(),
      readOnly: true as const
    }
  };

  memoryCache = { expiresAt: Date.now() + ttl, data };
  return { ...data, meta: { ...data.meta, cacheState: "miss" } };
}
