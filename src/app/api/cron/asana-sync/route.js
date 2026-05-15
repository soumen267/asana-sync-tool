import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { detectPriority } from "../../../../services/aiPriority";
import { generateTaskSummary } from "../../../../services/aiSummary";
import { getProjects, getTasks } from "../../../../services/asana";
import { saveTaskRecord } from "../../../../services/taskStore";
import { sendSlackNotification } from "../../../../services/slack";
import { normalizePriority } from "../../../../services/priority";

const DEFAULT_SNAPSHOT_PATH = "./storage/asana-task-snapshot.json";

function getSnapshotPath() {
  const configuredPath = process.env.ASANA_SYNC_SNAPSHOT_PATH || DEFAULT_SNAPSHOT_PATH;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

async function readSnapshot() {
  const snapshotPath = getSnapshotPath();

  try {
    const raw = await fs.readFile(snapshotPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

async function writeSnapshot(snapshot) {
  const snapshotPath = getSnapshotPath();
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
}

function buildTaskFingerprint(task) {
  return `${task.modified_at || ""}|${task.completed ? "1" : "0"}|${task.name || ""}|${task.notes || ""}|${normalizePriority(task.priority) || ""}`;
}

function createTaskRecord(task, priority, aiSummary, action) {
  return {
    event: {
      action,
      resource: { gid: task.gid, resource_type: "task", name: task.name },
      source: "cron",
    },
    task: {
      ...task,
      priority,
      aiSummary,
    },
    ai: {
      priority,
      summary: aiSummary,
    },
    receivedAt: new Date().toISOString(),
  };
}

async function getProjectId() {
  if (process.env.ASANA_PROJECT_ID) {
    return process.env.ASANA_PROJECT_ID;
  }

  const projects = await getProjects();
  return projects?.[0]?.gid || null;
}

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized cron request." },
      { status: 401 }
    );
  }

  try {
    const projectId = await getProjectId();
    if (!projectId) {
      throw new Error("No Asana project available for cron sync.");
    }

    const tasks = await getTasks(projectId);
    const previousSnapshot = await readSnapshot();
    const nextSnapshot = {};
    const changedTasks = [];

    for (const task of tasks) {
      const fingerprint = buildTaskFingerprint(task);
      nextSnapshot[task.gid] = fingerprint;
      const previous = previousSnapshot[task.gid];

      if (!previous || previous !== fingerprint) {
        changedTasks.push(task);
      }
    }

    const results = [];

    for (const task of changedTasks) {
      const normalizedTask = {
        name: task.name || "Unnamed task",
        notes: task.notes || "",
      };

      const aiSummary = await generateTaskSummary(normalizedTask);
      const aiPriority = task.priority ? null : await detectPriority(normalizedTask);
      const priority = normalizePriority(task.priority || aiPriority);

      const record = createTaskRecord(
        task,
        priority,
        aiSummary,
        previousSnapshot[task.gid] ? "changed" : "added"
      );

      const saved = await saveTaskRecord(record).catch((error) => {
        console.error("Task persistence error (cron):", error);
        return null;
      });

      const slackMessage = [
        "*Asana Task Synced (Cron)*",
        `*Task:* ${task.name || "Unnamed task"}`,
        `*Action:* ${record.event.action}`,
        `*Status:* ${task.completed ? "Completed" : "Open"}`,
        `*Priority:* ${priority}`,
        `*AI Summary:* ${aiSummary}`,
      ].join("\n");

      const slackResult = await sendSlackNotification(slackMessage).catch((error) => {
        console.error("Slack notification error (cron):", error);
        return null;
      });

      results.push({
        taskId: task.gid,
        action: record.event.action,
        status: task.completed ? "completed" : "open",
        saved: Boolean(saved),
        slackSent: Boolean(slackResult),
      });
    }

    await writeSnapshot(nextSnapshot);

    return NextResponse.json({
      success: true,
      projectId,
      scanned: tasks.length,
      synced: changedTasks.length,
      results,
    });
  } catch (error) {
    console.error("Asana cron sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to run cron sync.",
      },
      { status: 500 }
    );
  }
}
