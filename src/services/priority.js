export function normalizePriority(priority) {
  if (priority == null) {
    return undefined;
  }

  const value =
    typeof priority === "object" ? priority.priority : priority;
  const normalized = String(value || "").trim().toUpperCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("HIGH")) {
    return "HIGH";
  }

  if (normalized.includes("MEDIUM")) {
    return "MEDIUM";
  }

  if (normalized.includes("LOW")) {
    return "LOW";
  }

  return normalized;
}
