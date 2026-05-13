import fs from "fs/promises";
import path from "path";
import pool from "../lib/db";

let schemaReadyPromise = null;

function getResolvedStorePath() {
  const storePath = process.env.TASK_STORE_PATH;

  if (!storePath) {
    return null;
  }

  return path.isAbsolute(storePath)
    ? storePath
    : path.join(process.cwd(), storePath);
}

async function appendRecordToFile(record) {
  const resolvedPath = getResolvedStorePath();

  if (!resolvedPath) {
    console.warn("TASK_STORE_PATH is not configured; skipping file persistence.");
    return null;
  }

  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  const entry = JSON.stringify(record) + "\n";
  await fs.appendFile(resolvedPath, entry, "utf8");

  return { storedAt: resolvedPath };
}

function toTimestamp(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildStoredTask(record) {
  const task = record?.task || {};
  const event = record?.event || {};
  const resource = event.resource || {};

  return {
    gid: task.gid || resource.gid || null,
    name: task.name || resource.name || "Unnamed task",
    notes: task.notes || "",
    completed: Boolean(task.completed),
    due_on: task.due_on || null,
    assignee_name: task.assignee?.name || task.assignee || null,
    created_at: toTimestamp(task.created_at),
    modified_at: toTimestamp(task.modified_at) || toTimestamp(record?.receivedAt),
    priority: record?.ai?.priority || task.priority || null,
    ai_summary: record?.ai?.summary || task.aiSummary || null,
    last_event_action: event.action || null,
    source: event.source || "runtime",
    synced_at: toTimestamp(record?.receivedAt) || new Date().toISOString(),
  };
}

function mapRowToTask(row) {
  return {
    gid: row.asana_gid,
    name: row.name,
    completed: row.completed,
    due_on: row.due_on,
    assignee: row.assignee_name ? { name: row.assignee_name } : null,
    notes: row.notes || "",
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    modified_at: row.modified_at ? new Date(row.modified_at).toISOString() : null,
    priority: row.priority,
    aiSummary: row.ai_summary || "",
  };
}

async function ensureTaskSchema() {
  if (!process.env.DATABASE_URL) {
    return false;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS asana_tasks (
          asana_gid TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          notes TEXT,
          completed BOOLEAN NOT NULL DEFAULT FALSE,
          due_on DATE,
          assignee_name TEXT,
          created_at TIMESTAMPTZ,
          modified_at TIMESTAMPTZ,
          priority TEXT,
          ai_summary TEXT,
          last_event_action TEXT,
          source TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS asana_task_events (
          id BIGSERIAL PRIMARY KEY,
          task_gid TEXT NOT NULL,
          event_action TEXT,
          event_source TEXT,
          payload JSONB NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_asana_tasks_modified_at
        ON asana_tasks (modified_at DESC NULLS LAST)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_asana_task_events_task_gid
        ON asana_task_events (task_gid, received_at DESC)
      `);

      return true;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

async function saveTaskRecordToDatabase(record) {
  const task = buildStoredTask(record);

  if (!task.gid) {
    return null;
  }

  await ensureTaskSchema();

  await pool.query(
    `
      INSERT INTO asana_tasks (
        asana_gid,
        name,
        notes,
        completed,
        due_on,
        assignee_name,
        created_at,
        modified_at,
        priority,
        ai_summary,
        last_event_action,
        source,
        synced_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (asana_gid) DO UPDATE SET
        name = EXCLUDED.name,
        notes = EXCLUDED.notes,
        completed = EXCLUDED.completed,
        due_on = EXCLUDED.due_on,
        assignee_name = EXCLUDED.assignee_name,
        created_at = COALESCE(EXCLUDED.created_at, asana_tasks.created_at),
        modified_at = COALESCE(EXCLUDED.modified_at, asana_tasks.modified_at),
        priority = EXCLUDED.priority,
        ai_summary = EXCLUDED.ai_summary,
        last_event_action = EXCLUDED.last_event_action,
        source = EXCLUDED.source,
        synced_at = EXCLUDED.synced_at
    `,
    [
      task.gid,
      task.name,
      task.notes,
      task.completed,
      task.due_on,
      task.assignee_name,
      task.created_at,
      task.modified_at,
      task.priority,
      task.ai_summary,
      task.last_event_action,
      task.source,
      task.synced_at,
    ]
  );

  await pool.query(
    `
      INSERT INTO asana_task_events (
        task_gid,
        event_action,
        event_source,
        payload,
        received_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5)
    `,
    [
      task.gid,
      task.last_event_action,
      task.source,
      JSON.stringify(record),
      task.synced_at,
    ]
  );

  return { recordId: task.gid };
}

export async function saveTaskRecord(record) {
  if (process.env.DATABASE_URL) {
    return saveTaskRecordToDatabase(record);
  }

  return appendRecordToFile(record);
}

export async function getStoredTasks() {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  await ensureTaskSchema();
  const result = await pool.query(`
    SELECT
      asana_gid,
      name,
      notes,
      completed,
      due_on,
      assignee_name,
      created_at,
      modified_at,
      priority,
      ai_summary,
      synced_at
    FROM asana_tasks
    ORDER BY COALESCE(modified_at, created_at, synced_at) DESC
  `);

  return result.rows.map((row) => {
    const task = mapRowToTask(row);
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const createdAt = task.created_at ? new Date(task.created_at).getTime() : 0;
    const modifiedAt = task.modified_at ? new Date(task.modified_at).getTime() : 0;

    return {
      ...task,
      isRecentActivity: Boolean(
        (createdAt && now - createdAt <= dayInMs) ||
        (modifiedAt && now - modifiedAt <= dayInMs)
      ),
    };
  });
}

export async function getStoredTaskByGid(taskId) {
  if (!process.env.DATABASE_URL || !taskId) {
    return null;
  }

  await ensureTaskSchema();
  const result = await pool.query(
    `
      SELECT
        asana_gid,
        name,
        notes,
        completed,
        due_on,
        assignee_name,
        created_at,
        modified_at,
        priority,
        ai_summary
      FROM asana_tasks
      WHERE asana_gid = $1
      LIMIT 1
    `,
    [taskId]
  );

  return result.rows[0] ? mapRowToTask(result.rows[0]) : null;
}
