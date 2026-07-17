"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RawTask = Record<string, unknown>;

type Task = {
  id: string;
  taskType: string;
  priority: string;
  taskName: string;
  description: string;
  team: string;
  maker: string;
  owner: string;
  checker: string;
  reportDate: string;
  startDate: string;
  eta: string;
  liveDate: string;
  etaReason: string;
  status: string;
  comment: string;
};

type ApiPayload = {
  tasks?: RawTask[];
  data?: RawTask[];
  rows?: RawTask[];
  meta?: Record<string, unknown>;
  error?: string;
};

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_INTERVAL_MS || 30000);

const aliases: Record<keyof Task, string[]> = {
  id: ["#", "id", "task id", "taskid"],
  taskType: ["task type", "type", "tasktype"],
  priority: ["priorities", "priority", "prio"],
  taskName: ["task name", "task", "name", "title"],
  description: ["task description", "description", "brief"],
  team: ["team"],
  maker: ["maker", "created by", "assignee"],
  owner: ["owner"],
  checker: ["checker", "reviewer", "approver"],
  reportDate: ["report date", "reported date", "reportdate"],
  startDate: ["start date", "startdate"],
  eta: ["eta", "due date", "deadline"],
  liveDate: ["live date", "completed date", "completion date", "livedate"],
  etaReason: ["reason if eta missing", "eta reason", "delay reason", "reason"],
  status: ["status", "task status"],
  comment: ["comment if any", "comment", "comments", "notes"],
};

const cleanKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const pick = (row: RawTask, names: string[]) => {
  const entries = Object.entries(row);
  for (const name of names) {
    const match = entries.find(([key]) => cleanKey(key) === cleanKey(name));
    if (match && match[1] !== null && match[1] !== undefined) return String(match[1]).trim();
  }
  return "";
};

const normalizeStatus = (value: string) => {
  const status = cleanKey(value);

  if (["pending", "not started", "not yet started", "to do", "todo", "open"].includes(status)) {
    return "Pending";
  }

  if (["wip", "work in progress", "in progress", "ongoing", "working", "started"].includes(status)) {
    return "WIP";
  }

  if (["live", "completed", "complete", "done", "delivered", "closed"].includes(status)) {
    return "Live";
  }

  if (["blocked", "on hold", "hold"].includes(status)) {
    return "Blocked";
  }

  return value.trim() || "Not updated";
};
const normalizeTask = (row: RawTask, index: number): Task => ({
  id: pick(row, aliases.id) || String(index + 1),
  taskType: pick(row, aliases.taskType),
  priority: pick(row, aliases.priority),
  taskName: pick(row, aliases.taskName),
  description: pick(row, aliases.description),
  team: pick(row, aliases.team),
  maker: pick(row, aliases.maker),
  owner: pick(row, aliases.owner),
  checker: pick(row, aliases.checker),
  reportDate: pick(row, aliases.reportDate),
  startDate: pick(row, aliases.startDate),
  eta: pick(row, aliases.eta),
  liveDate: pick(row, aliases.liveDate),
  etaReason: pick(row, aliases.etaReason),
  status: normalizeStatus(pick(row, aliases.status)),
  comment: pick(row, aliases.comment),
});

const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = value.match(/^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{4})$/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const isLive = (task: Task) => {
  const status = cleanKey(task.status);
  return status === "live" || status === "completed" || status === "done" || Boolean(task.liveDate);
};

const isPending = (task: Task) => cleanKey(task.status) === "pending";

const isWip = (task: Task) => cleanKey(task.status) === "wip";

const isOpen = (task: Task) => !isLive(task);

const isDelayed = (task: Task) => {
  const eta = parseDate(task.eta);
  const live = parseDate(task.liveDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!eta) return false;
  if (live) return live.getTime() > eta.getTime();
  return isOpen(task) && today.getTime() > eta.getTime();
};

const daysBetween = (a: Date | null, b: Date | null) => {
  if (!a || !b) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
};

