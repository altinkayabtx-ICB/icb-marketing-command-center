import { generateText, Output } from "ai";
import { z } from "zod";
import { WORKERS, SPECIALIST_IDS } from "./registry";
import { WORKER_IDS, type RuntimeRequest } from "./types";

const MODEL = process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.6-sol";

export async function runJob(request: RuntimeRequest) {
  return {
    ok: true,
    project: request.project,
    objective: request.objective,
    model: MODEL,
    workerCount: SPECIALIST_IDS.length,
    qaWorker: WORKERS["qa-brand-risk"].name
  };
}
