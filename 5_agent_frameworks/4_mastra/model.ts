import "./env.ts";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const apiKey = process.env.OPENAI_API_KEY ?? "ollama";

export function makeModel(modelName = process.env.WORKER_MODEL ?? "gpt-oss:20b") {
  if (baseURL.includes("localhost:11434") || baseURL.includes("127.0.0.1:11434")) {
    return createOpenAICompatible({
      name: "ollama",
      baseURL,
      apiKey,
    })(modelName);
  }

  return createOpenAI({
    baseURL,
    apiKey,
  })(modelName);
}
