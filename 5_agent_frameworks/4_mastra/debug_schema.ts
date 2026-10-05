// Verify the wrapped schema coerces numeric strings before validation.
import { makeFilesystem, listFilesystemTools } from "./tools.ts";

const fs = makeFilesystem();
const raw = await fs.listTools();
const wrapped = await listFilesystemTools(fs);

console.log("tools handed to the agent:", Object.keys(wrapped).join(", "));

const read = (wrapped as any).filesystem_read_text_file;
const std = read.inputSchema["~standard"];

const asStrings = std.validate({ path: "notes.txt", head: "1", tail: "1" });
console.log('validate({head:"1"}) ->', JSON.stringify(asStrings).slice(0, 160));

const asNumbers = std.validate({ path: "notes.txt", head: 1, tail: 1 });
console.log("validate({head:1})   ->", JSON.stringify(asNumbers).slice(0, 160));

// A genuinely wrong argument must still be rejected by the server's own rules.
const bad = std.validate({ path: 123 });
console.log("validate({path:123}) ->", JSON.stringify(bad).slice(0, 160));

// And the real call still executes against the MCP server.
const out = await read.execute({ path: "notes.txt", head: "2" } as any, { toolCallId: "t", messages: [] } as any);
console.log("execute({head:'2'}) ->", JSON.stringify(out).slice(0, 220));

await fs.disconnect();
process.exit(0);