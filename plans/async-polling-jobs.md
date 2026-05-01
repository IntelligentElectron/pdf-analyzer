# Plan: Async/Polling Job Mode (Cloud Run only)

## Context

Claude Code's MCP client has a hardcoded ~60s response timeout that does **not** reset on `notifications/progress` ([anthropics/claude-code#20335](https://github.com/anthropics/claude-code/issues/20335)). When the server runs on Cloud Run and a large PDF takes more than ~2 min, every call fails, regardless of how we configure Cloud Run, the SDK, or progress pings.

The only viable shape is **submit + poll**: one tool kicks off the job and returns a `job_id` in <1s, a second tool reads the current status. The LLM in Claude Code orchestrates the polling between tool calls, so each individual round-trip stays well under the timeout.

Decisions:

| Decision | Choice |
| --- | --- |
| Job state store | **Firestore (Native mode)** |
| Compute model | **Cloud Tasks → Cloud Run worker endpoint** |
| Tool surface | **Two new tools, keep `analyze_pdf` as-is** |
| Scope | **HTTP/Cloud Run only** (stdio unchanged) |

`analyze_pdf` keeps working synchronously for short jobs and for stdio (local) usage. The new async tools are registered only when `mode === "http"`, so stdio binaries don't pay the dependency cost.

## Architecture

```
Claude Code (LLM)
   │
   │  1. tools/call analyze_pdf_async
   ▼
Cloud Run /mcp ──► Firestore (jobs/{id}: pending) ──► Cloud Tasks queue
   │                                                      │
   │  returns { job_id } in <1s                           │
   │                                                      │  OIDC-authenticated
   │  2. tools/call get_pdf_analysis_status (loop)        ▼
   ▼                                            Cloud Run POST /jobs/worker
Cloud Run /mcp ──► Firestore.read(jobs/{id})              │
   │                                                       │ runs existing analyzePdf()
   │  returns { status, result? }                          │
                                                Firestore.update(jobs/{id}: succeeded, result)
```

Why Cloud Tasks (vs. fire-and-forget after returning 200):

- Cloud Run **throttles CPU after the response is sent** unless `--cpu-throttling=false`. Detached promises are unreliable.
- Cloud Tasks gives us a real HTTP request for the worker, with its own 900s timeout window, automatic retries, and clean separation between "fast submit" and "slow work".
- No new service needed; the worker runs in the same Cloud Run container, just on a different route.

## Files to add / modify

### New module: `src/jobs/`

- **`src/jobs/types.ts`**: `Job`, `JobStatus = "pending" | "running" | "succeeded" | "failed"`, `JobRecord` shape stored in Firestore (includes `pdf_source`, `queries`, `provider_id`, `model_id`, `created_at`, `expires_at` for TTL, `result?`, `error?`).
- **`src/jobs/store.ts`**: thin Firestore wrapper. Lazy-import `@google-cloud/firestore` (mirrors how `@google-cloud/storage` is loaded in `service.ts:283`). Exports:
  - `createJob(input): Promise<{ job_id: string }>`
  - `getJob(id): Promise<Job | null>`
  - `markRunning(id)`, `markSucceeded(id, result)`, `markFailed(id, error)`, all idempotent (no-op if already in a terminal state)
- **`src/jobs/queue.ts`**: Cloud Tasks wrapper. Lazy-import `@google-cloud/tasks`. Exports `enqueueJob(jobId)` which creates a task targeting `${WORKER_URL}/jobs/worker` with the SA's OIDC token. Reads `JOB_QUEUE_NAME`, `JOB_WORKER_URL`, `GCP_PROJECT`, `GCP_REGION` from env.
- **`src/jobs/worker.ts`**: `runJob(jobId)`: read job → `markRunning` → call existing `analyzePdf()` (no changes there) → `markSucceeded` or `markFailed`. Idempotent: skip if status is already terminal (handles Cloud Tasks retries).

### `src/server.ts`: register two new tools (HTTP mode only)

In `createServer("http")`, after the existing `analyze_pdf` registration (line 180), register:

- **`analyze_pdf_async`**: same input schema as `analyze_pdf`. Description must explicitly tell the LLM:
  > "Use this for PDFs likely to exceed 60 seconds. Returns `{job_id}` in under a second. Then call `get_pdf_analysis_status` with that `job_id`. Wait 30s between polls."
  Implementation: `resolveActiveProvider()` (so we fail fast on bad config), then `createJob()` + `enqueueJob()`, return `{job_id}`.
- **`get_pdf_analysis_status`**: input `{ job_id: string }`. Returns `{status, result?, error?, created_at}`. Description tells the LLM to wait 30s between polls and stop when status is `succeeded` or `failed`.

Do **not** register these in `mode === "stdio"`.

### `src/transports/http.ts`: add worker endpoint

Add a route to `createRequestHandler` (after the `/analyze` block at line 79):

```
if (req.method === "POST" && req.url === "/jobs/worker") { ... }
```

