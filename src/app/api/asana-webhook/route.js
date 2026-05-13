import { NextResponse } from "next/server";
import { generateTaskSummary } from "../../../services/aiSummary";
import { getTaskDetails } from "../../../services/asana";
import { detectPriority } from "../../../services/aiPriority";
import { saveTaskRecord } from "../../../services/taskStore";
import { sendSlackNotification } from "../../../services/slack";
import { normalizePriority } from "../../../services/priority";

function createTaskRecord(task, priority, aiSummary, event) {
  return {
    event,
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

export async function POST(req) {
  const hookSecret = req.headers.get("x-hook-secret");

  if (hookSecret) {
    return new NextResponse("Webhook verified", {
      status: 200,
      headers: {
        "X-Hook-Secret": hookSecret,
      },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const events = Array.isArray(body.events) ? body.events : [];

  if (!events.length) {
    return NextResponse.json(
      { success: false, error: "No webhook events provided." },
      { status: 400 }
    );
  }

  const results = [];

  for (const event of events) {
    const resource = event?.resource;
    const taskId = resource?.gid;

    if (!taskId || resource?.resource_type !== "task") {
      continue;
    }

    let taskData = {
      gid: taskId,
      name: resource.name || "Unnamed task",
      notes: "",
      completed: false,
    };

    try {
      const taskResponse = await getTaskDetails(taskId);
      if (taskResponse) {
        taskData = taskResponse;
      }
    } catch (error) {
      console.error("Asana task details error:", error);
    }

    const aiSummary = await generateTaskSummary({
      name: taskData.name,
      notes: taskData.notes || "",
    });

    const aiPriority = taskData.priority ? null : await detectPriority({
      name: taskData.name,
      notes: taskData.notes || "",
    });
    const priority = normalizePriority(taskData.priority || aiPriority);

    const record = createTaskRecord(taskData, priority, aiSummary, {
      ...event,
      source: "webhook",
    });

    const saved = await saveTaskRecord(record).catch((error) => {
      console.error("Task persistence error:", error);
      return null;
    });

    const slackMessage = `
      *Asana Task Updated*

      *Task:* ${taskData.name}

      *Priority:* ${priority}

      *AI Summary:* ${aiSummary}

      *Status:* ${taskData.completed ? "Completed" : "Open"}
      `;
    const slackResult = await sendSlackNotification(slackMessage).catch((error) => {
      console.error("Slack notification error:", error);
      return null;
    });

    results.push({
      taskId,
      action: event.action || null,
      priority,
      saved: Boolean(saved),
      slackSent: Boolean(slackResult),
    });
  }

  return NextResponse.json({
    success: true,
    processedEvents: results.length,
    results,
  });
}
