import { memo } from "react";
import { getPriorityBadgeClass, formatAssignee, formatDueDate, formatPriority, formatStatus } from "./taskUtils";

function TaskDetail({ task, loading }) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm transition duration-200 hover:shadow-md">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded-full bg-slate-200"></div>
          <div className="h-5 w-40 rounded-full bg-slate-200"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="h-4 rounded-xl bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-600 shadow-sm">
        <p className="text-base font-semibold text-slate-900">Select a task to view details</p>
        <p className="mt-2 text-sm">Click any task row to load the full Asana task details.</p>
      </div>
    );
  }

  const assignee = formatAssignee(task.assignee);
  const priority = formatPriority(task.priority);
  const status = formatStatus(task.completed);

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Task details</p>
          <p className="mt-1 text-sm text-slate-500">Full Asana task data and custom field values.</p>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPriorityBadgeClass(priority)}`}>
          {priority}
        </span>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-slate-500">Task name</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{task.name}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Status</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{status}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Due date</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatDueDate(task.due_on)}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Assignee</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{assignee}</p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Last updated</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatDueDate(task.modified_at || task.created_at)}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Notes</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{task.notes || "No additional notes available."}</p>
        </div>
      </div>
    </div>
  );
}

export default memo(TaskDetail);