const countBy = (tasks: Task[], field: keyof Task) => {
  const map = new Map<string, number>();
  tasks.forEach((task) => {
    const missingLabel =
      field === "owner" || field === "checker" || field === "maker"
        ? "Not assigned"
        : field === "status"
          ? "Not updated"
          : "Not provided";
    const value = task[field] || missingLabel;
    map.set(value, (map.get(value) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
};

const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 600;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{display}{suffix}</>;
}

function MiniBars({ items, total }: { items: [string, number][]; total: number }) {
  return (
    <div className="mini-bars">
      {items.slice(0, 8).map(([label, value]) => (
        <div className="mini-bar-row" key={label}>
          <div className="mini-bar-head">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <div className="mini-bar-track">
            <span style={{ width: `${Math.max(5, pct(value, total))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard data");
      const raw = payload.tasks || payload.data || payload.rows || [];
      setTasks(raw.map(normalizeTask).filter((task) => task.taskName || task.description));
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const metrics = useMemo(() => {
    const total = tasks.length;
    const live = tasks.filter(isLive).length;
    const pending = tasks.filter(isPending).length;
    const wip = tasks.filter(isWip).length;
    const open = tasks.filter(isOpen).length;
    const delayed = tasks.filter(isDelayed).length;
    const etaAssigned = tasks.filter((task) => Boolean(task.eta)).length;
    const onTime = tasks.filter((task) => {
      const eta = parseDate(task.eta);
      const liveDate = parseDate(task.liveDate);
      return eta && liveDate && liveDate.getTime() <= eta.getTime();
    }).length;
    const completedWithEta = tasks.filter((task) => parseDate(task.eta) && parseDate(task.liveDate)).length;
    const turnaround = tasks
      .map((task) => daysBetween(parseDate(task.reportDate), parseDate(task.liveDate)))
      .filter((value): value is number => value !== null);
    const avgTurnaround = turnaround.length
      ? Math.round(turnaround.reduce((sum, value) => sum + value, 0) / turnaround.length)
      : 0;
    const dueSoon = tasks.filter((task) => {
      const eta = parseDate(task.eta);
      if (!eta || isLive(task)) return false;
      const diff = daysBetween(new Date(), eta);
      return diff !== null && diff <= 7;
    }).length;
    const highOpen = tasks.filter((task) => {
      const p = cleanKey(task.priority);
      return isOpen(task) && ["high", "urgent", "p0", "p1", "1"].includes(p);
    }).length;
    const requiredFields = tasks.length * 8;
    const filledFields = tasks.reduce((sum, task) => {
      const fields = [task.taskName, task.team, task.owner, task.reportDate, task.startDate, task.eta, task.status, task.checker];
      return sum + fields.filter(Boolean).length;
    }, 0);
    const dataQuality = requiredFields ? Math.round((filledFields / requiredFields) * 100) : 0;
    const health = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          pct(live, total) * 0.3 +
          pct(onTime, completedWithEta || 1) * 0.3 +
          pct(etaAssigned, total) * 0.2 +
          dataQuality * 0.2 -
          pct(delayed, total) * 0.25
        )
      )
    );
    return { total, live, pending, wip, open, delayed, etaAssigned, onTime, completedWithEta, avgTurnaround, dueSoon, highOpen, dataQuality, health };
  }, [tasks]);

  const ownerRows = useMemo(() => countBy(tasks, "owner"), [tasks]);
  const teamRows = useMemo(() => countBy(tasks, "team"), [tasks]);
  const priorityRows = useMemo(() => countBy(tasks, "priority"), [tasks]);
  const statusRows = useMemo(() => countBy(tasks, "status"), [tasks]);
  const typeRows = useMemo(() => countBy(tasks, "taskType"), [tasks]);
  const delayRows = useMemo(() => {
    const delayed = tasks.filter((task) => isDelayed(task) || task.etaReason);
    return countBy(delayed, "etaReason").map(([label, value]) => [label || "Not specified", value] as [string, number]);
  }, [tasks]);

  const lifecycle = useMemo(() => [
    ["Reported", tasks.filter((task) => Boolean(task.reportDate)).length],
    ["Started", tasks.filter((task) => Boolean(task.startDate)).length],
    ["ETA Assigned", tasks.filter((task) => Boolean(task.eta)).length],
    ["Live", tasks.filter(isLive).length],
  ] as [string, number][], [tasks]);

  const snapshot = useMemo(() => [
    `${metrics.pending} pending task${metrics.pending === 1 ? "" : "s"}`,
    `${metrics.wip} WIP task${metrics.wip === 1 ? "" : "s"}`,
    `${metrics.live} live task${metrics.live === 1 ? "" : "s"}`,
    `${metrics.delayed} delayed task${metrics.delayed === 1 ? "" : "s"}`,
    `${metrics.open} total open task${metrics.open === 1 ? "" : "s"}`,
  ], [metrics]);

  const options = (field: keyof Task) => ["All", ...countBy(tasks, field).map(([value]) => value)];

  const filtered = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => {
      const haystack = Object.values(task).join(" ").toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (ownerFilter !== "All" && task.owner !== ownerFilter) return false;
      if (teamFilter !== "All" && task.team !== teamFilter) return false;
      if (statusFilter !== "All" && task.status !== statusFilter) return false;
      if (priorityFilter !== "All" && task.priority !== priorityFilter) return false;
      if (dateFilter !== "All") {
        const report = parseDate(task.reportDate);
        if (!report) return false;
        const diff = Math.floor((now.getTime() - report.getTime()) / 86400000);
        if (dateFilter === "7d" && diff > 7) return false;
        if (dateFilter === "30d" && diff > 30) return false;
        if (dateFilter === "90d" && diff > 90) return false;
      }
      return true;
    });
  }, [tasks, search, ownerFilter, teamFilter, statusFilter, priorityFilter, dateFilter]);

  const exportCsv = () => {
    const headers = ["#", "Task Type", "Priority", "Task Name", "Task Description", "Team", "Maker", "Owner", "Checker", "Report Date", "Start Date", "ETA", "Live Date", "Reason if ETA missing", "Status", "Comment"];
    const rows = filtered.map((task) => [
      task.id, task.taskType, task.priority, task.taskName, task.description, task.team, task.maker, task.owner, task.checker,
      task.reportDate, task.startDate, task.eta, task.liveDate, task.etaReason, task.status, task.comment,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ls-task-manager.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !tasks.length) {
    return <main className="command-center"><div className="loading-card">Loading Task Manager Command Centerâ€¦</div></main>;
  }

  return (
    <main className="command-center">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="hero">
        <div>
          <div className="eyebrow">LOKSATTA Â· LIVE OPERATIONS</div>
          <h1>Task Manager <span>Command Center</span></h1>
          <p>Google Sheet remains the source of truth. This dashboard is a read-only executive presentation layer.</p>
        </div>
        <div className="hero-actions">
          <div className="live-pill"><i /> Google Sheets Live <small>{tasks.length} rows Â· {updatedAt || "syncing"}</small></div>
          <button className="icon-btn" onClick={load} aria-label="Refresh">â†»</button>
          <button className="signout-btn" onClick={() => { window.location.href = "/api/auth/logout"; }}>Sign out</button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="snapshot-card">
        <div>
          <div className="eyebrow">TODAY'S SNAPSHOT</div>
          <h2>Executive Summary</h2>
        </div>
        <div className="snapshot-grid">
          {snapshot.map((item, index) => <div key={item} className={`snapshot-item snapshot-${index}`}>âœ“ {item}</div>)}
        </div>
      </section>

      <section className="kpi-grid">
        {[
          ["Total Tasks", metrics.total, "", "All tracked assignments", "pulse"],
          ["Live Tasks", metrics.live, "", `${pct(metrics.onTime, metrics.completedWithEta || 1)}% on-time delivery`, "check"],
          ["Pending", metrics.pending, "", "Not started yet", "clock"],
          ["WIP", metrics.wip, "", "Currently in progress", "clock"],
          ["Open Tasks", metrics.open, "", `${metrics.dueSoon} due this week`, "clock"],
          ["Delayed", metrics.delayed, "", "Needs delivery attention", "alert"],
          ["ETA Coverage", pct(metrics.etaAssigned, metrics.total), "%", `${metrics.total - metrics.etaAssigned} tasks missing ETA`, "calendar"],
          ["Turnaround", metrics.avgTurnaround, "d", "Average report-to-live", "speed"],
          ["High Priority Open", metrics.highOpen, "", "Needs management attention", "spark"],
          ["Operations Health", metrics.health, "%", `Data quality ${metrics.dataQuality}%`, "shield"],
        ].map(([label, value, suffix, hint, icon]) => (
          <article className="kpi-card" key={String(label)}>
            <div className={`kpi-icon ${icon}`}>{String(icon).slice(0, 1).toUpperCase()}</div>
            <div>
              <span>{label}</span>
              <strong><AnimatedNumber value={Number(value)} suffix={String(suffix)} /></strong>
              <small>{hint}</small>
            </div>
            <div className="sparkline"><b /><b /><b /><b /><b /></div>
          </article>
        ))}
      </section>

      <section className="primary-grid">
        <article className="panel health-panel">
          <div className="panel-head"><h3>Operations Health</h3><span>Execution score</span></div>
          <div className="health-wrap">
            <div className="health-ring" style={{ ["--score" as string]: `${metrics.health * 3.6}deg` }}>
              <div><strong>{metrics.health}%</strong><span>{metrics.health >= 85 ? "Excellent" : metrics.health >= 70 ? "Good" : "Needs attention"}</span></div>
            </div>
            <div className="health-stars">{"â˜…â˜…â˜…â˜…â˜…".slice(0, Math.max(1, Math.round(metrics.health / 20)))}</div>
          </div>
        </article>

        <article className="panel lifecycle-panel">
          <div className="panel-head"><h3>Delivery Timeline</h3><span>Reported â†’ Live</span></div>
          <div className="lifecycle">
            {lifecycle.map(([label, value], index) => (
              <div className="life-step" key={label}>
                <span className="step-num">{index + 1}</span>
                <div><b>{label}</b><small>{value} tasks</small></div>
                <div className="life-track"><span style={{ width: `${pct(value, metrics.total)}%` }} /></div>
                {index < lifecycle.length - 1 && <i>â†“</i>}
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head"><h3>Owner Heatmap</h3><span>{metrics.total} tasks</span></div>
          <div className="owner-cards">
            {ownerRows.slice(0, 6).map(([owner, total]) => {
              const ownerTasks = tasks.filter((task) => task.owner === owner);
              const active = ownerTasks.filter(isOpen).length;
              const delayed = ownerTasks.filter(isDelayed).length;
              const eta = ownerTasks.filter((task) => Boolean(task.eta)).length;
              return (
                <div className="owner-card" key={owner}>
                  <div><b>{owner}</b><strong>{total}</strong></div>
                  <div className="owner-meter"><span style={{ width: `${pct(total, metrics.total)}%` }} /></div>
                  <small>{active} active Â· {delayed} delayed Â· {pct(eta, total)}% ETA</small>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="secondary-grid">
        <article className="panel"><div className="panel-head"><h3>Team Distribution</h3><span>{metrics.total} tasks</span></div><MiniBars items={teamRows} total={metrics.total} /></article>
        <article className="panel"><div className="panel-head"><h3>Priority Mix</h3><span>{metrics.total} tasks</span></div><MiniBars items={priorityRows} total={metrics.total} /></article>
        <article className="panel"><div className="panel-head"><h3>Status Mix</h3><span>Pending Â· WIP Â· Live</span></div><MiniBars items={statusRows} total={metrics.total} /></article>
        <article className="panel"><div className="panel-head"><h3>Task Types</h3><span>{metrics.total} tasks</span></div><MiniBars items={typeRows} total={metrics.total} /></article>
        <article className="panel wide"><div className="panel-head"><h3>Delay Analytics</h3><span>Reasons and concentration</span></div><MiniBars items={delayRows.length ? delayRows : [["No delay reasons", 0]]} total={Math.max(1, delayRows.reduce((sum, [, value]) => sum + value, 0))} /></article>
      </section>

      <section className="register panel">
        <div className="register-head">
          <div><div className="eyebrow">DETAILED OPERATIONS VIEW</div><h2>Task Register</h2><p>{filtered.length} of {tasks.length} tasks displayed</p></div>
          <div className="filters">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks, owner, teamâ€¦" />
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>{options("owner").map((value) => <option key={value}>{value}</option>)}</select>
            <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>{options("team").map((value) => <option key={value}>{value}</option>)}</select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{options("status").map((value) => <option key={value}>{value}</option>)}</select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>{options("priority").map((value) => <option key={value}>{value}</option>)}</select>
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="All">All dates</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option>
            </select>
            <button onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {["#", "Task Type", "Priority", "Task Name", "Description", "Team", "Maker", "Owner", "Checker", "Report Date", "Start Date", "ETA", "Live Date", "Reason if ETA missing", "Status", "Comment"].map((header) => <th key={header}>{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={`${task.id}-${task.taskName}`}>
                  <td>{task.id}</td><td>{task.taskType}</td><td><span className="priority-pill">{task.priority || "Not provided"}</span></td>
                  <td><strong>{task.taskName}</strong></td><td>{task.description || "â€”"}</td><td>{task.team || "â€”"}</td><td>{task.maker || "â€”"}</td>
                  <td>{task.owner || "â€”"}</td><td>{task.checker || "â€”"}</td><td>{task.reportDate || "â€”"}</td><td>{task.startDate || "â€”"}</td>
                  <td>{task.eta || "â€”"}</td><td>{task.liveDate || "â€”"}</td><td>{task.etaReason || "â€”"}</td>
                  <td><span className={`status-pill ${isLive(task) ? "live" : isDelayed(task) ? "delayed" : isWip(task) ? "wip" : isPending(task) ? "pending" : "open"}`}>{task.status}</span></td>
                  <td>{task.comment || "â€”"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer><span>Sheet: Task Manager</span><span>Read-only Â· Auto refresh {Math.round(REFRESH_MS / 1000)}s</span></footer>
    </main>
  );
}