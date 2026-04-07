# Architecture: Stdio vs HTTP Transport

PDF Analyzer runs as an MCP (Model Context Protocol) server. It supports two transport modes depending on where it runs: **stdio** for local use, and **HTTP** for cloud deployments.

Both modes expose the same `analyze_pdf` tool. The difference is how the client connects to the server.

## Stdio Mode (Local)

```
┌─────────────┐    stdin/stdout    ┌────────────────┐     API call     ┌─────────────┐
│  MCP Client  │ ◄──────────────► │  pdf-analyzer   │ ──────────────► │  LLM Provider │
│  (e.g. Claude│                   │  (child process)│                  │  (Gemini, etc)│
│   Code, VS   │                   │                 │                  │               │
│   Code, etc) │                   │  reads local    │                  └───────────────┘
└──────────────┘                   │  files directly │
                                   └─────────────────┘
```

The MCP client spawns `pdf-analyzer` as a child process. Communication happens over stdin/stdout using JSON-RPC messages. The server process lives and dies with the client session.

**How it works:**

1. The client starts `pdf-analyzer` as a subprocess
2. Client sends a JSON-RPC request over stdin (e.g., `tools/call` with `analyze_pdf`)
3. The server reads the PDF from disk or fetches it from a URL
4. The server sends the PDF to the configured LLM provider (Google Gemini, Anthropic Claude, or OpenAI) using the provider's API key stored in the OS credential store
5. The server writes the JSON-RPC response to stdout

**PDF sources supported:**

- Absolute local file paths (`/Users/name/docs/report.pdf`)
- Public web URLs (`https://example.com/doc.pdf`)
- Gemini File API cached URIs (for follow-up queries, Google provider only)

**Client configuration example (`.mcp.json`):**

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "pdf-analyzer"
    }
  }
}
```

## HTTP Mode (Cloud Run)

```
┌─────────────┐                    ┌──────────────────────────────┐
│  MCP Client  │ ── POST /mcp ──► │  Cloud Run container          │     API call
│  or any HTTP │                   │  ┌──────────────────────────┐ │ ──────────────►  Vertex AI
│  client      │ ── POST /analyze► │  │  pdf-analyzer            │ │
│              │                   │  │  (Node.js HTTP server)   │ │     ADC auth
│              │ ── GET /health ─► │  │                          │ │ ──────────────►  GCS
└──────────────┘                   │  └──────────────────────────┘ │
                                   └──────────────────────────────┘
```

When the `PORT` environment variable is set (Cloud Run sets this automatically), the server starts an HTTP server instead of reading from stdin. It exposes three endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | POST | MCP protocol (Streamable HTTP). Used by MCP clients. |
| `/analyze` | POST | Direct REST endpoint. Used by any HTTP client. |
| `/health` | GET | Health check. Returns `ok`. |

**How it works:**

1. Cloud Run starts the container with `PORT=8080`
2. The server listens for HTTP requests
3. For `/mcp`: wraps/unwraps JSON-RPC per the MCP Streamable HTTP spec
4. For `/analyze`: accepts a plain JSON body and returns a plain JSON response
5. The server authenticates to Vertex AI and GCS using Application Default Credentials (ADC), which Cloud Run provides automatically via the attached service account
6. No API keys are needed; the service account's IAM roles grant access

**PDF sources supported:**

- Public web URLs (`https://example.com/doc.pdf`)
- GCS URIs (`gs://bucket/file.pdf`), downloaded via authenticated GCS client
- Gemini File API cached URIs (Google provider only)
- Local file paths are NOT supported (the container has no access to the client's filesystem)

### The `/mcp` Endpoint

Used by MCP-aware clients (Claude Code, VS Code, Gemini CLI). The request body is a JSON-RPC message following the MCP Streamable HTTP specification. The response is an SSE stream.

```bash
curl -X POST https://your-service.run.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "analyze_pdf",
      "arguments": {
        "pdf_source": "gs://my-bucket/report.pdf",
        "queries": ["Summarize this document."]
      }
    }
  }'
```

**Client configuration example (`.mcp.json`):**

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "type": "url",
      "url": "https://your-service.run.app/mcp"
    }
  }
}
```

### The `/analyze` Endpoint

A simple REST endpoint for direct HTTP calls, scripts, or any client that does not speak MCP. No JSON-RPC wrapping needed.

**Request:**

```bash
curl -X POST https://your-service.run.app/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "pdf_source": "gs://my-bucket/report.pdf",
    "queries": ["Summarize this document.", "List the key findings."]
  }'
```

**Response:**

```json
{
  "model": "gemini-3.1-pro-preview",
  "pdf_source": "bytes",
  "cached_uris": [],
  "responses": [
    {
      "query": "Summarize this document.",
      "answer": "This document describes..."
    },
    {
      "query": "List the key findings.",
      "answer": "The key findings are..."
    }
  ]
}
```

## Key Differences

| | Stdio (Local) | HTTP (Cloud Run) |
|---|---|---|
| **Transport** | stdin/stdout | HTTP |
| **Process lifecycle** | Spawned per client session | Long-running container |
| **Authentication** | OS credential store (API key) | Service account (ADC) |
| **LLM provider** | Any (Gemini, Claude, OpenAI) | Vertex AI (Google Cloud) |
| **Local file access** | Yes | No |
| **GCS `gs://` URIs** | Yes (if ADC available) | Yes (via service account) |
| **Scaling** | Single user | Auto-scales to zero, handles concurrent requests |
| **Endpoints** | N/A (stdio) | `/mcp`, `/analyze`, `/health` |
| **Billing** | Each user pays their own provider | GCP project owner pays for all users |
| **Caching** | Gemini File API (`cached_uris`) | Not available (Vertex AI, inline bytes only) |

## Large PDF Handling

Both modes handle large PDFs the same way. When a PDF exceeds the model's token limit, it is automatically split into chunks and processed sequentially with rolling context. The chunking logic lives in `src/chunker.ts` and is transport-agnostic.

In HTTP mode, the Cloud Run service is configured with a 15-minute request timeout and 4 GiB memory to accommodate large documents held entirely in memory as inline bytes (Vertex AI does not support the Gemini File API).

## Caching

The Gemini File API caching (`cached_uris`) only works with the **direct Google provider** in stdio mode. Vertex AI does not support the File API, so `cached_uris` always returns an empty array in HTTP mode. Each request to the Cloud Run service re-sends the full PDF bytes to Vertex AI.

## Billing

The two modes have different billing models:

**Stdio (local):** Each user pays their own LLM provider bill. The API key in their OS credential store is tied to their personal account (Google AI Studio, Anthropic Console, or OpenAI Platform).

**HTTP (Cloud Run):** All costs go to the **GCP project** that hosts the Cloud Run service. This includes:

| Resource | What you pay for |
|----------|-----------------|
| Cloud Run | CPU, memory, and network per request. Scales to zero when idle. |
| Vertex AI | Input and output tokens for every PDF analysis call. |
| GCS | Storage and download operations for `gs://` URIs (negligible within same region). |
| Artifact Registry | Container image storage. |
| Cloud Build | Build minutes during deployment. |

If you deploy this for a team, your project absorbs the Vertex AI bill for all users' queries.
