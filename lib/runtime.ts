import { routeRequest } from "./router";
import { invokeWorker } from "./worker";
import { invokeQA } from "./qa";
import { synthesizeForCEO } from "./cmo";
import type { RuntimeRequest, TraceEvent, WorkerId } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.2";

function now() {
  return new Date().toISOString();
}

function addTrace(
  events: TraceEvent[],
  event: string,
  workerId?: string,
  detail?: string
) {
  const entry = { at: now(), event, workerId, detail };
  events.push(entry);
  console.log(JSON.stringify({ type: "icb-runtime", ...entry }));
}

function productionGate(request: RuntimeRequest) {
  if (request.stage !== "production") return null;

  if (!["ceo_approved", "active"].includes(request.strategyStatus || "unknown")) {
    return "Production blocked: a sufficiently clear CEO-approved or ACTIVE project strategy is required.";
  }

  return null;
}

export async function runJob(request: RuntimeRequest) {
  const jobId = crypto.randomUUID();
  const trace: TraceEvent[] = [];
  const startedAt = Date.now();

  addTrace(trace, "JOB_ACCEPTED", undefined, jobId);

  const gate = productionGate(request);
  if (gate) {
    addTrace(trace, "STAGE_GATE_BLOCKED", undefined, gate);
    return {
      jobId,
      status: "BLOCKED",
      gate: { status: "BLOCKED", reason: gate },
      trace,
      durationMs: Date.now() - startedAt
    };
  }

  addTrace(trace, "ROUTING_STARTED");
  const routing = await routeRequest(request);
  addTrace(
    trace,
    "ROUTING_COMPLETED",
    routing.primaryWorkerId,
    routing.rationale
  );

  const supportIds = routing.supportWorkerIds as WorkerId[];
  const supportExecutions = await Promise.all(
    supportIds.map(async (id) => {
      addTrace(trace, "WORKER_STARTED", id);
      const result = await invokeWorker(id, request);
      addTrace(trace, "WORKER_COMPLETED", id, result.output.status);
      return result;
    })
  );

  const primaryId = routing.primaryWorkerId as WorkerId;
  addTrace(trace, "PRIMARY_STARTED", primaryId);
  let primary = await invokeWorker(primaryId, request, supportExecutions);
  addTrace(trace, "PRIMARY_COMPLETED", primaryId, primary.output.status);

  let executions: unknown[] = [...supportExecutions, primary];
  let qaResult: Awaited<ReturnType<typeof invokeQA>> | null = null;

  const qaRequired =
    routing.qaRequired ||
    request.importance === "important" ||
    request.importance === "sensitive";

  if (qaRequired) {
    addTrace(trace, "QA_STARTED", "qa-brand-risk");
    qaResult = await invokeQA(request, routing, executions);
    addTrace(trace, "QA_COMPLETED", "qa-brand-risk", qaResult.output.status);

    if (
      request.autoCorrect !== false &&
      qaResult.output.status === "NEEDS_REVISION"
    ) {
      addTrace(trace, "CORRECTION_STARTED", primaryId);
      primary = await invokeWorker(
        primaryId,
        request,
        supportExecutions,
        qaResult.output
      );
      addTrace(trace, "CORRECTION_COMPLETED", primaryId, primary.output.status);
      executions = [...supportExecutions, primary];

      addTrace(trace, "QA_REREVIEW_STARTED", "qa-brand-risk");
      qaResult = await invokeQA(request, routing, executions);
      addTrace(
        trace,
        "QA_REREVIEW_COMPLETED",
        "qa-brand-risk",
        qaResult.output.status
      );
    }
  }

  addTrace(trace, "CMO_SYNTHESIS_STARTED");
  const cmo = await synthesizeForCEO(request, routing, executions, qaResult);
  addTrace(trace, "CMO_SYNTHESIS_COMPLETED", undefined, cmo.output.status);

  const status =
    qaResult?.output.status === "BLOCKED_VERIFICATION_REQUIRED"
      ? "BLOCKED"
      : qaResult?.output.status === "NEEDS_REVISION"
        ? "NEEDS_REVISION"
        : cmo.output.status;

  addTrace(trace, "JOB_COMPLETED", undefined, status);

  return {
    jobId,
    status,
    model: MODEL,
    routing,
    executions,
    qa: qaResult,
    cmo,
    trace,
    durationMs: Date.now() - startedAt
  };
}
