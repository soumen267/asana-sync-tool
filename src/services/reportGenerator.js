import { jsPDF } from "jspdf";
import { OpenAI } from "openai";
import { normalizePriority } from "./priority";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function wrapText(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line) => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function formatPriorityBreakdown(tasks = []) {
  return tasks.reduce((breakdown, task) => {
    const key = normalizePriority(task.priority) || "LOW";
    breakdown[key] = (breakdown[key] || 0) + 1;
    return breakdown;
  }, {});
}

function formatDate(input) {
  const date = input ? new Date(input) : new Date();
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function generateAiSummary(tasks = []) {
  if (!openai || !tasks.length) {
    const completed = tasks.filter((task) => task.completed).length;
    const pending = tasks.length - completed;
    return `This week there were ${tasks.length} tasks, with ${completed} completed and ${pending} still pending.`;
  }

  const taskLines = tasks
    .slice(0, 10)
    .map((task) => `- ${task.name || task.title || "Untitled task"} (${task.completed ? "complete" : "open"})`)
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional report writer. Summarize the task list into a concise weekly update.",
        },
        {
          role: "user",
          content: `Summarize the following tasks in a short professional paragraph:\n${taskLines}`,
        },
      ],
      max_tokens: 120,
    });

    const text = response?.choices?.[0]?.message?.content?.trim();
    if (text) {
      return text;
    }
  } catch (error) {
    console.error("AI report summary failed:", error);
  }

  return `This week there were ${tasks.length} tasks handled, including completed and pending work.`;
}

export async function generateWeeklyReportPdf({
  tasks = [],
  title = "Weekly Task Summary",
  summary,
  reportDate = new Date(),
} = {}) {
  const completedTasks = tasks.filter((task) => task.completed);
  const pendingTasks = tasks.filter((task) => !task.completed);
  const breakdown = formatPriorityBreakdown(tasks);
  const effectiveSummary = summary || (await generateAiSummary(tasks));

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.width;
  const margin = 40;
  const maxTextWidth = pageWidth - margin * 2;
  let y = 60;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, y);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${formatDate(reportDate)}`, margin, y + 22);
  y += 42;

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Executive Summary", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  y = wrapText(doc, effectiveSummary, margin, y, maxTextWidth, 16);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.text("Key Metrics", margin, y);
  y += 18;

  const metricLines = [
    `Total tasks: ${tasks.length}`,
    `Completed tasks: ${completedTasks.length}`,
    `Pending tasks: ${pendingTasks.length}`,
    `Priority breakdown: ${Object.entries(breakdown)
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ")}`,
  ];

  doc.setFont("helvetica", "normal");
  metricLines.forEach((line) => {
    doc.text(line, margin, y);
    y += 16;
  });
  y += 16;

  doc.setFont("helvetica", "bold");
  doc.text("Task Overview", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");

  const rows = tasks.slice(0, 12).map((task) => ({
    name: task.name || task.title || "Untitled",
    status: task.completed ? "Completed" : "Open",
    priority: normalizePriority(task.priority) || "N/A",
    due: task.due_on || task.dueAt || task.due_date || "",
  }));

  rows.forEach((row) => {
    const rowText = `${row.name} | ${row.status} | ${row.priority} | ${row.due}`;
    y = wrapText(doc, rowText, margin, y, maxTextWidth, 14);
    y += 8;
    if (y > doc.internal.pageSize.height - 60) {
      doc.addPage();
      y = 60;
    }
  });

  const output = doc.output("arraybuffer");
  return Buffer.from(output);
}

export default {
  generateAiSummary,
  generateWeeklyReportPdf,
};
