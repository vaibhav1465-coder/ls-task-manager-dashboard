"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import TaskEditor from "@/components/TaskEditor";
import type {
  DashboardMetrics,
  Task,
  TaskApiResponse,
} from "@/types/task";

const REFRESH_MS = Number(
  process.env.NEXT_PUBLIC_REFRESH_INTERVAL_MS || 30_000,
);

type FilterKey =
  | "owner"
  | "team"
  | "status"
  | "priority";

type CardDefinition = {
  label: string;
  value: number;
  suffix?: string;
  hint: string;
  icon: string;
};

function sortedEntries(
  values: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(values).sort(
    (first, second) => second[1] - first[1],
  );
}

function percentage(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0;
}

function formatSyncTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "syncing"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
}

function recordValue(
  record: Record<string, number>,
  key: string,
): number {
  return record[key] || 0;
}

function BarList({
  values,
  total,
  limit = 7,
}: {
  values: Record<string, number>;
  total: number;
  limit?: number;
}) {
  const entries = sortedEntries(values).slice(0, limit);

  if (!entries.length) {
    return <p className="empty-state">No data available.</p>;
  }

  return (
    <div className="bar-list">
      {entries.map(([label, value]) => (
        <div className="bar-row" key={label}>
          <div className="bar-label">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <div className="bar-track">
            <span
              className="bar-fill"
              style={{
                width: `${Math.max(
                  4,
                  percentage(value, total),
                )}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function KpiCard({ card }: { card: CardDefinition }) {
  return (
    <article className="kpi-card">
      <div className="kpi-top">
        <span className="kpi-icon">{card.icon}</span>
        <span className="kpi-label">{card.label}</span>
      </div>
      <strong className="kpi-value">
        {card.value}
        {card.suffix || ""}
      </strong>
      <small className="kpi-hint">{card.hint}</small>
      <span className="mini-spark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </article>
  );
}

export default function Dashboard() {
  const [payload, setPayload] =
    useState<TaskApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] =
    useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [statusFilter, setStatusFilter] =
    useState("All");
  const [priorityFilter, setPriorityFilter] =
    useState("All");
  const [dateFilter, setDateFilter] = useState("All");
  const [editingTask, setEditingTask] =
    useState<Task | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (payload) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch(
          `/api/tasks${force ? "?force=1" : ""}`,
          {
            cache: "no-store",
          },
        );

        const nextPayload =
          (await response.json()) as TaskApiResponse & {
            error?: string;
          };

        if (!response.ok) {
          throw new Error(
            nextPayload.error ||
              "Unable to load Task Manager data.",
          );
        }

        setPayload(nextPayload);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load Task Manager data.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [payload],
  );

  useEffect(() => {
    void load(false);

    const interval = window.setInterval(() => {
      void load(false);
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [load]);

  const tasks = payload?.tasks || [];
  const metrics = payload?.metrics;

  const options = useCallback(
    (field: FilterKey): string[] => {
      const values = new Set(
        tasks
          .map((task) => task[field])
          .filter(Boolean),
      );

      return [
        "All",
        ...Array.from(values).sort((first, second) =>
          first.localeCompare(second),
        ),
      ];
    },
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const now = new Date();

    return tasks.filter((task) => {
      const query = search.trim().toLowerCase();

      if (
        query &&
        !Object.values(task)
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }

      if (
        ownerFilter !== "All" &&
        task.owner !== ownerFilter
      ) {
        return false;
      }

      if (
        teamFilter !== "All" &&
        task.team !== teamFilter
      ) {
        return false;
      }

      if (
        statusFilter !== "All" &&
        task.status !== statusFilter
      ) {
        return false;
      }

      if (
        priorityFilter !== "All" &&
        task.priority !== priorityFilter
      ) {
        return false;
      }

      if (dateFilter !== "All") {
        const reportDate = task.reportDateIso
          ? new Date(task.reportDateIso)
          : null;

        if (!reportDate) return false;

        const age = Math.floor(
          (now.getTime() - reportDate.getTime()) /
            86_400_000,
        );

        if (dateFilter === "7d" && age > 7) {
          return false;
        }
        if (dateFilter === "30d" && age > 30) {
          return false;
        }
        if (dateFilter === "90d" && age > 90) {
          return false;
        }
      }

      return true;
    });
  }, [
    tasks,
    search,
    ownerFilter,
    teamFilter,
    statusFilter,
    priorityFilter,
    dateFilter,
  ]);

  const exportCsv = () => {
    const headers = [
      "#",
      "Task Type",
      "Priorities",
      "Task Name",
      "Task Description",
      "Team",
      "Maker",
      "Owner",
      "Checker",
      "Report Date",
      "Start Date",
      "ETA",
      "Live Date",
      "Reason if ETA missing",
      "Status",
      "Comment if any",
    ];

    const rows = filteredTasks.map((task) => [
      task.serial,
      task.taskType,
      task.priority,
      task.taskName,
      task.taskDescription,
      task.team,
      task.maker,
      task.owner,
      task.checker,
      task.reportDate,
      task.startDate,
      task.eta,
      task.liveDate,
      task.etaMissingReason,
      task.status,
      task.comment,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value).replace(/"/g, '""')}"`,
          )
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ls-task-manager.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !payload) {
    return (
      <main className="loading-screen">
        <div className="loading-card">
          Loading Task Manager Command Center...
        </div>
      </main>
    );
  }

  if (!payload || !metrics) {
    return (
      <main className="loading-screen">
        <div className="loading-card error-card">
          <h1>Dashboard unavailable</h1>
          <p>{error || "No dashboard data was returned."}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => void load(true)}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const pending = recordValue(
    metrics.byStatus,
    "Pending",
  );
  const wip = recordValue(metrics.byStatus, "WIP");
  const completed = metrics.live;

  const cards: CardDefinition[] = [
    {
      label: "Total Tasks",
      value: metrics.total,
      hint: "All tracked assignments",
      icon: "T",
    },
    {
      label: "Completed",
      value: completed,
      hint: `${metrics.onTimeDelivery}% on-time delivery`,
      icon: "C",
    },
    {
      label: "Pending",
      value: pending,
      hint: "Not started yet",
      icon: "P",
    },
    {
      label: "WIP",
      value: wip,
      hint: "Currently in progress",
      icon: "W",
    },
    {
      label: "Open Tasks",
      value: metrics.open,
      hint: `${metrics.dueThisWeek} due this week`,
      icon: "O",
    },
    {
      label: "Delayed",
      value: metrics.delayed,
      hint: "Needs delivery attention",
      icon: "D",
    },
    {
      label: "ETA Coverage",
      value: metrics.etaAdherence,
      suffix: "%",
      hint: `${metrics.missingEta} tasks missing ETA`,
      icon: "E",
    },
    {
      label: "Turnaround",
      value: metrics.averageTurnaround,
      suffix: "d",
      hint: "Average report-to-completed",
      icon: "A",
    },
    {
      label: "High Priority Open",
      value: metrics.highPriorityOpen,
      hint: "Needs management attention",
      icon: "H",
    },
    {
      label: "Operations Health",
      value: Math.max(
        0,
        Math.min(
          100,
          Math.round(
            metrics.onTimeDelivery * 0.3 +
              metrics.etaAdherence * 0.25 +
              metrics.dataQuality * 0.25 +
              percentage(completed, metrics.total) *
                0.2 -
              percentage(
                metrics.delayed,
                metrics.total,
              ) *
                0.25,
          ),
        ),
      ),
      suffix: "%",
      hint: `Data quality ${metrics.dataQuality}%`,
      icon: "S",
    },
  ];

  const health = cards[cards.length - 1].value;

  const snapshot = [
    `${pending} pending tasks`,
    `${wip} WIP tasks`,
    `${completed} completed tasks`,
    `${metrics.delayed} delayed tasks`,
    `${metrics.open} total open tasks`,
  ];

  const lifecycle: Array<[string, number]> = [
    ["Reported", metrics.lifecycle.reported],
    ["Started", metrics.lifecycle.started],
    ["ETA Assigned", metrics.lifecycle.etaAssigned],
    ["Completed", metrics.lifecycle.live],
  ];

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">
            LOKSATTA | LIVE OPERATIONS
          </span>
          <h1>
            Task Manager <em>Command Center</em>
          </h1>
          <p>
            Google Sheet remains the source of truth.
            Dashboard edits and Sheet updates stay
            synchronized.
          </p>
        </div>

        <div className="sync-actions">
          <div className="sync-pill">
            <i aria-hidden="true" />
            <div>
              <strong>Google Sheets Live</strong>
              <small>
                {payload.meta.rowCount} rows |{" "}
                {formatSyncTime(
                  payload.meta.fetchedAt,
                )}
              </small>
            </div>
          </div>

          <button
            className="refresh-button"
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Refresh dashboard"
          >
            {refreshing ? "..." : "↻"}
          </button>

          <form
            action="/api/auth/logout"
            method="post"
          >
            <button
              className="signout-button"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {error ? (
        <div className="error-banner">{error}</div>
      ) : null}

      <section className="summary-card">
        <div className="summary-heading">
          <span>TODAY&apos;S SNAPSHOT</span>
          <h2>Executive Summary</h2>
        </div>
        <div className="snapshot-grid">
          {snapshot.map((item) => (
            <div className="snapshot-item" key={item}>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="kpi-grid">
        {cards.map((card) => (
          <KpiCard card={card} key={card.label} />
        ))}
      </section>

      <section className="analytics-grid analytics-primary">
        <article className="panel health-panel">
          <div className="panel-head">
            <h3>Operations Health</h3>
            <span>Execution score</span>
          </div>
          <div
            className="health-ring"
            style={
              {
                "--score": `${health * 3.6}deg`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>{health}%</strong>
              <small>
                {health >= 85
                  ? "Excellent"
                  : health >= 70
                    ? "Good"
                    : "Needs attention"}
              </small>
            </div>
          </div>
          <p className="health-caption">
            Delivery, ETA and data-quality score
          </p>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Delivery Timeline</h3>
            <span>Reported to Completed</span>
          </div>
          <div className="lifecycle">
            {lifecycle.map(
              ([label, value], index) => (
                <div
                  className="lifecycle-row"
                  key={label}
                >
                  <span>{index + 1}</span>
                  <div>
                    <strong>{label}</strong>
                    <small>{value} tasks</small>
                  </div>
                  <div className="lifecycle-track">
                    <i
                      style={{
                        width: `${percentage(
                          value,
                          metrics.total,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Owner Heatmap</h3>
            <span>{metrics.total} tasks</span>
          </div>
          <BarList
            values={metrics.byOwner}
            total={metrics.total}
            limit={6}
          />
        </article>
      </section>

      <section className="analytics-grid">
        <article className="panel">
          <div className="panel-head">
            <h3>Team Distribution</h3>
            <span>{metrics.total} tasks</span>
          </div>
          <BarList
            values={metrics.byTeam}
            total={metrics.total}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Priority Mix</h3>
            <span>{metrics.total} tasks</span>
          </div>
          <BarList
            values={metrics.byPriority}
            total={metrics.total}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Status Mix</h3>
            <span>Pending | WIP | Completed</span>
          </div>
          <BarList
            values={metrics.byStatus}
            total={metrics.total}
          />
        </article>

        <article className="panel">
          <div className="panel-head">
            <h3>Task Types</h3>
            <span>{metrics.total} tasks</span>
          </div>
          <BarList
            values={metrics.byTaskType}
            total={metrics.total}
          />
        </article>
      </section>

      <section className="panel delay-panel">
        <div className="panel-head">
          <h3>Delay Analytics</h3>
          <span>Reasons and concentration</span>
        </div>
        <BarList
          values={metrics.byDelayReason}
          total={Math.max(1, metrics.delayed)}
          limit={10}
        />
      </section>

      <section className="register panel">
        <div className="register-head">
          <div>
            <span>DETAILED OPERATIONS VIEW</span>
            <h2>Task Register</h2>
            <p>
              {filteredTasks.length} of {tasks.length}{" "}
              tasks displayed
            </p>
          </div>

          <div className="filters">
            <input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search tasks, owner, team..."
              aria-label="Search tasks"
            />

            <select
              value={ownerFilter}
              onChange={(event) =>
                setOwnerFilter(event.target.value)
              }
              aria-label="Filter by owner"
            >
              {options("owner").map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>

            <select
              value={teamFilter}
              onChange={(event) =>
                setTeamFilter(event.target.value)
              }
              aria-label="Filter by team"
            >
              {options("team").map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              aria-label="Filter by status"
            >
              {options("status").map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value)
              }
              aria-label="Filter by priority"
            >
              {options("priority").map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(event) =>
                setDateFilter(event.target.value)
              }
              aria-label="Filter by date"
            >
              <option value="All">All dates</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>

            <button
              className="primary-button"
              type="button"
              onClick={exportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "#",
                  "Task Type",
                  "Priority",
                  "Task Name",
                  "Description",
                  "Team",
                  "Maker",
                  "Owner",
                  "Checker",
                  "Report Date",
                  "Start Date",
                  "ETA",
                  "Live Date",
                  "Reason if ETA missing",
                  "Status",
                  "Comment",
                  "Action",
                ].map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredTasks.map((task) => (
                <tr key={`${task.rowNumber}-${task.serial}`}>
                  <td>{task.serial}</td>
                  <td>{task.taskType || "-"}</td>
                  <td>
                    <span
                      className={`priority-pill ${task.priority.toLowerCase()}`}
                    >
                      {task.priority || "Not provided"}
                    </span>
                  </td>
                  <td>
                    <strong>{task.taskName}</strong>
                  </td>
                  <td>{task.taskDescription || "-"}</td>
                  <td>{task.team || "-"}</td>
                  <td>{task.maker || "-"}</td>
                  <td>{task.owner || "-"}</td>
                  <td>{task.checker || "-"}</td>
                  <td>{task.reportDate || "-"}</td>
                  <td>{task.startDate || "-"}</td>
                  <td>{task.eta || "-"}</td>
                  <td>{task.liveDate || "-"}</td>
                  <td>{task.etaMissingReason || "-"}</td>
                  <td>
                    <span
                      className={`status-pill ${task.status.toLowerCase()}`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td>{task.comment || "-"}</td>
                  <td>
                    <button
                      className="edit-task-button"
                      type="button"
                      onClick={() =>
                        setEditingTask(task)
                      }
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="dashboard-footer">
        <span>
          Sheet: {payload.meta.sheetTitle}
        </span>
        <span>
          Editable | Two-way sync | Auto refresh{" "}
          {Math.round(REFRESH_MS / 1000)}s
        </span>
      </footer>

      <TaskEditor
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={async () => {
          setEditingTask(null);
          await load(true);
        }}
      />
    </main>
  );
}
