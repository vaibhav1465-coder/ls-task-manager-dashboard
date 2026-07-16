import type { Task } from "../types/task";

const aliases: Record<string, string[]> = {
  taskId: ["task id", "taskid", "id", "task no", "task number"],
  dateStarted: ["date started", "start date", "created date", "date"],
  taskName: ["task name", "task", "title", "project", "initiative"],
  taskBrief: ["task brief", "brief", "description", "task description"],
  category: ["category", "workstream", "project type", "task category"],
  owner: ["owner", "assigned to", "assignee", "task owner"],
  priority: ["priority", "task priority"],
  status: ["status", "task status", "current status"],
  taskCompletedDate: ["task completed date", "completed date", "completion date", "date completed"],
  dueDate: ["due date", "deadline", "target date"],
  progress: ["progress %", "progress", "completion %", "percent complete", "% complete"],
  lastUpdated: ["last updated", "updated at", "modified date"],
  currentStackUsed: ["current stack used", "current stack", "tools used", "stack"],
  outputDeliverable: ["output / deliverable", "output deliverable", "deliverable", "output"],
  businessImpact: ["business impact", "impact"],
  currentLimitation: ["current limitation", "limitation", "blocker"],
  futureScalingStack: ["future scaling stack", "scaling stack", "future stack"],
  nextAction: ["next action", "next step"],
  scaleReadiness: ["scale readiness", "readiness"],
  blockerReason: ["blocker reason", "blocked reason", "risk reason"],
  dependencies: ["dependencies", "dependency"],
  effortEstimate: ["effort estimate", "estimated effort", "estimate hours"],
  actualEffort: ["actual effort", "actual hours"],
  notes: ["notes", "comments"]
};

function cleanHeader(value: string): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/[^a-z0-9%/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findValue(row: Record<string, string>, keys: string[]): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [cleanHeader(key), String(value ?? "").trim()]));
  for (const key of keys) {
    const exact = normalized.get(cleanHeader(key));
    if (exact !== undefined && exact !== "") return exact;
  }
  for (const [header, value] of normalized) {
    if (!value) continue;
    if (keys.some((key) => header.includes(cleanHeader(key)) || cleanHeader(key).includes(header))) return value;
  }
  return "";
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + numeric * 86400000).toISOString().slice(0, 10);
  }
  const dmy = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseNumber(value: string): number | null {
  if (!value) return null;
  const numeric = Number(value.replace(/[% ,]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function canonicalStatus(value: string): string {
  const v = value.trim().toLowerCase();
  if (!v) return "Not Started";
  if (["done", "complete", "completed", "closed"].includes(v)) return "Completed";
  if (["in progress", "ongoing", "active", "working", "started"].includes(v)) return "In Progress";
  if (["blocked", "on hold", "stuck"].includes(v)) return "Blocked";
  if (["waiting for feedback", "feedback pending", "pending feedback", "awaiting feedback"].includes(v)) return "Waiting for Feedback";
  if (["needs update", "update needed"].includes(v)) return "Needs Update";
  if (["not started", "planned", "backlog", "open", "pending"].includes(v)) return "Not Started";
  return value.trim();
}

function canonicalPriority(value: string): string {
  const v = value.trim().toLowerCase();
  if (["urgent", "critical", "p0"].includes(v)) return "Critical";
  if (["high", "p1"].includes(v)) return "High";
  if (["medium", "normal", "p2"].includes(v)) return "Medium";
  if (["low", "p3"].includes(v)) return "Low";
  return value.trim() || "Unspecified";
}

function diffDays(start: string | null, end: string | null): number {
  if (!start) return 0;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function rowsToTasks(values: string[][]): Task[] {
  const headerRow = values.findIndex((row) => {
    const headers = row.map((cell) => cleanHeader(String(cell)));
    const hasTask = headers.some((h) => ["task id", "task name", "task"].includes(h));
    const hasOperationalField = headers.some((h) => ["status", "owner", "priority", "category"].includes(h));
    return hasTask && hasOperationalField;
  });
  if (headerRow < 0) return [];

  const headers = values[headerRow].map((value, index) => String(value ?? "").trim() || `Column ${index + 1}`);
  return values.slice(headerRow + 1).flatMap((cells, index) => {
    const raw = Object.fromEntries(headers.map((header, i) => [header, String(cells[i] ?? "").trim()]));
    const get = (key: string) => findValue(raw, aliases[key] ?? []);
    const taskName = get("taskName");
    const taskId = get("taskId");
    const statusText = get("status");
    if (!taskName && !taskId && !statusText) return [];

    const dateStarted = parseDate(get("dateStarted"));
    const taskCompletedDate = parseDate(get("taskCompletedDate"));
    const status = canonicalStatus(statusText);
    const explicitDays = parseNumber(findValue(raw, ["days open / completion time", "days open", "completion time"]));
    const progressRaw = parseNumber(get("progress"));
    const progress = progressRaw === null ? null : Math.max(0, Math.min(100, progressRaw));
    const monthSource = findValue(raw, ["month"]);

    return [{
      taskId: taskId || `ROW-${index + headerRow + 2}`,
      dateStarted,
      taskName: taskName || "Untitled task",
      taskBrief: get("taskBrief"),
      category: get("category") || "Uncategorised",
      owner: get("owner") || "Unassigned",
      priority: canonicalPriority(get("priority")),
      status,
      taskCompletedDate,
      dueDate: parseDate(get("dueDate")),
      progress,
      lastUpdated: parseDate(get("lastUpdated")),
      currentStackUsed: get("currentStackUsed"),
      outputDeliverable: get("outputDeliverable"),
      businessImpact: get("businessImpact"),
      currentLimitation: get("currentLimitation"),
      futureScalingStack: get("futureScalingStack"),
      nextAction: get("nextAction"),
      scaleReadiness: get("scaleReadiness") || "Unspecified",
      blockerReason: get("blockerReason"),
      dependencies: get("dependencies"),
      effortEstimate: parseNumber(get("effortEstimate")),
      actualEffort: parseNumber(get("actualEffort")),
      notes: get("notes"),
      daysOpen: explicitDays ?? diffDays(dateStarted, status === "Completed" ? taskCompletedDate : null),
      month: monthSource || (dateStarted ? dateStarted.slice(0, 7) : "Unknown"),
      raw
    }];
  });
}