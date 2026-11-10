import { z } from "zod";
import { WORKER_IDS } from "../lib/types";
import { runJob } from "../lib/runtime";
import { authorizeRunRequest } from "../lib/auth";
import { clientRateLimitKey, consumeRateLimit } from "../lib/rate-limit";

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

function unauthorized(res: any) {
  res.setHeader("WWW-Authenticate", "Bearer");
  res.setHeader("Cache-Control", "no-store");
  return res.status(401).json({ error: "Unauthorized" });
}

function rateLimitOrReject(req: any, res: any, scope: "run" | "auth") {
  try {
    const limit = consumeRateLimit(clientRateLimitKey(req), scope);
    if (!limit.allowed) {
      res.setHeader("Retry-After", String(limit.retryAfterSeconds));
      return res.status(429).json({ error: "Too many requests" });
    }
    return null;
  } catch {
    console.error(
      JSON.stringify({
        type: "icb-runtime-rate-limit",
        message: "rate limit check failed closed"
      })
    );
    return res.status(503).json({ error: "Runtime unavailable" });
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  let authorized = false;
  try {
    authorized = authorizeRunRequest(req);
  } catch {
    console.error(
      JSON.stringify({
        type: "icb-runtime-auth",
        message: "authorization check failed closed"
      })
    );
    authorized = false;
  }

  if (!authorized) {
    const decision = rateLimitOrReject(req, res, "auth");
    if (decision) return decision;
    return unauthorized(res);
  }

  const decision = rateLimitOrReject(req, res, "run");
  if (decision) return decision;

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
