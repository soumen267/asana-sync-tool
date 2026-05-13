import { generateText, getAIProvider } from "./aiProvider.js";

function fallbackAnalysis() {
  return {
    priority: "LOW",
    summary: "Fallback analysis.",
    category: "General",
    risk: "LOW",
    suggestedAction: "Review manually.",
  };
}

export async function detectPriority(task = {}) {
  const title = task.name || "";
  const notes = task.notes || "";

  try {
    const prompt = `
You are an AI project manager.

Analyze this task.

Task Title:
${title}

Task Notes:
${notes}

Return ONLY valid JSON.

{
  "priority": "HIGH",
  "summary": "professional short summary",
  "category": "Bug / Feature / QA / Client Request",
  "risk": "LOW / MEDIUM / HIGH",
  "suggestedAction": "best next action"
}
`;

    const raw = await generateText(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error(`${getAIProvider().toUpperCase()} priority error:`, error);
    return fallbackAnalysis();
  }
}
