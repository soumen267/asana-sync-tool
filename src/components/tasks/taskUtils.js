import { normalizePriority } from "../../services/priority";

export function getPriorityBadgeClass(priority) {
  switch (normalizePriority(priority)) {
    case "HIGH":
      return "bg-red-100 text-red-800";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800";
    case "LOW":
      return "bg-green-100 text-green-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

export function formatPriority(priority) {
  return normalizePriority(priority) || "N/A";
}

export function formatAssignee(assignee) {
  if (!assignee) {
    return "Unassigned";
  }

  if (typeof assignee === "string") {
    return assignee;
  }

  return assignee.name || assignee.email || "Unassigned";
}

export function formatDueDate(dateValue) {
  if (!dateValue) {
    return "—";
  }

  return new Date(dateValue).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatStatus(completed) {
  return completed ? "Completed" : "Open";
}
