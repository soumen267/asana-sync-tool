import { NextResponse } from "next/server";
import { getProjects, getTaskDetails, getTasks } from "../../../../services/asana";
import { detectPriority } from "../../../../services/aiPriority";
import { generateTaskSummary } from "../../../../services/aiSummary";
import { normalizePriority } from "../../../../services/priority";
import { getStoredTasks, saveTaskRecord } from "../../../../services/taskStore";

function createTaskRecord(task, priority, aiSummary, source = "api") {
  return {
    event: {
      action: "synced",
      resource: { gid: task.gid, resource_type: "task", name: task.name },
      source,
    },
    task: {
      ...task,
      aiSummary,
      priority,
    },
    ai: {
      priority,
      summary: aiSummary,
    },
    receivedAt: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const storedTasks = await getStoredTasks();

    if (storedTasks.length > 0) {
      return NextResponse.json({
        success: true,
        projectId: process.env.ASANA_PROJECT_ID || null,
        source: "database",
        tasks: storedTasks,
      });
    }

    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;
    const projectId = process.env.ASANA_PROJECT_ID;
    let selectedProjectId = projectId;

    if (!selectedProjectId) {
      const projects = await getProjects();
      selectedProjectId = projects?.[0]?.gid;
    }

    if (!selectedProjectId) {
      throw new Error("No Asana project available. Set ASANA_PROJECT_ID or create at least one project.");
    }

    const tasks = await getTasks(selectedProjectId);
    const enrichedTasks = await Promise.all(
      tasks.map(async (task) => {
        let resolvedNotes = task.notes || "";

        if (!resolvedNotes && task.gid) {
          try {
            const detailedTask = await getTaskDetails(task.gid);
            resolvedNotes = detailedTask?.notes || "";
          } catch (detailError) {
            console.warn(`Unable to fetch details for task ${task.gid}:`, detailError);
          }
        }

        const normalizedTask = {
          name: task.name,
          notes: resolvedNotes,
        };
        const aiPriority = task.priority ? null : await detectPriority(normalizedTask);
        const priority = normalizePriority(task.priority || aiPriority);
        const aiSummary = await generateTaskSummary(normalizedTask);
        const createdAt = task.created_at ? new Date(task.created_at).getTime() : 0;
        const modifiedAt = task.modified_at ? new Date(task.modified_at).getTime() : 0;
        const isRecentActivity =
          (createdAt && now - createdAt <= dayInMs) ||
          (modifiedAt && now - modifiedAt <= dayInMs);

        const enrichedTask = {
          gid: task.gid,
          name: task.name,
          completed: task.completed,
          due_on: task.due_on,
          assignee: task.assignee,
          notes: resolvedNotes,
          created_at: task.created_at,
          modified_at: task.modified_at,
          priority,
          aiSummary,
          isRecentActivity: Boolean(isRecentActivity),
        };

        await saveTaskRecord(
          createTaskRecord(enrichedTask, priority, aiSummary)
        ).catch((saveError) => {
          console.error(`Unable to persist task ${task.gid}:`, saveError);
        });

        return enrichedTask;
      })
    );

    return NextResponse.json({
      success: true,
      projectId: selectedProjectId,
      source: "asana",
      tasks: enrichedTasks,
    });
  } catch (error) {
    console.error("Asana tasks API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load Asana tasks.",
      },
      { status: 500 }
    );
  }
}
