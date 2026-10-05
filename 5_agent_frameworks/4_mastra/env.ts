/**
 * Load the repo-root .env, the same one the Python days use.
 *
 * Node's dotenv only looks in the current directory, but the course keeps a
 * single .env at the repo root and runs each day from its own folder. So we
 * search upward from the working directory for the nearest .env and load it,
 * the same thing Python's load_dotenv does. Import this first from any script
 * that talks to a model: import "../env.ts".
 */

import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function findEnv(start = process.cwd()): string | undefined {
  let dir = start;
  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

config({ path: findEnv(), override: true, quiet: true });

// No .env, or no endpoint in it: run against the local Ollama server instead,
// which costs nothing and needs no key. Ollama speaks the OpenAI chat-completions
// shape, so everything above this line works unchanged.
if (!process.env.OPENAI_BASE_URL && !process.env.OPENAI_API_KEY) {
  process.env.OPENAI_BASE_URL = "http://localhost:11434/v1";
  process.env.OPENAI_API_KEY = "ollama";
}

// The default local model is deliberately a small one. llama3.2 is 2GB and
// answers in seconds on CPU, which keeps the day usable with no budget. Bigger
// local models handle the agent loop better but want a GPU and a lot of RAM:
// gpt-oss:20b is 12.8GB and took ~4.5 minutes for a single call on an 8-core
// CPU-only laptop. Set WORKER_MODEL in your .env to trade speed for quality.
if (!process.env.WORKER_MODEL) {
  process.env.WORKER_MODEL = "llama3.2:latest";
}
