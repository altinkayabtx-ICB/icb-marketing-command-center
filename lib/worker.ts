import { generateText, Output } from "ai";
import { COMMON_RULES, WORKERS } from "./registry";
import { workerSchema } from "./schemas";
import type { RuntimeRequest, WorkerId } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.6-sol";

export async function invokeWorker(
  workerId: WorkerId,
  request: RuntimeRequest,
  supportOutputs: unknown[] = [],
  correctionContext?: unknown
) {
  const worker = WORKERS[workerId];

  const { output, usage } = await generateText({
    model: MODEL,
    output: Output.object({ schema: workerSchema }),
    system: `${COMMON_RULES}

ROLE: ${worker.name}
MISSION: ${worker.mission}
BOUNDARY: ${worker.boundaries}`,
    prompt: `Assignment:
${JSON.stringify(request, null, 2)}

Upstream specialist outputs:
${JSON.stringify(supportOutputs, null, 2)}

Correction context:
${JSON.stringify(correctionContext ?? null, null, 2)}

Stay inside your role. Mark unsupported facts with the correct evidence status. If material input is missing, return NEEDS_INPUT instead of inventing it.`
  });

  if (!output) throw new Error(`${workerId} returned no output.`);

  return {
    workerId,
    workerName: worker.name,
    output,
    usage
  };
}
