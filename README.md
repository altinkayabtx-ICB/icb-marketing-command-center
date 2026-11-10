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
- `POST /api/run` fails closed unless `ICB_RUN_TOKEN` is configured and the caller presents that secret.
- Authenticated runs are rate limited in memory on each server instance.

## Endpoints

- `GET /api/health` — runtime metadata and worker count. Does not call the model.
- `POST /api/run` — run one orchestration job. Requires authentication.

### Authentication

`POST /api/run` authorizes callers with a shared secret. That secret is not a model-provider key.

Set `ICB_RUN_TOKEN` on the server. Send it on every run request:

```http
Authorization: Bearer <ICB_RUN_TOKEN>
```

This repository has no browser client. Call the endpoint from a server-side caller that reads `ICB_RUN_TOKEN` from its own environment. Do not put `ICB_RUN_TOKEN`, or any model provider key, in browser code. The runtime calls the model on the server. On Vercel, AI Gateway can authenticate with deployment OIDC, so a provider key is not required in the client.

Use one long random token and do not include spaces. If `ICB_RUN_TOKEN` is missing or blank, every `POST /api/run` request is rejected and the model is not called. A missing header, a malformed `Authorization` value, and a token that does not match all receive `401` and `{ "error": "Unauthorized" }`. The body does not reveal whether the server secret is set. The presented token and the configured secret are compared in constant time. Repeated authentication failures use the same numeric limit and then receive `429` without calling the model.

Example:

```bash
curl -sS -X POST "https://<deployment-host>/api/run" \
  -H "Authorization: Bearer $ICB_RUN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<'JSON'
{
  "project": "ICB Marketing Department V2",
  "objective": "Audit whether the worker routing and QA path execute correctly.",
  "stage": "research",
  "strategyStatus": "active",
  "importance": "important",
  "context": "Architecture-only smoke test. Do not create or publish campaign material.",
  "autoCorrect": true
}
JSON
```

The response includes a `jobId`, routing decision, individual worker execution records, QA result, final CMO synthesis and timing trace.

### Rate limiting

Authenticated runs, and repeated authentication failures, each pass through a fixed-window limiter stored in process memory and keyed by client address (`x-forwarded-for`, otherwise the socket address). The two counters are separate, so bad credentials do not spend the budget of a valid caller. Vercel Functions do not share memory across instances, and this repository has no shared store, so each instance keeps its own counters and drops them when the instance is recycled. Treat the limiter as a baseline spend guard, not a global quota.

Defaults are 10 requests per 60000 ms for each client address. The same window also caps the whole instance at 10 times that client limit, so rotating the forwarded address cannot multiply spend on one instance. Override the client limit and window with `ICB_RUN_RATE_LIMIT` and `ICB_RUN_RATE_WINDOW_MS` (positive integers). Invalid values keep the defaults. A request over the limit receives `429`, a `Retry-After` header, and does not call the model.

## Environment variables

Names only. Set values in the host environment, never in git. Empty placeholders are listed in `.env.example`.

- `ICB_RUN_TOKEN` — required shared secret for `POST /api/run`.
- `ICB_RUN_RATE_LIMIT` — optional per-client request cap inside each window on one instance.
- `ICB_RUN_RATE_WINDOW_MS` — optional window length in milliseconds.
- `ICB_RUNTIME_MODEL` — optional server-side model id used by the runtime.

## Deployment

Designed for Vercel Functions and Vercel AI Gateway. On Vercel, AI Gateway can use deployment OIDC authentication without committing an API key. The default model is configurable with `ICB_RUNTIME_MODEL`. `ICB_RUN_TOKEN` is independent of that provider authentication and must be set in the server environment.

## Current scope

This is the real **worker orchestration runtime**. External marketing tool adapters (Semrush, Metricool, HubSpot, Airtable, Asana, etc.) remain separate integrations and must be wired with explicit credentials/authorization before workers can execute those systems autonomously.
