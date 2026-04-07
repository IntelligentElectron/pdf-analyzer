# Plan: Cloud-Ready PDF Analyzer (Issues #29-#33)

## Context

The pdf-analyzer MCP server currently runs locally via stdio only, using direct API keys stored in the OS keychain. Five GitHub issues (#29-#33) collectively enable cloud deployment: adding Vertex AI providers (Google + Anthropic), HTTP transport, env-var configuration, and a file upload tool for remote servers. The end goal is a single Cloud Run deployment that can serve both Gemini and Claude models, authenticated via service account ADC.

**Issues (in dependency order):**
1. **#32** - Env var configuration (`PDF_ANALYZER_PROVIDER`, `PDF_ANALYZER_MODEL`, `PDF_ANALYZER_API_KEY`)
2. **#29** - Google Vertex AI provider (`@ai-sdk/google-vertex`)
3. **#31** - Anthropic Vertex AI provider (via `@ai-sdk/google-vertex/anthropic` subpath)
4. **#30** - Streamable HTTP transport (`StreamableHTTPServerTransport`)
5. **#33** - `upload_pdf` tool for remote deployments (GCS upload)

---

## Verified SDK Facts (from real package inspection, not issue code)

These were verified by installing and introspecting the actual npm packages:

| Package | Verified Exports | Notes |
|---------|-----------------|-------|
| `@ai-sdk/google-vertex` v4.x | `createVertex`, `vertex` | Auth via `google-auth-library` ADC |
| `@ai-sdk/google-vertex/anthropic` | `createVertexAnthropic`, `vertexAnthropic` | Bundled subpath, NOT a separate package |
| `@modelcontextprotocol/sdk/.../streamableHttp.js` | `StreamableHTTPServerTransport` | NOT `NodeStreamableHTTPServerTransport` |
| `StreamableHTTPServerTransport` | Constructor: `{sessionIdGenerator: undefined}` for stateless | Methods: `handleRequest`, `close`, `start`, `send` |
| `@google/genai` v1.48 | `GoogleGenAI({vertexai: true, project, location})` | Vertex mode confirmed working |
| `@google-cloud/storage` | `Storage` class | ADC-based auth |
| `@ai-sdk/anthropic-vertex` | **DOES NOT EXIST** | Issue #31 references wrong package |

---

## Official Documentation Sources

| Topic | URL | Status |
|-------|-----|--------|
| MCP Streamable HTTP spec | https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http | OK |
| Vercel AI SDK, Google Vertex | https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex | OK |
| Anthropic on Vertex via AI SDK | Bundled in `@ai-sdk/google-vertex/anthropic` (no separate docs page) | Verified via npm |
| MCP TypeScript SDK (transport classes) | https://github.com/modelcontextprotocol/typescript-sdk | OK |
| Google Cloud Run deployment | https://cloud.google.com/run/docs/deploying | OK |
| Google Cloud Storage Node.js | https://cloud.google.com/nodejs/docs/reference/storage/latest | OK |
| Gemini File API (large PDFs) | https://ai.google.dev/gemini-api/docs/document-processing | OK |
| Claude on Vertex AI | https://cloud.google.com/vertex-ai/docs/partner-models/use-claude | Partial |

---

## Implementation Order & Dependencies

```
Stage 1 (#32 env vars)
    |
    +-- Stage 2 (#29 google-vertex) -- depends on env var config for VERTEX_PROJECT
    |       |
    |       +-- Stage 3 (#31 anthropic-vertex) -- reuses @ai-sdk/google-vertex from Stage 2
    |
    +-- Stage 4 (#30 HTTP transport) -- independent of providers, depends on env vars for cloud
            |
            +-- Stage 5 (#33 upload_pdf) -- depends on HTTP mode from Stage 4
                    |
                    +-- Stage 6 (Dockerfile) -- depends on all above
                            |
                            +-- Stage 7 (E2E on Cloud Run) -- depends on deployment
```

Stages 2+3 and Stage 4 can run in parallel after Stage 1.

---

## Stage 1: Environment Variable Configuration (Issue #32)

**Branch:** `feature/cloud-ready`

### Files to modify
- `src/providers/registry.ts`

### Implementation

Update `resolveActiveProvider()` to check env vars before keychain:

```
Precedence: env vars > keychain > error
```

In `resolveActiveProvider()`, add before the existing keychain logic:

1. Read `PDF_ANALYZER_PROVIDER` from env. If set:
   - Look up in `providers` map; throw if unknown
   - Read `PDF_ANALYZER_MODEL`; validate against provider's model list, fallback to `provider.defaultModel`
   - Read `PDF_ANALYZER_API_KEY`; pass empty string if absent (Vertex AI providers use ADC, no key needed)
   - Return early with `{ provider, apiKey, modelId }`
2. If env var not set, fall through to existing keychain logic (unchanged)

### Tests: `src/providers/registry.test.ts` (NEW)

Mock the keychain functions (`vi.mock("../keychain.js")`). Use `vi.stubEnv()` to set/unset env vars.

| Test case | Setup | Expected |
|-----------|-------|----------|
| Returns provider from env var | `PDF_ANALYZER_PROVIDER=google` | Returns googleProvider |
| Uses env model when valid | `PDF_ANALYZER_MODEL=gemini-3-flash-preview` | Returns that model ID |
| Falls back to default model on invalid | `PDF_ANALYZER_MODEL=nonexistent` | Returns provider.defaultModel |
| Passes API key from env | `PDF_ANALYZER_API_KEY=test-key` | apiKey === "test-key" |
| Empty API key when not set | `PDF_ANALYZER_PROVIDER=google` only | apiKey === "" |
| Throws on unknown provider | `PDF_ANALYZER_PROVIDER=nope` | Error with valid provider list |
| Falls back to keychain when no env | No env vars, mock keychain returns | Uses keychain values |
| Throws when no env and no keychain | No env vars, keychain returns null | Error message about --setup |

### Gate: Stage 1 pass/fail criteria

**PASS** (all must hold to commit):
1. `npm run type-check` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0 with all registry.test.ts tests green
4. Existing tests (service.test.ts, keychain.test.ts, chunker.test.ts) still pass with zero changes
5. No regressions: `resolveActiveProvider()` with no env vars behaves identically to before (keychain path)

**FAIL** (block commit, fix before retrying):
- Any type error in registry.ts or registry.test.ts
- Any existing test broken by the change
- `resolveActiveProvider()` throws when valid env vars are set
- `resolveActiveProvider()` ignores env vars and hits keychain when `PDF_ANALYZER_PROVIDER` is set

### Commit checkpoint
```
feat: support provider/model config via env vars (#32)

Files: src/providers/registry.ts, src/providers/registry.test.ts
```

---

## Stage 2: Google Vertex AI Provider (Issue #29)

### New dependency
```
@ai-sdk/google-vertex
```

### Files to create
- `src/providers/google-vertex.ts`

### Files to modify
- `src/providers/registry.ts` - Add `"google-vertex": vertexProvider` to `providers` map and `providerList`
- `src/providers/index.ts` - Add export for `vertexProvider`
- `package.json` - Add `@ai-sdk/google-vertex` dependency

### Implementation: `src/providers/google-vertex.ts`

**Models:** Same as google.ts (gemini-3-flash-preview, gemini-3.1-pro-preview)

**`createModel(apiKey, modelId)`:**
```typescript
import { createVertex } from "@ai-sdk/google-vertex";

const vertex = createVertex({
  project: getProject(),  // from VERTEX_PROJECT env var, throws if missing
  location: getLocation(), // from VERTEX_LOCATION env var, defaults "us-central1"
});
return vertex(modelId);
```

**`preparePdf(source, apiKey)`:**
Uses `GoogleGenAI` in Vertex mode:
```typescript
const client = new GoogleGenAI({
  vertexai: true,
  project: getProject(),
  location: getLocation(),
});
```
Then follows the exact same File API upload logic as `google.ts` (upload blob/path, wait for ready, return URL-based file part with cachedUri). Extract shared helpers to avoid duplication, or call the google provider's preparePdf with the Vertex client.

**Important:** The `id` field must be `"google"` so that `provider.id === "google"` checks in `service.ts` (cached URI routing) continue to work.

**`isTokenLimitError`:** Reuse identical logic from google.ts.

**`providerOptions`:** Same as google.ts: `{ google: { thinkingConfig: { thinkingLevel: "low" } } }`

**Helper functions (module-private):**
```typescript
function getProject(): string {
  const p = process.env.VERTEX_PROJECT;
  if (!p) throw new Error("VERTEX_PROJECT env var is required for Google Vertex AI provider.");
  return p;
}

function getLocation(): string {
  return process.env.VERTEX_LOCATION || "us-central1";
}
```

### Code reuse consideration

`google.ts` and `google-vertex.ts` share: models, isTokenLimitError, providerOptions, File API upload/wait logic. The only difference is how the `GoogleGenAI` client and AI SDK model are created (API key vs ADC). Options:
- **Option A:** Extract shared logic into `src/providers/google-shared.ts`
- **Option B:** Duplicate (both files are ~140 lines, manageable)

Prefer **Option A** if the shared code is >30 lines. Extract: `MODELS`, `DEFAULT_MODEL`, `isGeminiFileUri`, `waitForFileReady`, `uploadToFileApi`, `isTokenLimitError`, `PROVIDER_OPTIONS`.

### Tests: `src/providers/google-vertex.test.ts` (NEW)

| Test case | Expected |
|-----------|----------|
| `vertexProvider.id` equals `"google"` | Cached URI routing works |
| `vertexProvider.models` has 2 entries | Correct model list |
| `vertexProvider.defaultModel` is `"gemini-3.1-pro-preview"` | Correct default |
| `vertexProvider.apiKeyUrl` is empty string | No API key needed |
| `getProject()` throws when VERTEX_PROJECT unset | Clear error message |
| `getLocation()` defaults to "us-central1" | Fallback works |
| `isTokenLimitError` detects "input token count exceeds" | Correct detection |
| `isTokenLimitError` returns false for other errors | No false positives |

### Gate: Stage 2 pass/fail criteria

**PASS** (all must hold to commit):
1. `npm run type-check` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0, all google-vertex.test.ts tests green
4. `vertexProvider` is accessible via `providers["google-vertex"]` in registry
5. `vertexProvider` exported from `src/providers/index.ts`
6. `bun install` succeeds with new `@ai-sdk/google-vertex` dependency
7. All existing tests pass unchanged

**FAIL** (block commit):
- `createVertex` import fails (wrong package version or path)
- `GoogleGenAI({ vertexai: true, ... })` constructor throws at import time
- `vertexProvider.id !== "google"` (breaks cached URI routing in service.ts)
- Shared code extraction (if done) breaks google.ts behavior
- Any type error from the new provider not satisfying `ProviderConfig`

### Commit checkpoint
```
feat: add Google Vertex AI provider (#29)

Files: src/providers/google-vertex.ts, src/providers/google-vertex.test.ts,
       src/providers/registry.ts, src/providers/index.ts, package.json
```

---

## Stage 3: Anthropic Vertex AI Provider (Issue #31)

### New dependency
None. `@ai-sdk/google-vertex/anthropic` is a subpath of the package installed in Stage 2.

### Files to create
- `src/providers/anthropic-vertex.ts`

### Files to modify
- `src/providers/registry.ts` - Add `"anthropic-vertex": anthropicVertexProvider`
- `src/providers/index.ts` - Add export

### Implementation: `src/providers/anthropic-vertex.ts`

**Models:** Same as anthropic.ts (claude-sonnet-4-6, claude-opus-4-6)

**`createModel(apiKey, modelId)`:**
```typescript
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";

const client = createVertexAnthropic({
  project: getProject(),
  location: getLocation(),
});
return client(modelId);
```

**`preparePdf`:** Reuse the exact same inline-bytes logic from `anthropic.ts`. Extract into a shared function or import from anthropic.ts if exported.

**`isTokenLimitError`:** Reuse from anthropic.ts.

**`id`:** Set to `"anthropic"` so provider-specific behavior is consistent.

**`providerOptions`:** Empty `{}` (same as anthropic.ts).

**`apiKeyUrl`:** Empty string.

### Code reuse consideration

`anthropic.ts` and `anthropic-vertex.ts` share: models, preparePdf (inline bytes), isTokenLimitError, providerOptions. Extract shared logic into `src/providers/anthropic-shared.ts` if >20 lines overlap.

### Tests: `src/providers/anthropic-vertex.test.ts` (NEW)

| Test case | Expected |
|-----------|----------|
| `anthropicVertexProvider.id` equals `"anthropic"` | Provider-specific behavior works |
| `anthropicVertexProvider.models` matches anthropic provider | Same models |
| `anthropicVertexProvider.apiKeyUrl` is empty string | No API key |
| `getProject()` throws when VERTEX_PROJECT unset | Clear error |
| `isTokenLimitError` detects Anthropic patterns | "too many input tokens", "prompt is too long", etc. |
| `preparePdf` with bytes returns inline file parts | cachedUri is null |
| `preparePdf` with cachedUri throws | Not supported |

### Gate: Stage 3 pass/fail criteria

**PASS** (all must hold to commit):
1. `npm run type-check` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0, all anthropic-vertex.test.ts tests green
4. `anthropicVertexProvider` accessible via `providers["anthropic-vertex"]` in registry
5. `anthropicVertexProvider` exported from `src/providers/index.ts`
6. No new dependencies added (uses `@ai-sdk/google-vertex/anthropic` subpath from Stage 2)
7. `anthropicVertexProvider.id === "anthropic"` (provider-specific error detection)
8. `preparePdf({ kind: "cachedUri", uri: "..." }, "")` throws with clear error
9. `preparePdf({ kind: "bytes", bytes: new Uint8Array([...]) }, "")` returns `{ fileParts: [{ type: "file", data: Uint8Array, mediaType: "application/pdf" }], cachedUri: null }`
10. All existing tests pass unchanged

**FAIL** (block commit):
- `createVertexAnthropic` import fails from `@ai-sdk/google-vertex/anthropic`
- `anthropicVertexProvider.id !== "anthropic"`
- preparePdf accepts cachedUri (should reject)
- Shared code extraction breaks anthropic.ts behavior

### Commit checkpoint
```
feat: add Anthropic via Vertex AI provider (#31)

Files: src/providers/anthropic-vertex.ts, src/providers/anthropic-vertex.test.ts,
       src/providers/registry.ts, src/providers/index.ts
```

---

## Stage 4: Streamable HTTP Transport (Issue #30)

### Files to create
- `src/transports/http.ts`

### Files to modify
- `src/server.ts` - `createServer()` accepts `mode` param; `runServer()` branches on `PORT`
- `src/index.ts` - Skip auto-update/TTY check when `PORT` is set

### Implementation

**`src/transports/http.ts`:**
```typescript
import { createServer as createHttpServer } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export function startHttpServer(
  createMcpServer: () => McpServer,
  port: number,
): void {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      const server = createMcpServer();
      res.on("close", () => { transport.close(); server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    res.writeHead(404);
    res.end();
  });

  httpServer.listen(port, () => {
    console.log(`MCP server listening on port ${port}`);
  });
}
```

**`src/server.ts` changes:**

`createServer()` signature becomes:
```typescript
export const createServer = (mode: "stdio" | "http" = "stdio"): McpServer => {
```

- Tool description for `analyze_pdf` varies by mode:
  - stdio: current description (mentions file paths)
  - http: mentions URLs, GCS URLs from upload_pdf, no local file paths
- `SERVER_INSTRUCTIONS` also varies by mode

`runServer()` becomes:
```typescript
export const runServer = async (): Promise<void> => {
  const port = process.env.PORT;
  if (port) {
    startHttpServer(() => createServer("http"), parseInt(port, 10));
  } else {
    const server = createServer("stdio");
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
};
```

**`src/index.ts` changes:**

When `PORT` is set, skip the TTY check and auto-update (those are for local binary usage only). Go straight to `runServer()`.

### Tests: `src/transports/http.test.ts` (NEW)

| Test case | Expected |
|-----------|----------|
| GET /health returns 200 "ok" | Health check works |
| POST /mcp with MCP initialize returns valid JSON-RPC | Transport handles protocol |
| GET /unknown returns 404 | Unknown routes rejected |
| POST /unknown returns 404 | Unknown routes rejected |

**`src/server.test.ts` (NEW):**

| Test case | Expected |
|-----------|----------|
| `createServer("stdio")` tool description mentions "file path" | Correct for local |
| `createServer("http")` tool description mentions "upload_pdf" (after Stage 5) or "URL" | Correct for remote |

### Gate: Stage 4 pass/fail criteria

**PASS** (all must hold to commit):
1. `npm run type-check` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0, all http.test.ts and server.test.ts tests green
4. Health check test: `GET /health` returns status 200, body exactly `"ok"`, `Content-Type: text/plain`
5. MCP initialize test: `POST /mcp` with `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}` returns JSON-RPC response with `result.serverInfo.name === "pdf-analyzer"` and `result.serverInfo.version === VERSION`
6. 404 test: `GET /unknown` returns status 404, empty body
7. Mode isolation: `createServer("stdio")` description contains "file path"; `createServer("http")` description contains "URL"
8. `runServer()` with `PORT=8080` starts HTTP server (not stdio)
9. `runServer()` without PORT starts stdio (existing behavior preserved)
10. All existing tests pass unchanged

**FAIL** (block commit):
- `StreamableHTTPServerTransport` import fails
- Health endpoint returns wrong status or body
- MCP POST to `/mcp` returns non-JSON or invalid JSON-RPC
- Stdio mode broken (process hangs or crashes when no PORT set)
- `createServer()` with no args behaves differently than before

### Commit checkpoint
```
feat: add Streamable HTTP transport for cloud deployment (#30)

Files: src/transports/http.ts, src/transports/http.test.ts,
       src/server.ts, src/server.test.ts, src/index.ts
```

---

## Stage 5: Upload PDF Tool (Issue #33)

### New dependency
```
@google-cloud/storage
```

### Files to create
- `src/storage.ts`

### Files to modify
- `src/server.ts` - Register `upload_pdf` tool in HTTP mode only
- `src/service.ts` - Handle `gs://` URLs in `classifySource()`
- `package.json` - Add `@google-cloud/storage`

### Implementation

**`src/storage.ts`:**
```typescript
import { Storage } from "@google-cloud/storage";

export async function uploadToGcs(data: Buffer, filename: string): Promise<string> {
  const bucket = process.env.PDF_UPLOAD_BUCKET;
  if (!bucket) {
    throw new Error("PDF_UPLOAD_BUCKET env var is required for upload_pdf.");
  }
  const storage = new Storage(); // uses ADC
  const key = `uploads/${Date.now()}-${filename}`;
  const file = storage.bucket(bucket).file(key);
  await file.save(data, { contentType: "application/pdf" });
  return `gs://${bucket}/${key}`;
}
```

**`src/server.ts` changes:**

Inside `createServer("http")`, after registering `analyze_pdf`, register `upload_pdf`:
```typescript
if (mode === "http") {
  server.registerTool("upload_pdf", {
    description: "Upload a PDF to cloud storage for analysis. Returns a URL to pass to analyze_pdf.",
    inputSchema: {
      pdf_data: z.string().describe("Base64-encoded PDF file contents"),
      filename: z.string().optional().describe("Optional original filename"),
    },
  }, async ({ pdf_data, filename }) => {
    const bytes = Buffer.from(pdf_data, "base64");
    const name = filename || `upload-${Date.now()}.pdf`;
    const url = await uploadToGcs(bytes, name);
    return formatResult({ url, filename: name });
  });
}
```

**`src/service.ts` changes:**

In `classifySource()`, add `gs://` handling before existing checks:
```typescript
if (source.startsWith("gs://")) {
  const withoutPrefix = source.slice(5);
  const slashIndex = withoutPrefix.indexOf("/");
  const bucket = withoutPrefix.slice(0, slashIndex);
  const objectPath = withoutPrefix.slice(slashIndex + 1);
  return { kind: "url", url: `https://storage.googleapis.com/${bucket}/${objectPath}` };
}
```

### Tests

**`src/storage.test.ts` (NEW):**

| Test case | Expected |
|-----------|----------|
| Throws when `PDF_UPLOAD_BUCKET` is not set | Clear error message |
| With mocked Storage, calls `file.save` with correct args | content-type "application/pdf" |
| Returns `gs://bucket/uploads/...` URL | Correct format |

