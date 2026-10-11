import { generateText, Output } from "ai";
import { SPECIALIST_IDS, WORKERS } from "./registry";
import { routingSchema } from "./schemas";
import type { RuntimeRequest } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.2";

export async function routeRequest(request: RuntimeRequest) {
  if (request.requestedWorkerIds?.length) {
    const allowed = request.requestedWorkerIds.filter((id) => id !== "qa-brand-risk");
    if (!allowed.length) {
      throw new Error("At least one non-QA specialist is required.");
    }
    return {
      primaryWorkerId: allowed[0],
      supportWorkerIds: allowed.slice(1, 5),
      rationale: "Explicit worker selection supplied by AI CMO or CEO.",
      qaRequired:
        request.importance !== "standard" ||
        ["production", "review"].includes(request.stage),
      ceoDecisionRequired: request.importance === "sensitive",
      missingInputs: [] as string[]
    };
  }

  const catalog = SPECIALIST_IDS
    .map((id) => `${id}: ${WORKERS[id].mission}`)
    .join("\n");

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: routingSchema }),
    system:
      "You are the AI CMO routing layer for ICB Labs. Select the minimum necessary specialists, exactly one primary owner and no more than four support roles. QA is separate and must not be selected as a production specialist. Keep strategy, evidence, QA and CEO approvals distinct.",
    prompt: `Specialists:\n${catalog}\n\nRequest:\n${JSON.stringify(request, null, 2)}`
  });

  if (!output) throw new Error("Routing returned no output.");

  return {
    ...output,
    supportWorkerIds: output.supportWorkerIds
      .filter((id) => id !== "qa-brand-risk" && id !== output.primaryWorkerId)
      .slice(0, 4)
  };
}
