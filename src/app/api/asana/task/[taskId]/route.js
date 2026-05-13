import { NextResponse } from "next/server";
import { getTaskDetails } from "../../../../../services/asana";
import { generateTaskSummary } from "../../../../../services/aiSummary";
import { getStoredTaskByGid, saveTaskRecord } from "../../../../../services/taskStore";
import { detectPriority } from "../../../../../services/aiPriority";
import { normalizePriority } from "../../../../../services/priority";

export async function GET(request, context) {
  try {
    const params = await context.params;
    const taskId = params?.taskId;

    if (!taskId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing taskId",
        },
        {
          status: 400,
        }
      );
    }

    const storedTask = await getStoredTaskByGid(taskId);

    if (storedTask) {
      return NextResponse.json({
        success: true,
        task: storedTask,
      });
    }

    const task = await getTaskDetails(taskId);

    if (!task) {
      return NextResponse.json(
        {
          success: false,
          error: "Task not found",
        },
        {
          status: 404,
        }
      );
    }

    // Generate AI Summary
    const normalizedTask = {
      name: task.name,
      notes: task.notes || "",
    };
    const aiSummary = await generateTaskSummary(normalizedTask);
    const aiPriority = task.priority ? null : await detectPriority(normalizedTask);
    const priority = normalizePriority(task.priority || aiPriority);

    const enrichedTask = {
      ...task,
      priority,
      aiSummary,
    };

    await saveTaskRecord({
      event: {
        action: "detail_fetch",
        resource: { gid: task.gid, resource_type: "task", name: task.name },
        source: "api",
      },
      task: enrichedTask,
      ai: {
        priority,
        summary: aiSummary,
      },
      receivedAt: new Date().toISOString(),
    }).catch((saveError) => {
      console.error(`Unable to persist task detail ${taskId}:`, saveError);
    });

    return NextResponse.json({
      success: true,
      task: enrichedTask,
    });
  } catch (error) {
    console.error("Task detail error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unable to load task detail",
      },
      {
        status: 500,
      }
    );
  }
}