**`src/service.test.ts` additions:**

| Test case | Expected |
|-----------|----------|
| `classifySource("gs://my-bucket/uploads/doc.pdf")` | `{ kind: "url", url: "https://storage.googleapis.com/my-bucket/uploads/doc.pdf" }` |
| `classifySource("gs://bucket/a/b/c.pdf")` | Handles nested paths correctly |

**`src/server.test.ts` additions:**

| Test case | Expected |
|-----------|----------|
| `createServer("http")` has `upload_pdf` tool registered | Tool visible in HTTP mode |
| `createServer("stdio")` does NOT have `upload_pdf` | Tool hidden in stdio mode |

### Gate: Stage 5 pass/fail criteria

**PASS** (all must hold to commit):
1. `npm run type-check` exits 0
2. `npm run lint` exits 0
3. `npm test` exits 0, all storage.test.ts and new service/server tests green
4. `uploadToGcs` without `PDF_UPLOAD_BUCKET` throws `Error("PDF_UPLOAD_BUCKET env var is required for upload_pdf.")`
5. `uploadToGcs` with mocked Storage: `file.save` called with `(data, { contentType: "application/pdf" })`, returns string matching `gs://${bucket}/uploads/\d+-${filename}`
6. `classifySource("gs://my-bucket/uploads/doc.pdf")` returns exactly `{ kind: "url", url: "https://storage.googleapis.com/my-bucket/uploads/doc.pdf" }`
7. `classifySource("gs://bucket/a/b/c.pdf")` returns `{ kind: "url", url: "https://storage.googleapis.com/bucket/a/b/c.pdf" }`
8. `createServer("http")`: tool list includes both `analyze_pdf` and `upload_pdf`
9. `createServer("stdio")`: tool list includes only `analyze_pdf`, NOT `upload_pdf`
10. `upload_pdf` handler: given `pdf_data` = base64 of "test", `filename` = "test.pdf", returns `{ url: "gs://...", filename: "test.pdf" }`
11. All existing tests pass unchanged

