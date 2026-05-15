import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3:latest";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-lite";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY.");
  }

  return new GoogleGenerativeAI(apiKey);
}

export function getAIProvider() {
  return (process.env.AI_PROVIDER || "ollama")
    .trim()
    .toLowerCase();
}

export async function generateText(prompt) {
  const provider = getAIProvider();

  // Try Gemini first
  if (provider === "gemini") {
    try {
      console.log("Using Gemini...");

      const modelName =
        process.env.GEMINI_MODEL ||
        DEFAULT_GEMINI_MODEL;

      const genAI = getGeminiClient();

      const model = genAI.getGenerativeModel({
        model: modelName,
      });

      const result =
        await model.generateContent(prompt);

      return result.response.text().trim();

    } catch (error) {

      console.error("Gemini Error:", error);

      console.log(
        "Gemini failed. Falling back to Ollama..."
      );
    }
  }

  // Ollama fallback
  try {

    console.log("Using Ollama...");

    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL ||
      DEFAULT_OLLAMA_URL;

    const ollamaModel =
      process.env.OLLAMA_MODEL ||
      DEFAULT_OLLAMA_MODEL;

    const response = await fetch(
      `${ollamaBaseUrl}/api/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: ollamaModel,
          prompt,
          stream: false,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error ||
        `Ollama request failed with status ${response.status}`
      );
    }

    if (data.error) {
      throw new Error(data.error);
    }

    return data.response?.trim() || "";

  } catch (error) {

    console.error("Ollama Error:", error);

    return "AI summary unavailable";
  }
}