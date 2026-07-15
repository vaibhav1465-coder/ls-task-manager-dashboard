export type Task = {
  taskId: string;
  dateStarted: string | null;
  taskName: string;
  taskBrief: string;
  category: string;
  owner: string;
  priority: string;
  status: string;
  taskCompletedDate: string | null;
  dueDate: string | null;
  progress: number | null;
  lastUpdated: string | null;
  currentStackUsed: string;
  outputDeliverable: string;
  businessImpact: string;
  currentLimitation: string;
  futureScalingStack: string;
  nextAction: string;
  scaleReadiness: string;
  blockerReason: string;
  dependencies: string;
  effortEstimate: number | null;
  actualEffort: number | null;
  notes: string;
  daysOpen: number;
  month: string;
  raw: Record<string, string>;
};

export type CountItem = { name: string; value: number };

export type DashboardMetrics = {
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  highPriorityActive: number;
  completionRate: number;
  averageDaysOpen: number;
  dueDateCoverage: number;
  progressCoverage: number;
  byStatus: CountItem[];
  byPriority: CountItem[];
  byCategory: CountItem[];
  byOwner: CountItem[];
  byScaleReadiness: CountItem[];
  monthlyTrend: Array<{ month: string; started: number; completed: number }>;
};

export type DataHealth = {
  score: number;
  issues: Array<{ label: string; count: number; severity: "low" | "medium" | "high" }>;
  duplicateTaskIds: string[];
};

export type TaskApiResponse = {
  tasks: Task[];
  metrics: DashboardMetrics;
  health: DataHealth;
  meta: {
    spreadsheetId: string;
    sheetId: number;
    sheetTitle: string;
    rowCount: number;
    fetchedAt: string;
    cacheState: "hit" | "miss";
    readOnly: true;
  };
};