**FAIL** (block commit):
- `@google-cloud/storage` fails to install or import
- `gs://` URLs not converted to HTTPS (would break PDF fetching)
- `upload_pdf` visible in stdio mode (leaks cloud-only tool to local users)
- `upload_pdf` accepts non-base64 data without error (should fail on decode)
- Existing `classifySource` behavior changed for non-gs:// inputs

### Commit checkpoint
```
feat: add upload_pdf tool for remote deployments (#33)

Files: src/storage.ts, src/storage.test.ts, src/server.ts,
       src/service.ts, src/service.test.ts, package.json
```

---

## Stage 6: Dockerfile & Cloud Run Deployment

### Files to create
- `Dockerfile`

### Implementation

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY dist/ ./dist/
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

Build and deploy:
```bash
# Build TypeScript first
npm run build

# Build container image
gcloud builds submit --tag gcr.io/$PROJECT_ID/pdf-analyzer

# Deploy to Cloud Run
gcloud run deploy pdf-analyzer \
  --image gcr.io/$PROJECT_ID/pdf-analyzer \
  --platform managed \
  --region us-east5 \
  --set-env-vars "PDF_ANALYZER_PROVIDER=google-vertex,VERTEX_PROJECT=$PROJECT_ID,VERTEX_LOCATION=us-east5,PDF_UPLOAD_BUCKET=$BUCKET_NAME" \
  --service-account $SA_EMAIL \
  --allow-unauthenticated
```

