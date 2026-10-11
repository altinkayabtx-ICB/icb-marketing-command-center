import { generateText, Output } from "ai";
import { COMMON_RULES, WORKERS } from "./registry";
import { qaSchema } from "./schemas";
import type { RuntimeRequest } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.6-sol";

export async function invokeQA(
  request: RuntimeRequest,
  routing: unknown,
  executions: unknown[]
) {
  const qa = WORKERS["qa-brand-risk"];

  const { output, usage } = await generateText({
    model: MODEL,
    output: Output.object({ schema: qaSchema }),
    system: `${COMMON_RULES}

ROLE: ${qa.name}
MISSION: ${qa.mission}
BOUNDARY: ${qa.boundaries}

Act as an independent release gate. AI CMO cannot override a QA block.
CEO approval does not replace evidence, QA, legal or domain review.
NEEDS_REVISION and BLOCKED_VERIFICATION_REQUIRED must have releaseAllowed=false.`,
    prompt: `Review this exact work package.

Request:
${JSON.stringify(request, null, 2)}

Routing:
${JSON.stringify(routing, null, 2)}

Worker executions:
${JSON.stringify(executions, null, 2)}`
  });

  if (!output) throw new Error("QA returned no output.");

  if (
    output.status === "NEEDS_REVISION" ||
    output.status === "BLOCKED_VERIFICATION_REQUIRED"
  ) {
    output.releaseAllowed = false;
  }

  return {
    workerId: "qa-brand-risk" as const,
    workerName: qa.name,
    output,
    usage
  };
}
