export type Task = {
  rowNumber: number;
  serial: string;
  taskType: string;
  priority: string;
  taskName: string;
  taskDescription: string;
  team: string;
  maker: string;
  owner: string;
  checker: string;
  reportDate: string;
  startDate: string;
  eta: string;
  liveDate: string;
  etaMissingReason: string;
  status: string;
  comment: string;
  reportDateIso: string | null;
  startDateIso: string | null;
  etaIso: string | null;
  liveDateIso: string | null;
  isLive: boolean;
  isOpen: boolean;
  isDelayed: boolean;
  isMissingEta: boolean;
  delayDays: number;
  turnaroundDays: number | null;
};

export type DashboardMetrics = {
  total: number;
  live: number;
  open: number;
  delayed: number;
  missingEta: number;
  highPriorityOpen: number;
  dueThisWeek: number;
  etaAdherence: number;
  onTimeDelivery: number;
  averageTurnaround: number;
  averageDelay: number;
  dataQuality: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byTeam: Record<string, number>;
  byOwner: Record<string, number>;
  byMaker: Record<string, number>;
  byChecker: Record<string, number>;
  byTaskType: Record<string, number>;
  byDelayReason: Record<string, number>;
  lifecycle: { reported: number; started: number; etaAssigned: number; live: number };
};

export type TaskApiResponse = {
  tasks: Task[];
  metrics: DashboardMetrics;
  meta: {
    sheetTitle: string;
    rowCount: number;
    fetchedAt: string;
    cacheState: "hit" | "miss";
    readOnly: true;
  };
};