Required IAM roles for service account:
- **Vertex AI User** (Gemini + Claude models)
- **Storage Admin** (File API + upload_pdf GCS uploads)

### Gate: Stage 6 pass/fail criteria

**PASS** (all must hold to commit):
1. `docker build -t pdf-analyzer .` exits 0 (after `npm run build`)
2. `docker run -e PORT=8080 -p 8080:8080 pdf-analyzer` starts without crash
3. `curl http://localhost:8080/health` returns 200 "ok" within 5 seconds of container start
4. Container stops cleanly on SIGTERM (no zombie processes)
5. Image size < 500MB (node:22-slim base + production deps only)
6. No `devDependencies` installed in the image (`--omit=dev`)

**FAIL** (block commit):
- Docker build fails (missing files, wrong COPY paths)
- Container crashes on startup (missing env vars should log error, not crash)
- Health check not reachable
- Image includes TypeScript source or devDependencies

### Commit checkpoint
```
feat: add Dockerfile for Cloud Run deployment

Files: Dockerfile
```

---

## Stage 7: E2E Tests on Cloud Run

### Files to create
- `test/test-e2e-cloud-run.ts`

### E2E test cases

All tests use `fetch()` to send JSON-RPC requests to `CLOUD_RUN_URL` env var.

| # | Test | Method | Expected |
|---|------|--------|----------|
| 1 | Health check | `GET /health` | 200 "ok" |
| 2 | MCP initialize | `POST /mcp` with initialize request | JSON-RPC response with server info + tool list |
| 3 | Tool list includes upload_pdf | From initialize response | `upload_pdf` in tools |
| 4 | Analyze PDF from URL | `POST /mcp` with analyze_pdf call, public PDF URL | Responses array populated |
| 5 | Upload + Analyze flow | upload_pdf with base64 PDF, then analyze_pdf with returned gs:// URL | Both succeed |
| 6 | Switch to anthropic-vertex | Redeploy, repeat test 4 | Works with Claude |

