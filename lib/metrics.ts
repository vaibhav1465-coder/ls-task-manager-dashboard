import type { CountItem, DashboardMetrics, DataHealth, Task } from "@/types/task";

function countBy(tasks: Task[], key: keyof Task): CountItem[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const name = String(task[key] ?? "Unspecified") || "Unspecified";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function buildMetrics(tasks: Task[]): DashboardMetrics {
  const now = new Date().toISOString().slice(0, 10);
  const completedTasks = tasks.filter((task) => task.status === "Completed").length;
  const blockedTasks = tasks.filter((task) => task.status === "Blocked").length;
  const activeTasks = tasks.filter((task) => task.status !== "Completed").length;
  const overdueTasks = tasks.filter((task) => task.status !== "Completed" && task.dueDate && task.dueDate < now).length;
  const highPriorityActive = tasks.filter(
    (task) => task.status !== "Completed" && ["High", "Critical"].includes(task.priority)
  ).length;
  const activeWithAge = tasks.filter((task) => task.status !== "Completed" && task.daysOpen >= 0);
  const averageDaysOpen = activeWithAge.length
    ? Math.round(activeWithAge.reduce((sum, task) => sum + task.daysOpen, 0) / activeWithAge.length)
    : 0;
  const dueDateCoverage = tasks.length ? Math.round((tasks.filter((task) => task.dueDate).length / tasks.length) * 100) : 0;
  const progressCoverage = tasks.length ? Math.round((tasks.filter((task) => task.progress !== null).length / tasks.length) * 100) : 0;

  const monthly = new Map<string, { month: string; started: number; completed: number }>();
  for (const task of tasks) {
    const startedMonth = task.dateStarted?.slice(0, 7) || task.month;
    if (startedMonth && startedMonth !== "Unknown") {
      const row = monthly.get(startedMonth) ?? { month: startedMonth, started: 0, completed: 0 };
      row.started += 1;
      monthly.set(startedMonth, row);
    }
    const completedMonth = task.taskCompletedDate?.slice(0, 7);
    if (completedMonth) {
      const row = monthly.get(completedMonth) ?? { month: completedMonth, started: 0, completed: 0 };
      row.completed += 1;
      monthly.set(completedMonth, row);
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
    dueDateCoverage,
    progressCoverage,
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
  for (const task of tasks) idCounts.set(task.taskId, (idCounts.get(task.taskId) ?? 0) + 1);
  const duplicateTaskIds = [...idCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const issues = [
    { label: "Duplicate Task IDs", count: duplicateTaskIds.length, severity: "high" as const },
    { label: "Missing owner", count: tasks.filter((task) => task.owner === "Unassigned").length, severity: "high" as const },
    { label: "Missing start date", count: tasks.filter((task) => !task.dateStarted).length, severity: "medium" as const },
    { label: "Missing due date", count: tasks.filter((task) => !task.dueDate).length, severity: "low" as const },
    { label: "Missing progress %", count: tasks.filter((task) => task.progress === null).length, severity: "low" as const },
    { label: "Missing priority", count: tasks.filter((task) => task.priority === "Unspecified").length, severity: "medium" as const },
    { label: "Completed without completion date", count: tasks.filter((task) => task.status === "Completed" && !task.taskCompletedDate).length, severity: "medium" as const }
  ].filter((issue) => issue.count > 0);
  const weighted = issues.reduce((sum, issue) => {
    const weight = issue.severity === "high" ? 5 : issue.severity === "medium" ? 3 : 1;
    return sum + issue.count * weight;
  }, 0);
  const maxPenalty = Math.max(1, tasks.length * 8);
  return {
    score: Math.max(0, Math.round(100 - (weighted / maxPenalty) * 100)),
    issues,
    duplicateTaskIds
  };
}
