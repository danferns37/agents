import "./env.ts";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const baseURL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const apiKey = process.env.OPENAI_API_KEY ?? "ollama";

/**
 * Mastra types the model as the AI SDK's LanguageModelV3, while the installed
 * AI SDK providers return V3 | V4. The two speak the same wire format, so the
 * union is narrowed once here rather than at each of the day's call sites.
 */
type MastraModel = ReturnType<ReturnType<typeof createOpenAI>>;

export function makeModel(modelName = process.env.WORKER_MODEL ?? "llama3.2:latest"): MastraModel {
  if (baseURL.includes("localhost:11434") || baseURL.includes("127.0.0.1:11434")) {
    return createOpenAICompatible({
      name: "ollama",
      baseURL,
      apiKey,
    })(modelName) as unknown as MastraModel;
  }

  return createOpenAI({
    baseURL,
    apiKey,
  })(modelName) as MastraModel;
}
