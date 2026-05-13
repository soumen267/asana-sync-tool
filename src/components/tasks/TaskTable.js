import { memo } from "react";
import { getPriorityBadgeClass, formatAssignee, formatDueDate, formatPriority, formatStatus } from "./taskUtils";

function TaskTable({ tasks = [], loading = false, onTaskSelect, selectedTaskId }) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded-full bg-slate-200"></div>
          <div className="h-5 w-32 rounded-full bg-slate-200"></div>
          <div className="space-y-3">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-12 rounded-2xl bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-600">
        <p className="text-lg font-semibold text-slate-900">No tasks to display yet</p>
        <p className="mt-2 text-sm">Connect an Asana webhook or sync tasks to populate this table.</p>
      </div>
    );
  }

  const handleRowClick = (taskId) => {
    if (typeof onTaskSelect === "function") {
      onTaskSelect(taskId);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition duration-200 hover:shadow-md">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Task Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Due Date</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {tasks.map((task) => {
              const dueDate = formatDueDate(task.due_on || task.dueAt || task.due_date);
              const status = formatStatus(task.completed);
              const assignee = formatAssignee(task.assignee);
              const priority = formatPriority(task.priority);
              const isSelected = selectedTaskId && selectedTaskId === task.gid;

              return (
                <tr
                  key={task.gid || task.id || task.name}
                  onClick={() => handleRowClick(task.gid)}
                  className={`transition duration-200 ${isSelected ? "bg-slate-100/90" : "hover:bg-slate-50"} ${typeof onTaskSelect === "function" ? "cursor-pointer" : ""}`}
                  aria-selected={isSelected}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                    {task.name || task.title || "Untitled task"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${getPriorityBadgeClass(priority)}`}>
                      {priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{dueDate}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{status}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">{assignee}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(TaskTable);
