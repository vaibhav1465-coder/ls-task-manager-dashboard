import type { Task } from "../types/task";

const aliases: Record<keyof Omit<Task, "raw" | "daysOpen" | "month">, string[]> = {
  taskId: ["task id", "taskid", "id"],
  dateStarted: ["date started", "start date", "created date"],
  taskName: ["task name", "task", "title"],
  taskBrief: ["task brief", "brief", "description"],
  category: ["category", "workstream", "project type"],
  owner: ["owner", "assigned to", "assignee"],
  priority: ["priority"],
  status: ["status", "task status"],
  taskCompletedDate: ["task completed date", "completed date", "completion date"],
  dueDate: ["due date", "deadline", "target date"],
  progress: ["progress %", "progress", "completion %", "percent complete"],
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
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findValue(row: Record<string, string>, keys: string[]): string {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [cleanHeader(key), value]));
  for (const key of keys) {
    const value = normalized.get(key);
    if (value !== undefined) return String(value).trim();
  }
  return "";
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 20000 && numeric < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + numeric * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const separated = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (separated) {
    const first = Number(separated[1]);
    const second = Number(separated[2]);
    const year = Number(separated[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return date.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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
  if (["in progress", "ongoing", "active", "working"].includes(v)) return "In Progress";
  if (["blocked", "on hold"].includes(v)) return "Blocked";
  if (["waiting for feedback", "feedback pending", "pending feedback"].includes(v)) return "Waiting for Feedback";
  if (["needs update", "update needed"].includes(v)) return "Needs Update";
  if (["not started", "planned", "backlog", "open"].includes(v)) return "Not Started";
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
    const normalized = row.map((cell) => cleanHeader(String(cell)));
    return normalized.includes("task id") && (normalized.includes("task name") || normalized.includes("status"));
  });
  const firstContentRow = headerRow >= 0
    ? headerRow
    : values.findIndex((row) => row.some((cell) => String(cell).trim() !== ""));
  if (firstContentRow < 0) return [];
  const headers = values[firstContentRow].map((value, index) => String(value).trim() || `Column ${index + 1}`);
  return values
    .slice(firstContentRow + 1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((cells, index) => {
      const raw = Object.fromEntries(headers.map((header, i) => [header, String(cells[i] ?? "").trim()]));
      const get = <K extends keyof typeof aliases>(key: K) => findValue(raw, aliases[key]);
      const dateStarted = parseDate(get("dateStarted"));
      const taskCompletedDate = parseDate(get("taskCompletedDate"));
      const status = canonicalStatus(get("status"));
      const explicitDays = parseNumber(findValue(raw, ["days open / completion time", "days open", "completion time"]));
      const progressRaw = parseNumber(get("progress"));
      const progress = progressRaw === null ? null : Math.max(0, Math.min(100, progressRaw));
      const monthSource = findValue(raw, ["month"]);
      const month = monthSource || (dateStarted ? dateStarted.slice(0, 7) : "Unknown");
      return {
        taskId: get("taskId") || `ROW-${index + firstContentRow + 2}`,
        dateStarted,
        taskName: get("taskName") || "Untitled task",
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
        month,
        raw
      };
    });
}

