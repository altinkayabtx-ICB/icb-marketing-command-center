# ICB Marketing Command Center — Real Worker Runtime

Execution Layer V2 for the ICB AI Marketing Department.

This repository turns the approved department architecture into a callable runtime. It does **not** treat role prompts or separate ChatGPT chats as autonomous workers. A worker is counted as executed only when the runtime performs an actual model invocation and returns an observable result.

## Runtime flow

CEO / AI CMO request
→ deterministic stage gate
→ AI CMO routing invocation
→ support worker invocation(s)
→ primary specialist invocation
→ independent QA invocation
→ optional correction + QA re-review
→ AI CMO synthesis
→ observable execution trace

## Controls preserved

- Strategy precedes production.
- The router selects the minimum necessary specialists; it does not broadcast every job to all 17 roles.
- QA has independent blocking authority.
- AI CMO cannot override a QA block.
- CEO approval, evidence status, QA status and execution authorization remain separate.
- No publishing, spend, outreach, CRM mutation or external action is implied by a worker run.
- Dynamic facts must be verified outside the runtime or marked unavailable.
- No secrets are committed to this repository.

## Endpoints

- `GET /api/health` — runtime metadata and worker count.
- `POST /api/run` — run one orchestration job.

Example:

```json
{
  "project": "ICB Marketing Department V2",
  "objective": "Audit whether the worker routing and QA path execute correctly.",
  "stage": "research",
  "strategyStatus": "active",
  "importance": "important",
  "context": "Architecture-only smoke test. Do not create or publish campaign material.",
  "autoCorrect": true
}
```

The response includes a `jobId`, routing decision, individual worker execution records, QA result, final CMO synthesis and timing trace.

## Deployment

Designed for Vercel Functions and Vercel AI Gateway. On Vercel, AI Gateway can use deployment OIDC authentication without committing an API key. The default model is configurable with `ICB_RUNTIME_MODEL`.

## Current scope

This is the real **worker orchestration runtime**. External marketing tool adapters (Semrush, Metricool, HubSpot, Airtable, Asana, etc.) remain separate integrations and must be wired with explicit credentials/authorization before workers can execute those systems autonomously.
