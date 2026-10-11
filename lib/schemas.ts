import { z } from "zod";
import { WORKER_IDS } from "./types";

export const routingSchema = z.object({
  primaryWorkerId: z.enum(WORKER_IDS).refine((v) => v !== "qa-brand-risk"),
  supportWorkerIds: z.array(z.enum(WORKER_IDS)).max(4),
  rationale: z.string(),
  qaRequired: z.boolean(),
  ceoDecisionRequired: z.boolean(),
  missingInputs: z.array(z.string())
});

export const claimSchema = z.object({
  text: z.string(),
  evidenceStatus: z.enum([
    "VERIFIED",
    "APPROVED_INTERNAL",
    "DYNAMIC_REQUIRES_LIVE_CHECK",
    "DRAFT",
    "UNVERIFIED",
    "NOT_APPLICABLE"
  ])
});

export const workerSchema = z.object({
  status: z.enum(["COMPLETED", "NEEDS_INPUT", "BLOCKED"]),
  deliverable: z.string(),
  findings: z.array(z.string()),
  claims: z.array(claimSchema),
  missingInformation: z.array(z.string()),
  handoffNotes: z.string()
});

export const qaSchema = z.object({
  status: z.enum([
    "APPROVED",
    "APPROVED_WITH_MINOR_CHANGES",
    "NEEDS_REVISION",
    "BLOCKED_VERIFICATION_REQUIRED"
  ]),
  releaseAllowed: z.boolean(),
  requiredCorrections: z.array(z.string()),
  evidenceIssues: z.array(z.string()),
  approvalIssues: z.array(z.string()),
  riskNotes: z.array(z.string())
});

export const synthesisSchema = z.object({
  status: z.enum(["READY", "CONDITIONAL", "BLOCKED", "NEEDS_INPUT"]),
  executiveSummary: z.string(),
  decisionsRequired: z.array(z.string()),
  nextActions: z.array(z.string()),
  qaStatus: z.string()
});