### Gate: Stage 7 pass/fail criteria

**PASS** (all must hold to commit):
1. Test 1 (Health): `GET /health` returns status 200, body `"ok"`, latency < 2s
2. Test 2 (Initialize): `POST /mcp` returns JSON-RPC response where:
   - `result.protocolVersion === "2025-03-26"`
   - `result.serverInfo.name === "pdf-analyzer"`
   - `result.capabilities.tools` is defined
3. Test 3 (Tool list): After initialize, `POST /mcp` with `tools/list` returns array containing objects where `name === "analyze_pdf"` AND `name === "upload_pdf"` (both present)
4. Test 4 (Analyze from URL): `POST /mcp` with `tools/call` for `analyze_pdf` with a public PDF URL returns:
   - `result.content[0].type === "text"`
   - Parsed JSON has `responses` array with length === number of queries
   - Each response has non-empty `query` and `answer` strings
   - `model` field matches the configured model ID
   - Latency < 60s
5. Test 5 (Upload + Analyze):
   - upload_pdf: returns JSON with `url` starting with `gs://`
   - analyze_pdf with that gs:// URL: returns valid responses (same schema as Test 4)
6. Test 6 (Anthropic Vertex): After redeploying with `PDF_ANALYZER_PROVIDER=anthropic-vertex`:
   - analyze_pdf with public PDF URL returns valid responses
   - `model` field is a Claude model ID

