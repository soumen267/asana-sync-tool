import { normalizePriority } from "./priority";

const ASANA_BASE_URL = "https://app.asana.com/api/1.0";
const ASANA_API_TOKEN = process.env.ASANA_API_TOKEN;

function getAuthHeaders() {
  if (!ASANA_API_TOKEN) {
    throw new Error("Missing ASANA_API_TOKEN in environment variables.");
  }

  return {
    Authorization: `Bearer ${ASANA_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function asanaFetch(endpoint, options = {}) {
  const url = `${ASANA_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const errorMessage = isJson
      ? payload?.errors?.map((error) => error.message).join(" | ") || JSON.stringify(payload)
      : payload;

    throw new Error(`Asana API error (${response.status}): ${errorMessage}`);
  }

  return payload;
}

function parsePriority(customFields = []) {
  if (!Array.isArray(customFields)) {
    return undefined;
  }

  const field = customFields.find((item) =>
    /priority/i.test(item.name || "") || /priority/i.test(item.display_name || "")
  );

  if (!field) {
    return undefined;
  }

  if (field.display_value) {
    return normalizePriority(field.display_value);
  }

  if (field.text_value) {
    return normalizePriority(field.text_value);
  }

  if (field.enum_value?.name) {
    return normalizePriority(field.enum_value.name);
  }

  return undefined;
}

export async function getProjects() {
  const data = await asanaFetch("/projects");
  return data.data || [];
}

export async function getTasks(projectId) {
  if (!projectId) {
    throw new Error("getTasks requires a projectId.");
  }

  const fields = [
    "gid",
    "name",
    "completed",
    "due_on",
    "assignee.name",
    "notes",
    "created_at",
    "modified_at",
    "custom_fields.name",
    "custom_fields.display_value",
    "custom_fields.text_value",
    "custom_fields.enum_value.name",
  ].join(",");

  const allTasks = [];
  let offset = null;

  do {
    const params = new URLSearchParams({
      opt_fields: fields,
      limit: "100",
    });

    if (offset) {
      params.set("offset", offset);
    }

    const data = await asanaFetch(
      `/projects/${projectId}/tasks?${params.toString()}`
    );

    allTasks.push(...(data.data || []));
    offset = data?.next_page?.offset || null;
  } while (offset);

  return allTasks.map((task) => ({
    ...task,
    priority: parsePriority(task.custom_fields),
  }));
}

export async function getTaskDetails(taskId) {
  if (!taskId) {
    throw new Error("getTaskDetails requires a taskId.");
  }

  const fields = [
    "gid",
    "name",
    "completed",
    "due_on",
    "assignee.name",
    "notes",
    "created_at",
    "modified_at",
    "custom_fields.name",
    "custom_fields.display_value",
    "custom_fields.text_value",
    "custom_fields.enum_value.name",
  ].join(",");

  const data = await asanaFetch(
    `/tasks/${taskId}?opt_fields=${encodeURIComponent(fields)}`
  );

  const task = data.data;

  if (!task) {
    throw new Error("Task not found");
  }

  return {
    ...task,
    priority: parsePriority(task.custom_fields),
  };
}

export async function createWebhook(projectId, targetUrl) {
  if (!projectId) {
    throw new Error("createWebhook requires a projectId.");
  }

  if (!targetUrl) {
    throw new Error("createWebhook requires a targetUrl.");
  }

  const body = JSON.stringify({
    data: {
      resource: projectId,
      target: targetUrl,
    },
  });

  const data = await asanaFetch("/webhooks", {
    method: "POST",
    body,
  });

  return data.data || null;
}

export default {
  getProjects,
  getTasks,
  getTaskDetails,
  createWebhook,
};