It reads `{job_id}` from the body and calls `runJob(job_id)`. Cloud Run already enforces auth (`--no-allow-unauthenticated` + SA-only `run.invoker`), so no in-app token verification is needed. Returns `200 {ok: true}` on success, `500` on failure (Cloud Tasks will retry per the queue's retry policy).

### `package.json`

Add runtime deps (lazy-loaded, same pattern as `@google-cloud/storage`):

- `@google-cloud/firestore` ^7
- `@google-cloud/tasks` ^5

### `deploy/main.tf`

1. Enable APIs: add `firestore.googleapis.com` and `cloudtasks.googleapis.com` to the `for_each` set in `google_project_service.apis` (line 134).
2. Create a Firestore database (Native mode), one-time per project; idempotent via `google_firestore_database` with `lifecycle { prevent_destroy = true }` so re-applies don't try to delete.
3. Create Cloud Tasks queue: `google_cloud_tasks_queue.jobs` with conservative retry config (max 3 attempts, exponential backoff).
4. Grant SA additional roles:
   - `roles/datastore.user` (Firestore Native reads/writes)
   - `roles/cloudtasks.enqueuer` (create tasks)
   - `roles/run.invoker` on **its own** Cloud Run service (so Cloud Tasks can invoke `/jobs/worker` with the SA's OIDC token), `google_cloud_run_v2_service_iam_member`
   - `roles/iam.serviceAccountUser` on itself (required for Cloud Tasks to mint OIDC tokens)
5. Inject env vars on the Cloud Run service:
   - `JOB_QUEUE_NAME` = `projects/${project}/locations/${region}/queues/pdf-analyzer-jobs`
   - `JOB_WORKER_URL` = `${cloud_run_url}/jobs/worker`
   - `JOB_WORKER_SA` = `local.sa_email` (used as the OIDC token's service account)
   - `GCP_PROJECT`, `GCP_REGION`
6. Document the same wiring in `deploy/gcloud.sh` for the non-Terraform path.

### Firestore TTL

In the Firestore console (or via Terraform `google_firestore_field`): set a TTL policy on the `expires_at` field of the `jobs` collection (e.g., 24h from `created_at`). Prevents unbounded growth.

### Tests

- Extend `src/transports/http.test.ts` with a route test for `POST /jobs/worker` (mock `runJob`).
- New `src/jobs/worker.test.ts`: covers idempotency on retried calls and the success/failure state transitions, with `store.ts` and `analyzePdf` mocked.
- The Firestore client and Cloud Tasks client should be injectable for tests (constructor injection or a tiny factory), so we don't need an emulator in CI.

## Verification

1. **Stdio regression**: `bun run dev` against `test/fixtures/1-pager.pdf` via `analyze_pdf`. Confirm only `analyze_pdf` is registered in stdio mode (no async tools surfaced).
2. **Local HTTP regression**: `PORT=8080 bun src/index.ts`, hit `/mcp` with the existing `analyze_pdf` tool against `test/fixtures/1-pager.pdf`. Confirm the new tools are listed in the `tools/list` response.
3. **Deploy**: `cd deploy && terraform apply`. Verify Firestore database exists, Cloud Tasks queue exists, and the SA has the three new roles.
4. **Async happy path** via the Claude Code MCP client (through `gcloud run services proxy`):
   - Call `analyze_pdf_async` with a small fixture, confirm response in <2s and a valid `job_id`.
   - Immediately call `get_pdf_analysis_status`, expect `pending` or `running`.
   - Poll every 5s until `succeeded`; compare `result` to a synchronous `analyze_pdf` run on the same fixture. They should match.
5. **Long PDF**: same flow with a known >2-min PDF (with user approval; do **not** use `oversized-doc.pdf` without explicit OK per `pdf-analyzer/CLAUDE.md`). Confirm Claude Code does not time out and the final result is returned via the polling tool.
6. **Failure path**: submit with a bogus `pdf_source`. Worker should mark the job `failed` with an error message; `get_pdf_analysis_status` returns it cleanly without a 5xx.
7. **Idempotency**: manually re-invoke `/jobs/worker` for an already-`succeeded` job (curl through the proxy). Should be a no-op, not double-charge for LLM tokens.
8. **Cloud logs**: verify the submit request returns in <1s in `logName="run.googleapis.com%2Frequests"`, and the worker request shows a separate, longer-lived span.

## Critical files referenced

- `src/server.ts:120-183`: `createServer(mode)` and `analyze_pdf` registration (extend here)
- `src/transports/http.ts:61-93`: `createRequestHandler` (add `/jobs/worker` route)
- `src/service.ts:332-377`: `analyzePdf()` entry (no changes; the worker calls it as-is)
- `src/service.ts:283`: lazy-import pattern for `@google-cloud/storage` (mirror this for Firestore + Tasks)
- `src/providers/registry.ts`: `resolveActiveProvider()` (called by both submit and worker)
- `deploy/main.tf:133-145`: `google_project_service.apis` (add Firestore + Cloud Tasks)
- `deploy/main.tf:163-193`: SA + IAM bindings (add three new roles)
- `deploy/main.tf:199-247`: `google_cloud_run_v2_service` (add new env vars)

## Out of scope (deliberate)

- Stdio async support: the timeout problem doesn't exist there.
- Migrating the existing `analyze_pdf` to auto-route based on size: keeps the diff small and the surface backward-compatible. Can revisit if real-world usage shows the LLM picks the wrong tool.
- Replacing `/analyze` REST with an async equivalent: the new tools cover the MCP path; REST users already control their own client timeouts.