**FAIL** (block commit):
- Any test returns non-200 HTTP status (except 404 tests)
- JSON-RPC error responses (check `error` field in response)
- `upload_pdf` returns error about missing bucket
- analyze_pdf returns `isError: true` in MCP response
- Timeout > 120s on any single request
- `CLOUD_RUN_URL` env var not set when running tests (should skip gracefully, not crash)

### Commit checkpoint
```
test: add Cloud Run e2e test suite

Files: test/test-e2e-cloud-run.ts
```

---

## Full Verification Checklist

### Tier 1: Local automated (no API keys, runs on every commit)

```bash
npm run type-check && npm run lint && npm test
```

**Pass:** exit code 0 for all three commands. Zero test failures. Zero type errors.
**Fail:** any non-zero exit. Any single test failure blocks the commit.

**Expected test count per stage (cumulative):**

| After stage | New test files | Approximate new test count |
|-------------|---------------|---------------------------|
| 1 | registry.test.ts | +8 |
| 2 | google-vertex.test.ts | +8 |
| 3 | anthropic-vertex.test.ts | +7 |
| 4 | http.test.ts, server.test.ts | +6 |
| 5 | storage.test.ts + additions | +7 |
| **Total new** | **7 files** | **~36 tests** |

Plus the existing ~25 tests in service.test.ts, keychain.test.ts, chunker.test.ts that must continue passing.

### Tier 2: Local integration (requires GCP service account)

```bash
export PDF_ANALYZER_PROVIDER=google-vertex
export VERTEX_PROJECT=my-project
export VERTEX_LOCATION=us-east5
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa-key.json
echo '{}' | npx tsx src/index.ts
```

**Pass:** Server starts on stdio without errors. No crash, no unhandled rejection.
**Fail:** Crash on startup, ADC auth failure, missing env var not caught gracefully.

### Tier 3: Docker build (requires Docker)

