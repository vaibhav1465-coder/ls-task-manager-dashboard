import { google } from "googleapis";
import { buildDataHealth, buildMetrics } from "@/lib/metrics";
import { rowsToTasks } from "@/lib/task-normalizer";
import type { TaskApiResponse } from "@/types/task";

let memoryCache: { expiresAt: number; data: Omit<TaskApiResponse, "meta"> & { meta: Omit<TaskApiResponse["meta"], "cacheState"> } } | null = null;

function getCredentials(): Record<string, unknown> {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON_BASE64.");
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is not valid base64-encoded JSON.");
  }
}

export async function fetchTaskDashboard(force = false): Promise<TaskApiResponse> {
  const ttl = Number(process.env.GOOGLE_SHEETS_CACHE_TTL_MS ?? 30000);
  if (!force && memoryCache && memoryCache.expiresAt > Date.now()) {
    return { ...memoryCache.data, meta: { ...memoryCache.data.meta, cacheState: "hit" } };
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetId = Number(process.env.GOOGLE_SHEET_GID ?? 0);
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SPREADSHEET_ID.");
  if (!Number.isInteger(sheetId) || sheetId < 0) throw new Error("GOOGLE_SHEET_GID must be a valid numeric gid.");

  const auth = new google.auth.GoogleAuth({
    credentials: getCredentials(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)"
  });
  const sheet = metadata.data.sheets?.find((item) => item.properties?.sheetId === sheetId);
  const sheetTitle = sheet?.properties?.title;
  if (!sheetTitle) throw new Error(`No sheet tab found for gid ${sheetId}.`);

  const escapedTitle = sheetTitle.replace(/'/g, "''");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${escapedTitle}'!A:AZ`,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING"
  });
  const values = (response.data.values ?? []) as string[][];
  const tasks = rowsToTasks(values);
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
