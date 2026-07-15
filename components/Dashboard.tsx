"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleGauge,
  Clock3,
  Database,
  Download,
  Filter,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Users
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { CountItem, Task, TaskApiResponse } from "../types/task";

const STATUS_COLORS: Record<string, string> = {
  Completed: "#16a34a",
  "In Progress": "#2563eb",
  Blocked: "#dc2626",
  "Waiting for Feedback": "#d97706",
  "Needs Update": "#7c3aed",
  "Not Started": "#64748b"
};
const CHART_COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#dc2626", "#64748b", "#0891b2"];
const PAGE_SIZE = 10;

type SortKey = "taskId" | "taskName" | "owner" | "priority" | "status" | "daysOpen";

function formatDate(value: string | null) {
  if (!value) return "â€”";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value}T00:00:00`)
  );
}

function statusClass(value: string) {
  return `status-pill status-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function countValue(items: CountItem[], name: string) {
  return items.find((item) => item.name === name)?.value ?? 0;
}

function downloadCsv(tasks: Task[]) {
  const headers = [
    "Task ID",
    "Task Name",
    "Category",
    "Owner",
    "Priority",
    "Status",
    "Date Started",
    "Due Date",
    "Completed Date",
    "Progress %",
    "Days Open",
    "Next Action",
    "Scale Readiness",
    "Business Impact",
    "Current Limitation",
    "Notes"
  ];
  const rows = tasks.map((task) => [
    task.taskId,
    task.taskName,
    task.category,
    task.owner,
    task.priority,
    task.status,
    task.dateStarted ?? "",
    task.dueDate ?? "",
    task.taskCompletedDate ?? "",
    task.progress ?? "",
    task.daysOpen,
    task.nextAction,
    task.scaleReadiness,
    task.businessImpact,
    task.currentLimitation,
    task.notes
  ]);
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ls-task-manager-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [data, setData] = useState<TaskApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [owner, setOwner] = useState("All");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("daysOpen");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/tasks${force ? "?force=1" : ""}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load dashboard.");
      setData(payload as TaskApiResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const interval = Number(process.env.NEXT_PUBLIC_REFRESH_INTERVAL_MS ?? 30000);
    const id = window.setInterval(() => load(false), Math.max(15000, interval));
    return () => window.clearInterval(id);
  }, [load]);

  const filters = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const unique = (key: keyof Task) => [...new Set(tasks.map((task) => String(task[key] ?? "")))].filter(Boolean).sort();
    return {
      statuses: unique("status"),
      priorities: unique("priority"),
      owners: unique("owner"),
      categories: unique("category")
    };
  }, [data]);

  const filtered = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const term = query.trim().toLowerCase();
    return tasks
      .filter((task) => status === "All" || task.status === status)
      .filter((task) => priority === "All" || task.priority === priority)
      .filter((task) => owner === "All" || task.owner === owner)
      .filter((task) => category === "All" || task.category === category)
      .filter((task) => {
        if (!term) return true;
        return [task.taskId, task.taskName, task.taskBrief, task.owner, task.category, task.nextAction]
          .join(" ")
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDirection === "asc" ? result : -result;
      });
  }, [data, query, status, priority, owner, category, sortKey, sortDirection]);

  useEffect(() => setPage(1), [query, status, priority, owner, category]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const attention = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return (data?.tasks ?? [])
      .filter(
        (task) =>
          task.status === "Blocked" ||
          task.status === "Needs Update" ||
          (task.status !== "Completed" && Boolean(task.dueDate && task.dueDate < now)) ||
          (task.status !== "Completed" && ["High", "Critical"].includes(task.priority) && task.daysOpen >= 7)
      )
      .sort((a, b) => {
        const riskA = (a.status === "Blocked" ? 100 : 0) + (a.priority === "Critical" ? 50 : a.priority === "High" ? 25 : 0) + a.daysOpen;
        const riskB = (b.status === "Blocked" ? 100 : 0) + (b.priority === "Critical" ? 50 : b.priority === "High" ? 25 : 0) + b.daysOpen;
        return riskB - riskA;
      })
      .slice(0, 6);
  }, [data]);

  function changeSort(key: SortKey) {
    if (sortKey === key) setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  if (loading && !data) {
    return (
      <main className="state-shell">
        <RefreshCw className="spin" size={34} />
        <h1>Loading Task Manager</h1>
        <p>Reading the Google Sheet securely through the server.</p>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="state-shell error-state">
        <AlertTriangle size={38} />
        <h1>Dashboard could not load</h1>
        <p>{error}</p>
        <button onClick={() => load(true)}>Try again</button>
      </main>
    );
  }

  if (!data) return null;
  const m = data.metrics;
  const statusTotal = m.byStatus.reduce((sum, item) => sum + item.value, 0) || 1;

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand-mark">LS</div>
          <div>
            <p className="eyebrow">Live reporting workspace</p>
            <h1>Task Manager Dashboard</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="source-badge">
            <span className="live-dot" />
            Google Sheet live Â· {data.meta.sheetTitle}
          </div>
          <button className="secondary-button" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
          </button>
          <button className="secondary-button" onClick={() => downloadCsv(filtered)}>
            <Download size={16} /> Export
          </button>
          <form action="/api/auth/logout" method="post">
            <button className="icon-button" aria-label="Log out" title="Log out"><LogOut size={18} /></button>
          </form>
        </div>
      </header>

      <section className="meta-strip">
        <div><Database size={15} /> {data.meta.rowCount} rows</div>
        <div><ShieldCheck size={15} /> Read-only source</div>
        <div><Clock3 size={15} /> Updated {new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(data.meta.fetchedAt))}</div>
        <div><Activity size={15} /> Cache {data.meta.cacheState}</div>
      </section>

      {error ? <div className="inline-alert"><AlertTriangle size={16} /> Refresh warning: {error}. Showing the last successful data.</div> : null}

      <section className="kpi-grid">
        <article className="kpi-card"><div className="kpi-icon"><LayoutDashboard /></div><div><span>Total tasks</span><strong>{m.totalTasks}</strong><small>All tracked work</small></div></article>
        <article className="kpi-card"><div className="kpi-icon success"><CheckCircle2 /></div><div><span>Completion rate</span><strong>{m.completionRate}%</strong><small>{m.completedTasks} completed</small></div></article>
        <article className="kpi-card"><div className="kpi-icon info"><Activity /></div><div><span>Active workload</span><strong>{m.activeTasks}</strong><small>{countValue(m.byStatus, "In Progress")} currently in progress</small></div></article>
        <article className="kpi-card"><div className="kpi-icon danger"><AlertTriangle /></div><div><span>Risk queue</span><strong>{m.blockedTasks + m.overdueTasks}</strong><small>{m.blockedTasks} blocked Â· {m.overdueTasks} overdue</small></div></article>
        <article className="kpi-card"><div className="kpi-icon warning"><Target /></div><div><span>High-priority active</span><strong>{m.highPriorityActive}</strong><small>Requires management focus</small></div></article>
        <article className="kpi-card"><div className="kpi-icon"><CalendarClock /></div><div><span>Average age</span><strong>{m.averageDaysOpen}d</strong><small>Open task duration</small></div></article>
      </section>

      <section className="insight-grid">
        <article className="panel status-panel">
          <div className="panel-header"><div><p className="eyebrow">Portfolio overview</p><h2>Status distribution</h2></div><CircleGauge size={20} /></div>
          <div className="status-layout">
            <div className="donut-wrap">
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={m.byStatus} dataKey="value" nameKey="name" innerRadius={66} outerRadius={94} paddingAngle={2}>
                    {m.byStatus.map((item, index) => <Cell key={item.name} fill={STATUS_COLORS[item.name] ?? CHART_COLORS[index % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center"><strong>{m.completionRate}%</strong><span>complete</span></div>
            </div>
            <div className="legend-list">
              {m.byStatus.map((item, index) => (
                <div key={item.name}><span className="legend-dot" style={{ background: STATUS_COLORS[item.name] ?? CHART_COLORS[index % CHART_COLORS.length] }} /><span>{item.name}</span><strong>{item.value}</strong><small>{Math.round((item.value / statusTotal) * 100)}%</small></div>
              ))}
            </div>
          </div>
        </article>

        <article className="panel trend-panel">
          <div className="panel-header"><div><p className="eyebrow">Delivery velocity</p><h2>Started vs completed</h2></div><BarChart3 size={20} /></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={270}>
              <AreaChart data={m.monthlyTrend} margin={{ left: -18, right: 8, top: 10 }}>
                <defs><linearGradient id="started" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.35}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient><linearGradient id="completed" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#16a34a" stopOpacity={0.35}/><stop offset="95%" stopColor="#16a34a" stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="started" name="Started" stroke="#2563eb" fill="url(#started)" strokeWidth={2} />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" fill="url(#completed)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel category-panel">
          <div className="panel-header"><div><p className="eyebrow">Work allocation</p><h2>Tasks by category</h2></div><Filter size={20} /></div>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={m.byCategory.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="value" name="Tasks" radius={[0, 6, 6, 0]} fill="#0f766e" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel attention-panel">
          <div className="panel-header"><div><p className="eyebrow">Management focus</p><h2>Attention queue</h2></div><AlertTriangle size={20} /></div>
          <div className="attention-list">
            {attention.length ? attention.map((task) => (
              <div className="attention-row" key={task.taskId}>
                <div className="attention-rank" />
                <div><strong>{task.taskName}</strong><span>{task.taskId} Â· {task.owner} Â· {task.daysOpen} days</span></div>
                <span className={statusClass(task.status)}>{task.status}</span>
              </div>
            )) : <div className="empty-panel">No high-risk tasks detected.</div>}
          </div>
        </article>
      </section>

      <section className="secondary-grid">
        <article className="panel compact-panel">
          <div className="panel-header"><div><p className="eyebrow">Team view</p><h2>Owner workload</h2></div><Users size={20} /></div>
          <div className="rank-list">{m.byOwner.slice(0, 8).map((item, index) => <div key={item.name}><span>{index + 1}</span><strong>{item.name}</strong><div className="mini-bar"><i style={{ width: `${(item.value / Math.max(1, m.byOwner[0]?.value ?? 1)) * 100}%` }} /></div><b>{item.value}</b></div>)}</div>
        </article>
        <article className="panel compact-panel">
          <div className="panel-header"><div><p className="eyebrow">Scale potential</p><h2>Readiness distribution</h2></div><Target size={20} /></div>
          <div className="chart-box short-chart"><ResponsiveContainer width="100%" height={210}><BarChart data={m.byScaleReadiness} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-12} textAnchor="end" height={58}/><YAxis allowDecimals={false} tickLine={false} axisLine={false}/><Tooltip/><Bar dataKey="value" name="Tasks" fill="#7c3aed" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
        </article>
        <article className="panel health-panel">
          <div className="panel-header"><div><p className="eyebrow">Source quality</p><h2>Data health</h2></div><ShieldCheck size={20} /></div>
          <div className="health-score"><div className="health-ring" style={{ "--score": `${data.health.score * 3.6}deg` } as React.CSSProperties}><strong>{data.health.score}</strong><span>/100</span></div><div><b>{data.health.score >= 85 ? "Strong" : data.health.score >= 65 ? "Needs cleanup" : "At risk"}</b><p>Accuracy improves when IDs, dates, owners and progress fields are complete.</p></div></div>
          <div className="health-issues">{data.health.issues.slice(0, 5).map((issue) => <div key={issue.label}><span className={`severity ${issue.severity}`} />{issue.label}<strong>{issue.count}</strong></div>)}</div>
        </article>
      </section>

      <section className="table-panel panel">
        <div className="table-toolbar">
          <div><p className="eyebrow">Operational detail</p><h2>Task register</h2><span>{filtered.length} matching tasks</span></div>
          <div className="toolbar-controls">
            <label className="search-box"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, owners, actions..."/></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}><option>All</option>{filters.statuses.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}><option>All</option>{filters.priorities.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={owner} onChange={(event) => setOwner(event.target.value)}><option>All</option>{filters.owners.map((value) => <option key={value}>{value}</option>)}</select>
            <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{filters.categories.map((value) => <option key={value}>{value}</option>)}</select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th/><th onClick={() => changeSort("taskId")}>Task ID <ArrowUpDown size={13}/></th><th onClick={() => changeSort("taskName")}>Task <ArrowUpDown size={13}/></th><th onClick={() => changeSort("owner")}>Owner <ArrowUpDown size={13}/></th><th onClick={() => changeSort("priority")}>Priority <ArrowUpDown size={13}/></th><th onClick={() => changeSort("status")}>Status <ArrowUpDown size={13}/></th><th>Progress</th><th onClick={() => changeSort("daysOpen")}>Age <ArrowUpDown size={13}/></th><th>Next action</th></tr></thead>
            <tbody>
              {paged.map((task) => {
                const isOpen = expanded === task.taskId;
                return (
                  <Fragment key={task.taskId}>
                    <tr className={isOpen ? "row-open" : ""}>
                      <td><button className="expand-button" onClick={() => setExpanded(isOpen ? null : task.taskId)}>{isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button></td>
                      <td><strong className="task-id">{task.taskId}</strong></td>
                      <td><strong className="task-name">{task.taskName}</strong><span className="task-sub">{task.category}</span></td>
                      <td>{task.owner}</td>
                      <td><span className={`priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span></td>
                      <td><span className={statusClass(task.status)}>{task.status}</span></td>
                      <td>{task.progress !== null ? <div className="progress-cell"><div><i style={{ width: `${task.progress}%` }}/></div><span>{task.progress}%</span></div> : <span className="muted">Not tracked</span>}</td>
                      <td><strong>{task.daysOpen}d</strong></td>
                      <td className="next-action">{task.nextAction || "â€”"}</td>
                    </tr>
                    {isOpen ? <tr className="detail-row"><td colSpan={9}><div className="detail-grid"><div><span>Task brief</span><p>{task.taskBrief || "â€”"}</p></div><div><span>Business impact</span><p>{task.businessImpact || "â€”"}</p></div><div><span>Current limitation</span><p>{task.currentLimitation || "â€”"}</p></div><div><span>Output / deliverable</span><p>{task.outputDeliverable || "â€”"}</p></div><div><span>Current stack</span><p>{task.currentStackUsed || "â€”"}</p></div><div><span>Future scaling stack</span><p>{task.futureScalingStack || "â€”"}</p></div><div><span>Dates</span><p>Started: {formatDate(task.dateStarted)}<br/>Due: {formatDate(task.dueDate)}<br/>Completed: {formatDate(task.taskCompletedDate)}</p></div><div><span>Readiness & notes</span><p>{task.scaleReadiness}<br/>{task.notes || "No notes"}</p></div></div></td></tr> : null}
                  </Fragment>
                );
              })}
              {!paged.length ? <tr><td colSpan={9} className="empty-table">No tasks match the selected filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="pagination"><span>Page {page} of {pageCount}</span><div><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button></div></div>
      </section>

      <footer><span>LS Task Manager Â· Presentation layer only</span><span>Google Sheet remains the source of truth</span></footer>
    </main>
  );
}

