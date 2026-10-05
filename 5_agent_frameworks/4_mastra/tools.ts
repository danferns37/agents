/**
 * The tools we give the agent: three small board tools and the filesystem MCP
 * server. These are the same three operations every framework gets this week,
 * here written the Mastra way with createTool and zod schemas. The step files
 * and the worker all import them from here, so the agent is given the same tools
 * everywhere.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createTool } from "@mastra/core/tools";
import { MCPClient } from "@mastra/mcp";
import { z } from "zod";
import { addStep, listTodos, completeTodo } from "./board.ts";

/** The one folder the filesystem server is allowed to touch. */
export const WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), "workspace");

export const showTodos = createTool({
  id: "show_todos",
  description: "List every todo on the board. A goal has parent_id null; a step has parent_id set to its goal's id.",
  inputSchema: z.object({}),
  execute: async () => ({ todos: listTodos() }),
});

export const planSteps = createTool({
  id: "plan_steps",
  description: "Break a goal into an ordered checklist of steps on the board. Pass the goal's id and a short list of step descriptions.",
  inputSchema: z.object({ goalId: z.number(), steps: z.array(z.string()) }),
  execute: async ({ goalId, steps }) => ({ goalId, stepIds: steps.map((s: string) => addStep(goalId, s)) }),
});

export const completeTask = createTool({
  id: "complete_task",
  description: "Mark a todo (a step or the goal) with this id as done and record a short result summary.",
  inputSchema: z.object({ taskId: z.number(), result: z.string() }),
  execute: async ({ taskId, result }) => {
    completeTodo(taskId, result);
    return { taskId, status: "done" };
  },
});

/** Attach to an agent with tools: { ...boardTools }. */
export const boardTools = { showTodos, planSteps, completeTask };

/**
 * The filesystem reference server, the same Node server every framework uses
 * this week, scoped to a single folder. Mastra exposes both fixes the day needs
 * as plain options on the stdio server: stderr "ignore" discards the server's
 * startup banner and lets it run from a Jupyter kernel on Windows, and cwd starts
 * the server in the workspace so the agent's relative file names resolve there.
 * No subclass and no monkeypatch, which makes this the cleanest MCP wiring of the
 * week. Open it with await mcp.listTools() and close it with await mcp.disconnect().
 */
export function makeFilesystem(dir = WORKSPACE): MCPClient {
  return new MCPClient({
    servers: {
      filesystem: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", dir],
        stderr: "ignore",
        cwd: dir,
      },
    },
  });
}

/**
 * The filesystem tools this day actually needs: read a file, write a file.
 *
 * The server advertises 14 tools, and picking between them is hard work for a
 * small local model. It also advertises a deprecated `read_file` next to a
 * near-identical `read_text_file`, which is exactly the sort of pair a small
 * model mixes up. Handing over the two tools the day uses keeps the prompt
 * small, the tool choice clean, and the CPU-only inference fast. Set
 * FILESYSTEM_TOOLS=all in your .env to hand over the full server instead.
 */
const DEFAULT_FILESYSTEM_TOOLS = ["filesystem_read_text_file", "filesystem_write_file"];

/**
 * Pull the filesystem tools off the MCP server, ready to hand to an agent.
 *
 * Two things happen here that make the day work on a free local model:
 *
 * 1. We keep only the tools named above, instead of all 14 the server offers.
 * 2. We wrap each one to repair numeric arguments. Local models routinely send
 *    `head: "1"` as a string where the schema says `number`, and the MCP server
 *    answers with a validation error the small model then cannot recover from.
 *    Coercing "1" to 1 before the call is the difference between a working
 *    agent loop and one that stalls on its first tool call.
 *
 * Everything the course cares about is unchanged: the tools are still the
 * filesystem server's, fetched over MCP, executed by the server. We just hand
 * over a subset and fix up their arguments.
 */
export async function listFilesystemTools(client: MCPClient): Promise<Record<string, any>> {
  const all = await client.listTools();
  const wanted =
    (process.env.FILESYSTEM_TOOLS ?? "").toLowerCase() === "all"
      ? Object.keys(all)
      : DEFAULT_FILESYSTEM_TOOLS;

  const tools: Record<string, any> = {};
  for (const id of wanted) {
    const tool = (all as Record<string, any>)[id];
    if (!tool) continue; // an older server build may not have it
    tools[id] = withCoercedNumbers(tool);
  }
  if (Object.keys(tools).length === 0) {
    throw new Error(
      `None of the requested filesystem tools were found. The server offered: ${Object.keys(all).join(", ")}`,
    );
  }
  return tools;
}

/**
 * Wrap one MCP tool so numeric arguments arrive as numbers.
 *
 * Mastra validates a tool's arguments against its inputSchema before execute()
 * ever runs, so coercing inside execute would be too late. The schema is a
 * standard-schema object, so we swap in a `~standard` whose validate() repairs
 * the numbers first and then defers to the server's own validation. A model that
 * writes "1" therefore behaves exactly like one that writes 1, and a genuinely
 * bad argument is still rejected by the server's own rules.
 */
function withCoercedNumbers(tool: any): any {
  const numberKeys = numberFields(tool.inputSchema);
  if (numberKeys.size === 0) return tool;

  const standard = tool.inputSchema?.["~standard"];
  const validate = standard?.validate;
  if (typeof validate !== "function") return tool;

  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      "~standard": {
        ...standard,
        validate: (value: unknown) => validate.call(standard, coerceNumbers(value, numberKeys)),
      },
    },
  };
}

/** Turn numeric strings into numbers for the given property names. */
function coerceNumbers(value: unknown, numberKeys: Set<string>): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  let changed = false;
  const fixed: Record<string, unknown> = { ...input };
  for (const key of numberKeys) {
    const item = fixed[key];
    if (typeof item === "string" && item.trim() !== "" && Number.isFinite(Number(item))) {
      fixed[key] = Number(item);
      changed = true;
    }
  }
  return changed ? fixed : value;
}

/** Collect the names of every property the schema declares as a number. */
function numberFields(schema: any): Set<string> {
  const keys = new Set<string>();
  let json: any;
  try {
    // JsonSchemaWrapper exposes getSchema(); a zod schema would use .shape.
    json = typeof schema?.getSchema === "function" ? schema.getSchema() : schema;
  } catch {
    return keys;
  }
  const properties = json?.properties;
  if (!properties || typeof properties !== "object") return keys;
  for (const [name, prop] of Object.entries(properties)) {
    const type = (prop as any)?.type;
    if (type === "number" || (Array.isArray(type) && type.includes("number"))) keys.add(name);
  }
  return keys;
}
