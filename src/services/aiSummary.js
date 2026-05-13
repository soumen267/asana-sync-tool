import { generateText, getAIProvider } from "./aiProvider.js";

export async function generateTaskSummary(task) {
  try {
    const prompt = `
    You are a senior technical project manager analyzing an Asana task.

      Use ONLY the provided task information.
      Do NOT invent fake deadlines, assignees, blockers, or projects.

      Generate concise and actionable output.

      Prioritize concrete technical actions over generic recommendations.

      For "Suggested Next Action":
      - infer the most logical technical/business next step
      - avoid repeating the task description
      - be specific when possible

      Return EXACTLY in this format:

      Summary:
      <short summary>

      Priority:
      <LOW | MEDIUM | HIGH>

      Suggested Next Action:
      <specific next step>

    Task:
    ${task.name}

    Notes:
    ${task.notes || "No notes"}
    `;

    const text = await generateText(prompt);

    return text || "No AI response.";
  } catch (error) {
    console.error(`${getAIProvider().toUpperCase()} summary error:`, error);

    return "Unable to generate AI summary.";
  }
}