```bash
npm run build
docker build -t pdf-analyzer .
docker run --rm -e PORT=8080 -p 8080:8080 pdf-analyzer &
sleep 3
curl -sf http://localhost:8080/health && echo "PASS" || echo "FAIL"
docker stop $(docker ps -q --filter ancestor=pdf-analyzer)
```

**Pass:** Health check returns "ok" within 5 seconds.
**Fail:** Build fails, container crashes, health check unreachable.

### Tier 4: Cloud Run E2E (requires deployed service)

```bash
CLOUD_RUN_URL=https://pdf-analyzer-xxxxx-uc.a.run.app npx tsx test/test-e2e-cloud-run.ts
```

**Pass:** All 6 e2e tests report success. Each test prints PASS/FAIL with latency.
**Fail:** Any test prints FAIL. Script exits with non-zero code on first failure.

### Regression contract

At every stage, these invariants must hold:
1. `createServer()` with no args produces identical behavior to the pre-change version
2. stdio mode with keychain-stored google/anthropic/openai provider works unchanged
3. No new runtime dependencies loaded in stdio mode (lazy imports for `@google-cloud/storage`, `@ai-sdk/google-vertex`)
4. `npm test` runtime stays under 30 seconds (no network calls in unit tests)

---

## Validation Results

**Date**: 2026-04-06
**Validator**: Claude (automated)

### Tier 1: Automated Checks

| Check | Result | Evidence |
|-------|--------|----------|
| `npm run type-check` | PASS | Exit code 0, zero type errors |
| `npm run lint` | PASS | Exit code 0, zero lint errors |
| `npm test` | PASS | 85 passed, 2 skipped, 9 test files, 2.31s runtime (under 30s limit) |

### Stage 1: Environment Variable Configuration (#32)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | type-check exits 0 | PASS | See Tier 1 |
| 2 | lint exits 0 | PASS | See Tier 1 |
| 3 | registry.test.ts tests green | PASS | 8 tests passing |
| 4 | Existing tests unchanged | PASS | service (26), keychain (16), chunker (9) all pass |
| 5 | No regressions in keychain path | PASS | Test "falls back to keychain when no env vars set" passes; `resolveFromEnv()` returns null when `PDF_ANALYZER_PROVIDER` unset, falling through to keychain logic |

### Stage 2: Google Vertex AI Provider (#29)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | type-check exits 0 | PASS | See Tier 1 |
| 2 | lint exits 0 | PASS | See Tier 1 |
| 3 | google-vertex.test.ts tests green | PASS | 9 tests passing |
| 4 | `providers["google-vertex"]` resolves | PASS | `registry.ts:23`: `"google-vertex": vertexProvider` |
| 5 | Exported from index.ts | PASS | `index.ts:8`: `export { vertexProvider } from "./google-vertex.js"` |
| 6 | `@ai-sdk/google-vertex` dependency | PASS | `package.json`: `"@ai-sdk/google-vertex": "^4.0.104"` |
| 7 | `vertexProvider.id === "google"` | PASS | `google-vertex.ts:39`, confirmed by test |
| 8 | Shared code extraction (Option A) | PASS | `google-shared.ts` extracts MODELS, File API helpers, token limit detection. Existing tests still pass. |
| 9 | All existing tests pass | PASS | See Tier 1 |

### Stage 3: Anthropic Vertex AI Provider (#31)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | type-check exits 0 | PASS | See Tier 1 |
| 2 | lint exits 0 | PASS | See Tier 1 |
| 3 | anthropic-vertex.test.ts tests green | PASS | 10 tests passing |
| 4 | `providers["anthropic-vertex"]` resolves | PASS | `registry.ts:24`: `"anthropic-vertex": anthropicVertexProvider` |
| 5 | Exported from index.ts | PASS | `index.ts:9` |
| 6 | No new dependencies | PASS | Uses `@ai-sdk/google-vertex/anthropic` subpath from Stage 2 |
| 7 | `anthropicVertexProvider.id === "anthropic"` | PASS | `anthropic-vertex.ts:69`, confirmed by test |
| 8 | `preparePdf` rejects cachedUri | PASS | Throws "Cached URIs are only supported with the Google provider" (test confirms) |
| 9 | `preparePdf` returns inline parts for bytes | PASS | Returns `{ fileParts: [{ type: "file", data: Uint8Array, mediaType: "application/pdf" }], cachedUri: null }` (test confirms) |
| 10 | All existing tests pass | PASS | See Tier 1 |

