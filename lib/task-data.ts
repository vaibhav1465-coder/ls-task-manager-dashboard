import type { DashboardMetrics, Task } from "@/types/task";

type SourceField =
  | "serial"
  | "taskType"
  | "priority"
  | "taskName"
  | "taskDescription"
  | "team"
  | "maker"
  | "owner"
  | "checker"
  | "reportDate"
  | "startDate"
  | "eta"
  | "liveDate"
  | "etaMissingReason"
  | "status"
  | "comment";

const aliases: Record<SourceField, string[]> = {
  serial: ["#", "serial", "sr no", "sno"],
  taskType: ["task type", "tasktype", "type"],
  priority: ["priorities", "priority"],
  taskName: ["task name", "taskname", "task"],
  taskDescription: ["task description", "taskdescription", "description"],
  team: ["team"],
  maker: ["maker"],
  owner: ["owner"],
  checker: ["checker"],
  reportDate: ["report date", "reportdate"],
  startDate: ["start date", "startdate"],
  eta: ["eta", "due date", "duedate"],
  liveDate: ["live date", "livedate", "completed date", "completion date"],
  etaMissingReason: [
    "reason if eta missing",
    "reasonifetamissing",
    "eta missing reason",
    "delay reason",
  ],
  status: ["status", "task status"],
  comment: ["comment if any", "commentifany", "comment", "comments"],
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function key(value: string): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeStatus(value: string): string {
  const normalized = key(value);

  if (["completed", "complete", "done", "delivered", "closed", "live"].includes(normalized)) {
    return "Completed";
  }

  if (["wip", "workinprogress", "inprogress", "ongoing", "working", "started"].includes(normalized)) {
    return "WIP";
  }

  if (["pending", "notstarted", "notyetstarted", "todo", "open"].includes(normalized)) {
    return "Pending";
  }

  if (["blocked", "onhold", "hold"].includes(normalized)) {
    return "Blocked";
  }

  return clean(value) || "Not updated";
}

function parseDate(raw: string): Date | null {
  const value = clean(raw);
  if (!value) return null;

  const dayFirst = value.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dayFirst) {
    const year = Number(dayFirst[3].length === 2 ? `20${dayFirst[3]}` : dayFirst[3]);
    const date = new Date(Date.UTC(year, Number(dayFirst[2]) - 1, Number(dayFirst[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const direct = new Date(value);
  return Number.isNaN(direct.getTime()) ? null : direct;
}

function toIso(value: string): string | null {
  return parseDate(value)?.toISOString() ?? null;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

function findHeader(values: string[][]): number {
  let bestIndex = -1;
  let bestScore = 0;

  values.slice(0, 20).forEach((row, index) => {
    const headings = new Set(row.map(key));
    const score = ["taskname", "status", "owner", "eta", "livedate"].filter((heading) =>
      headings.has(heading),
    ).length;

    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  if (bestIndex < 0 || bestScore < 2) {
    throw new Error(
      "Task Manager header row was not found. Expected columns such as Task Name, Owner, ETA, Live Date and Status.",
    );
  }

  return bestIndex;
}

export function rowsToTasks(values: string[][]): Task[] {
  const headerIndex = findHeader(values);
  const headers = values[headerIndex].map(key);

  const indexes = Object.fromEntries(
    (Object.keys(aliases) as SourceField[]).map((field) => {
      const candidates = aliases[field].map(key);
      return [field, headers.findIndex((header) => candidates.includes(header))];
    }),
  ) as Record<SourceField, number>;

  return values
    .slice(headerIndex + 1)
    .map((row, offset): Task | null => {
      const get = (field: SourceField): string =>
        indexes[field] >= 0 ? clean(row[indexes[field]]) : "";

      const taskName = get("taskName");
      const taskDescription = get("taskDescription");
      const rawStatus = get("status");

      if (!taskName && !taskDescription && !rawStatus) {
        return null;
      }

      const reportDate = get("reportDate");
      const startDate = get("startDate");
      const eta = get("eta");
      const liveDate = get("liveDate");
      const status = normalizeStatus(rawStatus);

      const report = parseDate(reportDate);
      const start = parseDate(startDate);
      const due = parseDate(eta);
      const completedDate = parseDate(liveDate);
      const isLive = status === "Completed";
      const isOpen = !isLive;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isDelayed = Boolean(
        due &&
          ((isLive && completedDate && completedDate.getTime() > due.getTime()) ||
            (isOpen && today.getTime() > due.getTime())),
      );

      const delayDays =
        due && isDelayed
          ? isLive && completedDate
            ? daysBetween(due, completedDate)
            : daysBetween(due, today)
          : 0;

      const turnaroundDays =
        isLive && completedDate
          ? report
            ? daysBetween(report, completedDate)
            : start
              ? daysBetween(start, completedDate)
              : null
          : null;

      return {
        rowNumber: headerIndex + offset + 2,
        serial: get("serial") || String(offset + 1),
        taskType: get("taskType"),
        priority: get("priority"),
        taskName,
        taskDescription,
        team: get("team"),
        maker: get("maker"),
        owner: get("owner"),
        checker: get("checker"),
        reportDate,
        startDate,
        eta,
        liveDate,
        etaMissingReason: get("etaMissingReason"),
        status,
        comment: get("comment"),
        reportDateIso: toIso(reportDate),
        startDateIso: toIso(startDate),
        etaIso: toIso(eta),
        liveDateIso: toIso(liveDate),
        isLive,
        isOpen,
        isDelayed,
        isMissingEta: !eta,
        delayDays,
        turnaroundDays,
      };
    })
    .filter((task): task is Task => task !== null);
}

function countBy(
  tasks: Task[],
  field:
    | "status"
    | "priority"
    | "team"
    | "owner"
    | "maker"
    | "checker"
    | "taskType"
    | "etaMissingReason",
): Record<string, number> {
  return tasks.reduce<Record<string, number>>((counts, task) => {
    const value = clean(task[field]) || "Not provided";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function percentage(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

export function buildMetrics(tasks: Task[]): DashboardMetrics {
  const completed = tasks.filter((task) => task.isLive);
  const open = tasks.filter((task) => task.isOpen);
  const delayed = tasks.filter((task) => task.isDelayed);
  const withEta = tasks.filter((task) => Boolean(task.etaIso));
  const completedWithEtaAndDate = completed.filter(
    (task) => Boolean(task.etaIso && task.liveDateIso),
  );
  const onTime = completedWithEtaAndDate.filter((task) => !task.isDelayed).length;

  const turnarounds = completed
    .map((task) => task.turnaroundDays)
    .filter((value): value is number => value !== null);

  const delays = delayed.map((task) => task.delayDays).filter((value) => value > 0);

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86_400_000);

  const requiredValues = tasks.length * 7;
  const presentValues = tasks.reduce((total, task) => {
    return (
      total +
      [
        task.taskName,
        task.owner,
        task.status,
        task.reportDate,
        task.team,
        task.maker,
        task.checker,
      ].filter(Boolean).length
    );
  }, 0);

  return {
    total: tasks.length,
    live: completed.length,
    open: open.length,
    delayed: delayed.length,
    missingEta: tasks.filter((task) => task.isMissingEta).length,
    highPriorityOpen: open.filter((task) =>
      /^(high|urgent|p0|p1)$/i.test(task.priority),
    ).length,
    dueThisWeek: open.filter((task) => {
      const due = task.etaIso ? new Date(task.etaIso) : null;
      return Boolean(due && due >= now && due <= weekFromNow);
    }).length,
    etaAdherence: percentage(withEta.length, tasks.length),
    onTimeDelivery: percentage(onTime, completedWithEtaAndDate.length),
    averageTurnaround: turnarounds.length
      ? Number(
          (
            turnarounds.reduce((sum, value) => sum + value, 0) / turnarounds.length
          ).toFixed(1),
        )
      : 0,
    averageDelay: delays.length
      ? Number((delays.reduce((sum, value) => sum + value, 0) / delays.length).toFixed(1))
      : 0,
    dataQuality: percentage(presentValues, requiredValues),
    byStatus: countBy(tasks, "status"),
    byPriority: countBy(tasks, "priority"),
    byTeam: countBy(tasks, "team"),
    byOwner: countBy(tasks, "owner"),
    byMaker: countBy(tasks, "maker"),
    byChecker: countBy(tasks, "checker"),
    byTaskType: countBy(tasks, "taskType"),
    byDelayReason: countBy(
      tasks.filter((task) => task.isDelayed || task.isMissingEta),
      "etaMissingReason",
    ),
    lifecycle: {
      reported: tasks.filter((task) => Boolean(task.reportDateIso)).length,
      started: tasks.filter((task) => Boolean(task.startDateIso)).length,
      etaAssigned: withEta.length,
      live: completed.length,
    },
  };
}
