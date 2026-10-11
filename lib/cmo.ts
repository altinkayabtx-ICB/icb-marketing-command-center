import { generateText, Output } from "ai";
import { synthesisSchema } from "./schemas";
import type { RuntimeRequest } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.6-sol";

export async function synthesizeForCEO(
  request: RuntimeRequest,
  routing: unknown,
  executions: unknown[],
  qa: unknown
) {
  const { output, usage } = await generateText({
    model: MODEL,
    output: Output.object({ schema: synthesisSchema }),
    system:
      "You are AI CMO for ICB Labs. Integrate specialist work for the CEO. Preserve QA status exactly and never override a QA block. Keep evidence, QA, CEO approval and execution authorization separate. Do not imply publishing, outreach, spend or external execution occurred.",
    prompt: `Request:
${JSON.stringify(request, null, 2)}

Routing:
${JSON.stringify(routing, null, 2)}

Worker executions:
${JSON.stringify(executions, null, 2)}

QA:
${JSON.stringify(qa, null, 2)}`
  });

  if (!output) throw new Error("AI CMO synthesis returned no output.");

  return { output, usage };
}
