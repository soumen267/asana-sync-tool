'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import TaskTable from "../../components/tasks/TaskTable";
import TaskDetail from "../../components/tasks/TaskDetail";
import { normalizePriority } from "../../services/priority";

function MetricCard({ label, value, iconClass }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className={`rounded-2xl ${iconClass} p-3 text-white`} />
      </div>
    </div>
  );
}

function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function stripAnglePlaceholders(value) {
  if (!value) return value;
  return value.replace(/^\s*<([^>]+)>\s*$/i, (_, inner) => inner.trim());
}

/** When the model puts "Suggested Next Action:" on the same line as Priority, split it out. */
function splitInlineSuggestedAction(text) {
  if (!text || typeof text !== "string") {
    return { priority: text, action: "" };
  }

  const match = text.match(
    /^([\s\S]*?)\s+(?:Suggested Next Action|Next Action)\s*:\s*([\s\S]*)$/i
  );

  if (!match) {
    return { priority: text.trim(), action: "" };
  }

  return {
    priority: match[1].trim(),
    action: match[2].trim(),
  };
}

function parseAiSummary(summaryText) {
  const fallback = {
    shortSummary: "There is no summary available for this task.",
    priorityInsight: "The priority level of this task is unavailable as there is no information provided about it.",
    suggestedNextAction: "Since there are no notes or instructions provided, the next action is to ask the task creator for more details.",
  };

  if (!summaryText || typeof summaryText !== "string") {
    return fallback;
  }

  const normalized = summaryText.trim();

  // Inline boundary: same-line "Suggested Next Action:" / "Next Action:" (model often merges sections)
  const inlineNextBoundary =
    "(?=[\\n\\r]\\s*(?:\\*\\*)?\\s*(?:Next Action|Suggested Next Action)\\b|\\s+(?:Suggested Next Action|Next Action)\\s*:|$)";

  // Matches aiSummary.js prompt: Summary: / Priority: / Next Action:
  const colonSummary = normalized.match(
    new RegExp(
      `(?:^|[\\n\\r])\\s*(?:\\*\\*)?\\s*Summary\\s*(?:\\*\\*)?\\s*:\\s*([\\s\\S]*?)(?=[\\n\\r]\\s*(?:\\*\\*)?\\s*Priority\\b|\\s+Priority\\s*:|$)`,
      "i"
    )
  );
  const colonPriority = normalized.match(
    new RegExp(
      `[\\n\\r]\\s*(?:\\*\\*)?\\s*Priority\\s*(?:\\*\\*)?\\s*:\\s*([\\s\\S]*?)${inlineNextBoundary}`,
      "i"
    )
  );
  const colonNext = normalized.match(
    /[\n\r]\s*(?:\*\*)?\s*(?:Next Action|Suggested Next Action)\s*(?:\*\*)?\s*:\s*([\s\S]*)$/i
  );

  // Older numbered labels from prior prompts
  const shortMatch = normalized.match(
    /(?:\*\*)?\s*(?:1\.\s*)?Short Summary(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\*\*)?\s*(?:2\.\s*)?Priority Insight(?:\*\*)?\s*:|$)/i
  );
  const priorityMatch = normalized.match(
    /(?:\*\*)?\s*(?:2\.\s*)?Priority Insight(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\*\*)?\s*(?:3\.\s*)?Suggested Next Action(?:\*\*)?\s*:|\s+(?:Suggested Next Action|Next Action)\s*:|$)/i
  );
  const actionMatch = normalized.match(
    /(?:\*\*)?\s*(?:3\.\s*)?Suggested Next Action(?:\*\*)?\s*:\s*([\s\S]*?)(?=(?:\*\*)?\s*Task Analysis(?:\*\*)?\s*:|$)/i
  );

  let shortSummary = colonSummary?.[1]?.trim() || shortMatch?.[1]?.trim();
  let priorityInsight = colonPriority?.[1]?.trim() || priorityMatch?.[1]?.trim();
  let suggestedNextAction = colonNext?.[1]?.trim() || actionMatch?.[1]?.trim();

  const splitFromPriority = splitInlineSuggestedAction(priorityInsight);
  if (splitFromPriority.action) {
    priorityInsight = splitFromPriority.priority;
    if (!suggestedNextAction) {
      suggestedNextAction = splitFromPriority.action;
    }
  }

  shortSummary = stripAnglePlaceholders(shortSummary);
  priorityInsight = stripAnglePlaceholders(priorityInsight);
  suggestedNextAction = stripAnglePlaceholders(suggestedNextAction);

  if (!shortSummary && !priorityInsight && !suggestedNextAction) {
    return fallback;
  }

  return {
    shortSummary: shortSummary || fallback.shortSummary,
    priorityInsight: priorityInsight || fallback.priorityInsight,
    suggestedNextAction: suggestedNextAction || fallback.suggestedNextAction,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncingNow, setSyncingNow] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [assigneeFilter, setAssigneeFilter] = useState("All");

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/asana/tasks");
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Unable to load tasks.");
      }

      setTasks(data.tasks || []);
      if (data.tasks?.length && data.tasks[0]?.gid) {
        setSelectedTaskId((currentId) => {
          const currentIdString = typeof currentId === "string" ? currentId.trim() : "";
          return currentIdString || data.tasks[0].gid;
        });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Unable to load task data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = window.localStorage.getItem("user");

    if (!user) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const user = window.localStorage.getItem("user");

    if (!user) {
      return;
    }

    const timeoutId = window.setTimeout(loadTasks, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadTasks]);

  useEffect(() => {
    const sanitizedTaskId = typeof selectedTaskId === "string" ? selectedTaskId.trim() : "";
    if (!sanitizedTaskId) {
      return;
    }

    const abortController = new AbortController();
    async function loadTaskDetail() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await fetch(`/api/asana/task/${sanitizedTaskId}`, { cache: "no-store", signal: abortController.signal });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to load task detail.");
        }

        setSelectedTask(data.task);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error(err);
          setDetailError(err.message || "Unable to load task detail.");
        }
      } finally {
        setDetailLoading(false);
      }
    }

    loadTaskDetail();
    return () => abortController.abort();
  }, [selectedTaskId]);

  const handleTaskSelect = useCallback((taskId) => {
    if (!taskId || typeof taskId !== "string") {
      return;
    }

    setSelectedTaskId(taskId);
  }, []);

  const runManualSync = useCallback(async () => {
    setSyncingNow(true);
    setSyncMessage("");

    try {
      const response = await fetch("/api/cron/asana-sync", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Manual sync failed.");
      }

      setSyncMessage(`Sync complete: ${data.synced} task(s) updated.`);
      await loadTasks();
    } catch (err) {
      console.error(err);
      setSyncMessage(err.message || "Manual sync failed.");
    } finally {
      setSyncingNow(false);
    }
  }, [loadTasks]);

  const handleLogout = useCallback(() => {
    window.localStorage.removeItem("user");
    router.replace("/login");
  }, [router]);

  const assigneeOptions = useMemo(() => {
    const names = tasks.map((task) => task.assignee?.name || "Unassigned");
    return ["All", ...Array.from(new Set(names))];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      const name = task.name?.toLowerCase() || "";
      const notes = task.notes?.toLowerCase() || "";
      const assigneeName = task.assignee?.name?.toLowerCase() || "unassigned";
      const matchesSearch =
        !query ||
        name.includes(query) ||
        notes.includes(query) ||
        assigneeName.includes(query);

      const taskPriority = normalizePriority(task.priority) || "N/A";
      const matchesPriority =
        priorityFilter === "All" || taskPriority === priorityFilter;

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Completed" ? task.completed : !task.completed);

      const matchesAssignee =
        assigneeFilter === "All" ||
        (assigneeFilter === "Unassigned"
          ? !task.assignee?.name
          : task.assignee?.name === assigneeFilter);

      return matchesSearch && matchesPriority && matchesStatus && matchesAssignee;
    });
  }, [tasks, searchQuery, priorityFilter, statusFilter, assigneeFilter]);

  const taskMetrics = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter((task) => task.completed).length,
    pending: tasks.filter((task) => !task.completed).length,
    highPriority: tasks.filter((task) => normalizePriority(task.priority) === "HIGH").length,
  }), [tasks]);

  const pieData = useMemo(
    () => [
      { name: "Completed", value: taskMetrics.completed },
      { name: "Pending", value: taskMetrics.pending },
    ],
    [taskMetrics]
  );

  const barData = useMemo(
    () => [
      { name: "High", value: taskMetrics.highPriority, fill: "#ef4444" },
      { name: "Medium", value: tasks.filter((task) => normalizePriority(task.priority) === "MEDIUM").length, fill: "#f59e0b" },
      { name: "Low", value: tasks.filter((task) => normalizePriority(task.priority) === "LOW").length, fill: "#22c55e" },
    ],
    [tasks, taskMetrics.highPriority]
  );

  const recentActivity = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const aDate = new Date(a.modified_at || a.created_at || 0);
      const bDate = new Date(b.modified_at || b.created_at || 0);
      return bDate - aDate;
    });

    return sorted.slice(0, 3).map((task) => ({
      title: task.completed ? "Task completed" : "Task updated",
      subtitle: task.name,
      time: formatRelativeTime(task.modified_at || task.created_at),
    }));
  }, [tasks]);

  const aiInsightItems = useMemo(
    () =>
      tasks
        .filter((task) => task.isRecentActivity)
        .map((task, index) => {
          const name = typeof task.name === "string" ? task.name.trim() : "";
        
          return {
            gid: task.gid || `task-${index}`,
            headline: name,
            ...parseAiSummary(task.aiSummary),
          };
        }),
    [tasks]
  );

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-3xl border border-slate-200/80 bg-slate-50/90 p-4 shadow-sm transition duration-200 hover:shadow-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Workspace overview</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Asana analytics</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Modern task performance dashboard with live Asana sync, priority insights, and activity tracking.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm">SaaS analytics</span>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-700">Live data</span>
            <button
              type="button"
              onClick={runManualSync}
              disabled={syncingNow}
              className="inline-flex items-center rounded-full border border-purple-200 bg-white px-4 py-2 text-xs font-semibold text-purple-700 shadow-sm transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncingNow ? "Syncing..." : "Run Sync Now"}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center rounded-full border border-slate-300 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
        {syncMessage ? (
          <p className="mt-3 text-xs font-medium text-slate-600">{syncMessage}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Analytics dashboard</p>
            <h1 className="mt-3 text-4xl font-semibold text-slate-900">Task performance overview</h1>
          </div>
          <div className="space-y-2 text-right">
            <p className="text-sm text-slate-500">Live insights from Asana sync</p>
            <p className="text-sm font-medium text-slate-700">{loading ? "Loading..." : error ? "Load failed" : "Updated just now"}</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-700">
            <p className="font-semibold">Unable to load Asana tasks</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total tasks" value={taskMetrics.total} iconClass="bg-slate-900" />
          <MetricCard label="Completed" value={taskMetrics.completed} iconClass="bg-emerald-500" />
          <MetricCard label="Pending" value={taskMetrics.pending} iconClass="bg-orange-500" />
          <MetricCard label="High priority" value={taskMetrics.highPriority} iconClass="bg-rose-500" />
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1.4fr_0.9fr]">
      <div className="self-start h-fit rounded-3xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-700">
              AI Insights
            </h3>

            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
              Gemini AI
            </span>
          </div>

          {aiInsightItems.length > 0 ? (
            <div className="space-y-4 overflow-y-auto pr-1">
              {aiInsightItems.map((item) => (
                <article key={item.gid} className="rounded-2xl border border-purple-100 bg-white/60 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.headline}</p>
                  <div className="mt-2 space-y-2 text-sm text-slate-700">
                    <p><span className="font-semibold">1. Short Summary:</span> {item.shortSummary}</p>
                    <p><span className="font-semibold">2. Priority Insight:</span> {item.priorityInsight}</p>
                    <p><span className="font-semibold">3. Suggested Next Action:</span> {item.suggestedNextAction}</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No task activity in the last 24 hours.
            </p>
          )}
        </div>
        {/* <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Task status</p>
              <p className="mt-1 text-sm text-slate-500">Overview of completed vs pending assignments</p>
            </div>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={4}
                  label
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.name === "Completed" ? "#22c55e" : "#f59e0b"}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div> */}

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:shadow-md">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">Priority breakdown</p>
              <p className="mt-1 text-sm text-slate-500">High, medium, and low priority tasks</p>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ marginTop: 8 }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {barData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">Recent activity</p>
              <p className="mt-1 text-sm text-slate-500">Latest updates from the workflow sync</p>
            </div>
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((item) => (
                  <div key={`${item.title}-${item.subtitle}`} className="rounded-3xl border border-slate-200/80 bg-slate-50 p-3 transition duration-200 hover:bg-slate-100">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.28em] text-slate-400">{item.time}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No recent activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:shadow-md">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr_0.75fr] xl:grid-cols-[1.2fr_0.85fr_0.75fr]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Search tasks</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by task, assignee or notes"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition duration-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Priority</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition duration-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option>All</option>
              <option>HIGH</option>
              <option>MEDIUM</option>
              <option>LOW</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition duration-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option>All</option>
              <option>Completed</option>
              <option>Pending</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Assignee</span>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition duration-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              {assigneeOptions.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Task list</p>
              <p className="mt-1 text-sm text-slate-500">Click a row to open the details panel.</p>
            </div>
          </div>
          <TaskTable
            tasks={filteredTasks}
            loading={loading}
            onTaskSelect={handleTaskSelect}
            selectedTaskId={selectedTaskId}
          />
        </div>

        <TaskDetail task={selectedTask} loading={detailLoading} />
      </section>

      {detailError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p className="font-semibold">Unable to load selected task detail</p>
          <p className="mt-1 text-sm">{detailError}</p>
        </div>
      ) : null}
    </main>
  );
}
