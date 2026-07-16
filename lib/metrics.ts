import type { CountItem, DashboardMetrics, DataHealth, Task } from "../types/task";

function countBy(tasks: Task[], key: keyof Task): CountItem[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const name = String(task[key] ?? "Unspecified").trim() || "Unspecified";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function buildMetrics(tasks: Task[]): DashboardMetrics {
  const today = new Date().toISOString().slice(0, 10);
  const completedTasks = tasks.filter((t) => t.status === "Completed").length;
  const blockedTasks = tasks.filter((t) => t.status === "Blocked").length;
  const activeTasks = tasks.length - completedTasks;
  const overdueTasks = tasks.filter((t) => t.status !== "Completed" && Boolean(t.dueDate && t.dueDate < today)).length;
  const highPriorityActive = tasks.filter((t) => t.status !== "Completed" && ["High", "Critical"].includes(t.priority)).length;
  const activeWithAge = tasks.filter((t) => t.status !== "Completed" && Number.isFinite(t.daysOpen));
  const averageDaysOpen = activeWithAge.length ? Math.round(activeWithAge.reduce((sum, t) => sum + t.daysOpen, 0) / activeWithAge.length) : 0;
  const monthly = new Map<string, { month: string; started: number; completed: number }>();
  for (const task of tasks) {
    const startedMonth = task.dateStarted?.slice(0, 7) || (task.month !== "Unknown" ? task.month : "");
    if (startedMonth) {
      const row = monthly.get(startedMonth) ?? { month: startedMonth, started: 0, completed: 0 };
      row.started += 1; monthly.set(startedMonth, row);
    }
    const completedMonth = task.taskCompletedDate?.slice(0, 7);
    if (completedMonth) {
      const row = monthly.get(completedMonth) ?? { month: completedMonth, started: 0, completed: 0 };
      row.completed += 1; monthly.set(completedMonth, row);
    }
  }
  return {
    totalTasks: tasks.length,
    completedTasks,
    activeTasks,
    blockedTasks,
    overdueTasks,
    highPriorityActive,
    completionRate: tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0,
    averageDaysOpen,
    dueDateCoverage: tasks.length ? Math.round(tasks.filter((t) => t.dueDate).length * 100 / tasks.length) : 0,
    progressCoverage: tasks.length ? Math.round(tasks.filter((t) => t.progress !== null).length * 100 / tasks.length) : 0,
    byStatus: countBy(tasks, "status"),
    byPriority: countBy(tasks, "priority"),
    byCategory: countBy(tasks, "category"),
    byOwner: countBy(tasks, "owner"),
    byScaleReadiness: countBy(tasks, "scaleReadiness"),
    monthlyTrend: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
  };
}

export function buildDataHealth(tasks: Task[]): DataHealth {
  const idCounts = new Map<string, number>();
  tasks.forEach((t) => idCounts.set(t.taskId, (idCounts.get(t.taskId) ?? 0) + 1));
  const duplicateTaskIds = [...idCounts].filter(([, count]) => count > 1).map(([id]) => id);
  const issues = [
    { label: "Duplicate Task IDs", count: duplicateTaskIds.length, severity: "high" as const },
    { label: "Missing owner", count: tasks.filter((t) => t.owner === "Unassigned").length, severity: "high" as const },
    { label: "Missing start date", count: tasks.filter((t) => !t.dateStarted).length, severity: "medium" as const },
    { label: "Missing due date", count: tasks.filter((t) => !t.dueDate).length, severity: "low" as const },
    { label: "Missing progress %", count: tasks.filter((t) => t.progress === null).length, severity: "low" as const },
    { label: "Completed without completion date", count: tasks.filter((t) => t.status === "Completed" && !t.taskCompletedDate).length, severity: "medium" as const }
  ].filter((x) => x.count > 0);
  const penalty = issues.reduce((sum, x) => sum + x.count * (x.severity === "high" ? 5 : x.severity === "medium" ? 3 : 1), 0);
  return { score: Math.max(0, Math.round(100 - penalty * 100 / Math.max(1, tasks.length * 8))), issues, duplicateTaskIds };
}