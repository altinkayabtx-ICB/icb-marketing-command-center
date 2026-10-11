import { WORKERS } from "../lib/registry";

export default async function handler(_req: any, res: any) {
  res.status(200).json({
    ok: true,
    service: "ICB Marketing Command Center — Real Worker Runtime",
    version: "2.0.0",
    architecture: "AI CMO -> specialist worker(s) -> independent QA -> AI CMO synthesis",
    specialistWorkers: Object.keys(WORKERS).length - 1,
    qaWorkers: 1,
    totalWorkers: Object.keys(WORKERS).length,
    model: process.env.ICB_RUNTIME_MODEL || "openai/gpt-5.6-sol",
    externalActionsEnabled: false,
    timestamp: new Date().toISOString()
  });
}