### Stage 4: Streamable HTTP Transport (#30)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | type-check exits 0 | PASS | See Tier 1 |
| 2 | lint exits 0 | PASS | See Tier 1 |
| 3 | http.test.ts + server.test.ts green | PASS | 3 + 3 = 6 tests passing |
| 4 | GET /health returns 200 "ok" text/plain | PASS | http.test.ts asserts status 200, body "ok", content-type "text/plain" |
| 5 | POST /mcp initialize returns JSON-RPC | PASS | http.test.ts parses SSE data line, asserts `serverInfo.name === "pdf-analyzer"` |
| 6 | GET /unknown returns 404 | PASS | http.test.ts asserts status 404 |
| 7 | Mode isolation in descriptions | PASS | `ANALYZE_PDF_DESCRIPTION_STDIO` contains "file path"; `ANALYZE_PDF_DESCRIPTION_HTTP` contains "upload_pdf" and "URL" (`server.ts:112-115`) |
| 8 | PORT triggers HTTP mode | PASS | `runServer()` checks `process.env.PORT` and calls `startHttpServer` (`server.ts:218`) |
| 9 | No PORT triggers stdio | PASS | `runServer()` falls through to `StdioServerTransport` (`server.ts:221-224`) |
| 10 | index.ts skips TTY/auto-update when PORT set | PASS | `index.ts:72-75`: `if (process.env.PORT) { await runServer(); return; }` |
| 11 | All existing tests pass | PASS | See Tier 1 |

### Stage 5: Upload PDF Tool (#33)

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | type-check exits 0 | PASS | See Tier 1 |
| 2 | lint exits 0 | PASS | See Tier 1 |
| 3 | storage.test.ts + additions green | PASS | 3 storage tests + 2 gs:// tests in service.test.ts |
| 4 | Throws without PDF_UPLOAD_BUCKET | PASS | storage.test.ts asserts exact error message |
| 5 | Mocked file.save with correct args | PASS | storage.test.ts asserts `(data, { contentType: "application/pdf" })` |
| 6 | classifySource gs:// single path | PASS | service.test.ts: `"gs://my-bucket/uploads/doc.pdf"` -> `{ kind: "url", url: "https://storage.googleapis.com/my-bucket/uploads/doc.pdf" }` |
| 7 | classifySource gs:// nested path | PASS | service.test.ts: `"gs://bucket/a/b/c.pdf"` -> `{ kind: "url", url: "https://storage.googleapis.com/bucket/a/b/c.pdf" }` |
| 8 | upload_pdf registered in HTTP mode | PASS | `server.ts:184`: `if (mode === "http") { server.registerTool("upload_pdf", ...)` |
| 9 | upload_pdf NOT in stdio mode | PASS | Conditional block only enters when `mode === "http"` |
| 10 | `@google-cloud/storage` dependency | PASS | `package.json`: `"@google-cloud/storage": "^7.19.0"` |
| 11 | All existing tests pass | PASS | See Tier 1 |

### Stage 6: Dockerfile

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | Dockerfile exists | PASS | Matches plan exactly: node:22-slim, --omit=dev, COPY dist/, PORT=8080, CMD node dist/index.js |
| 2 | No devDependencies | PASS | `RUN npm install --omit=dev` |
| 3 | No TypeScript source | PASS | Only `COPY dist/ ./dist/`, no src/ copied |
| 4 | Docker build succeeds | MANUAL | Requires Docker daemon; structural review passes |
| 5 | Container starts, health check works | MANUAL | Requires Docker daemon |
| 6 | Image size < 500MB | MANUAL | Requires Docker daemon |

### Stage 7: E2E Tests on Cloud Run

| # | Criterion | Result | Evidence |
|---|-----------|--------|----------|
| 1 | test/test-e2e-cloud-run.ts exists | **FAIL** | File does not exist. Glob returned no matches. |

### Regression Contract

| # | Invariant | Result | Evidence |
|---|-----------|--------|----------|
| 1 | `createServer()` no-arg identical to pre-change | PASS | Default param `mode: "stdio" | "http" = "stdio"`, server.test.ts confirms |
| 2 | stdio mode with keychain providers unchanged | PASS | `resolveFromEnv()` returns null when no env vars, falls through to existing keychain logic |
| 3 | No new runtime deps in stdio mode (lazy imports) | **FAIL** | `server.ts:14-15` eagerly imports `startHttpServer` (loads `StreamableHTTPServerTransport`) and `uploadToGcs` (loads `@google-cloud/storage`). `registry.ts:14-15` eagerly imports `vertexProvider` (loads `@ai-sdk/google-vertex`) and `anthropicVertexProvider` (loads `@ai-sdk/google-vertex/anthropic`). All four cloud-only packages are loaded in stdio mode. |
| 4 | npm test under 30 seconds | PASS | 2.31s total |

### Summary

**39/41 criteria passed.** 3 criteria require manual Docker verification (non-blocking).

**Failures:**

1. **Stage 7 not implemented**: `test/test-e2e-cloud-run.ts` does not exist. The entire E2E test suite is missing.
2. **Regression contract #3 (lazy imports)**: Cloud-only packages (`@google-cloud/storage`, `@ai-sdk/google-vertex`, `@ai-sdk/google-vertex/anthropic`, `StreamableHTTPServerTransport`) are eagerly imported at module load time via top-level `import` statements in `server.ts` and `registry.ts`. In stdio mode, these packages are loaded but never used. Fix: use dynamic `import()` behind the `if (mode === "http")` and `if (providerId)` guards.

**Status: Needs Work**
