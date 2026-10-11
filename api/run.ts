import { z } from "zod";
import { WORKER_IDS } from "../lib/types";
import { runJob } from "../lib/runtime";

const requestSchema = z.object({
  project: z.string().min(1).max(200),
  objective: z.string().min(3).max(5000),
  stage: z.enum([
    "research",
    "strategy",
    "production",
    "review",
    "operations",
    "measurement"
  ]),
  strategyStatus: z
    .enum([
      "draft",
      "under_review",
      "ceo_approved",
      "active",
      "paused",
      "archived",
      "unknown"
    ])
    .optional(),
  importance: z
    .enum(["standard", "important", "sensitive"])
    .default("important"),
  context: z.string().max(30000).optional(),
  requestedWorkerIds: z.array(z.enum(WORKER_IDS)).max(5).optional(),
  autoCorrect: z.boolean().default(true)
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parsed = requestSchema.parse(req.body);
    const result = await runJob(parsed);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error(
      JSON.stringify({
        type: "icb-runtime-error",
        message: error?.message || String(error),
        stack: error?.stack
      })
    );

    if (error?.issues) {
      return res.status(400).json({
        error: "Invalid request",
        issues: error.issues
      });
    }

    return res.status(500).json({
      error: "Runtime execution failed",
      message: error?.message || String(error)
    });
  }
}
