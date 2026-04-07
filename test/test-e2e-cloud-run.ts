/// <reference types="node" />

/**
 * E2E test suite for PDF Analyzer on Cloud Run.
 *
 * Requires a deployed Cloud Run service. Set CLOUD_RUN_URL env var to the service URL.
 * Tests send JSON-RPC requests over the MCP Streamable HTTP transport.
 *
 * Usage:
 *   CLOUD_RUN_URL=https://pdf-analyzer-xxxxx-uc.a.run.app npx tsx test/test-e2e-cloud-run.ts
 */

export {};

const BASE_URL = process.env.CLOUD_RUN_URL;

if (!BASE_URL) {
  console.log("CLOUD_RUN_URL not set, skipping e2e tests.");
  process.exit(0);
}

const MCP_URL = `${BASE_URL}/mcp`;
const HEALTH_URL = `${BASE_URL}/health`;

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

// A small, publicly available PDF for testing.
const PUBLIC_PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

// Minimal valid PDF (header + empty body) for upload tests.
const MINIMAL_PDF_BASE64 = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Pages 2 0 R>>endobj 2 0 obj<</Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
).toString("base64");

let passed = 0;
let failed = 0;

function jsonRpcRequest(method: string, params: Record<string, unknown>, id: number) {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

/**
 * Parse a MCP Streamable HTTP response.
 * The response may be SSE (text/event-stream) or plain JSON.
 */
async function parseMcpResponse(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data) return JSON.parse(data);
      }
    }
    throw new Error(`No data line found in SSE response: ${text}`);
  }

  return res.json() as Promise<Record<string, unknown>>;
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const latency = Date.now() - start;
    console.log(`PASS [${latency}ms] ${name}`);
    passed++;
  } catch (err) {
    const latency = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL [${latency}ms] ${name}: ${message}`);
    failed++;
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---------------------------------------------------------------------------
// Test 1: Health check
// ---------------------------------------------------------------------------
await test("Health check", async () => {
  const res = await fetch(HEALTH_URL);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.text();
  assert(body === "ok", `Expected "ok", got "${body}"`);
});

// ---------------------------------------------------------------------------
// Test 2: MCP initialize
// ---------------------------------------------------------------------------
await test("MCP initialize", async () => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(
      jsonRpcRequest(
        "initialize",
        {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "e2e-test", version: "1.0" },
        },
        1
      )
    ),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);

  const data = await parseMcpResponse(res);
  const result = data.result as Record<string, unknown>;
  assert(result !== undefined, "Missing result in response");

  assert(
    (result.protocolVersion as string) === "2025-03-26",
    `Expected protocolVersion "2025-03-26", got "${result.protocolVersion}"`
  );

  const serverInfo = result.serverInfo as Record<string, unknown>;
  assert(
    serverInfo.name === "pdf-analyzer",
    `Expected name "pdf-analyzer", got "${serverInfo.name}"`
  );
  assert(result.capabilities !== undefined, "Missing capabilities");
  assert(
    (result.capabilities as Record<string, unknown>).tools !== undefined,
    "Missing tools capability"
  );
});

// ---------------------------------------------------------------------------
// Test 3: Tool list includes upload_pdf
// ---------------------------------------------------------------------------
await test("Tool list includes upload_pdf", async () => {
  // Send initialized notification first (required by MCP protocol)
  await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(jsonRpcRequest("tools/list", {}, 2)),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);

  const data = await parseMcpResponse(res);
  const result = data.result as Record<string, unknown>;
  const tools = result.tools as Array<Record<string, unknown>>;
  assert(Array.isArray(tools), "Expected tools array");

  const toolNames = tools.map((t) => t.name);
  assert(
    toolNames.includes("analyze_pdf"),
    `Missing analyze_pdf in tools: ${toolNames.join(", ")}`
  );
  assert(toolNames.includes("upload_pdf"), `Missing upload_pdf in tools: ${toolNames.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Test 4: Analyze PDF from URL
// ---------------------------------------------------------------------------
await test("Analyze PDF from URL", async () => {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(
      jsonRpcRequest(
        "tools/call",
        {
          name: "analyze_pdf",
          arguments: {
            pdf_source: PUBLIC_PDF_URL,
            queries: ["What is this document about?"],
          },
        },
        3
      )
    ),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);

  const data = await parseMcpResponse(res);
  assert(data.error === undefined, `JSON-RPC error: ${JSON.stringify(data.error)}`);

  const result = data.result as Record<string, unknown>;
  const content = result.content as Array<Record<string, unknown>>;
  assert(content[0].type === "text", `Expected text content, got ${content[0].type}`);

  const parsed = JSON.parse(content[0].text as string);
  assert(parsed.isError === undefined, `Tool returned error: ${content[0].text}`);
  assert(Array.isArray(parsed.responses), "Missing responses array");
  assert(parsed.responses.length === 1, `Expected 1 response, got ${parsed.responses.length}`);
  assert(parsed.responses[0].query !== "", "Empty query in response");
  assert(parsed.responses[0].answer !== "", "Empty answer in response");
  assert(parsed.model !== undefined, "Missing model field");
});

// ---------------------------------------------------------------------------
// Test 5: Upload + Analyze flow
// ---------------------------------------------------------------------------
await test("Upload + Analyze flow", async () => {
  // Step 1: Upload PDF
  const uploadRes = await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(
      jsonRpcRequest(
        "tools/call",
        {
          name: "upload_pdf",
          arguments: {
            pdf_data: MINIMAL_PDF_BASE64,
            filename: "e2e-test.pdf",
          },
        },
        4
      )
    ),
  });
  assert(uploadRes.status === 200, `Upload: expected 200, got ${uploadRes.status}`);

  const uploadData = await parseMcpResponse(uploadRes);
  assert(
    uploadData.error === undefined,
    `Upload JSON-RPC error: ${JSON.stringify(uploadData.error)}`
  );

  const uploadResult = uploadData.result as Record<string, unknown>;
  const uploadContent = uploadResult.content as Array<Record<string, unknown>>;
  const uploadParsed = JSON.parse(uploadContent[0].text as string);
  assert(typeof uploadParsed.url === "string", "Missing url in upload response");
  assert(uploadParsed.url.startsWith("gs://"), `Expected gs:// URL, got ${uploadParsed.url}`);

  // Step 2: Analyze the uploaded PDF
  const analyzeRes = await fetch(MCP_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(
      jsonRpcRequest(
        "tools/call",
        {
          name: "analyze_pdf",
          arguments: {
            pdf_source: uploadParsed.url,
            queries: ["What is in this document?"],
          },
        },
        5
      )
    ),
  });
  assert(analyzeRes.status === 200, `Analyze: expected 200, got ${analyzeRes.status}`);

  const analyzeData = await parseMcpResponse(analyzeRes);
  assert(
    analyzeData.error === undefined,
    `Analyze JSON-RPC error: ${JSON.stringify(analyzeData.error)}`
  );

  const analyzeResult = analyzeData.result as Record<string, unknown>;
  const analyzeContent = analyzeResult.content as Array<Record<string, unknown>>;
  const analyzeParsed = JSON.parse(analyzeContent[0].text as string);
  assert(Array.isArray(analyzeParsed.responses), "Missing responses array in analyze result");
  assert(
    analyzeParsed.responses.length === 1,
    `Expected 1 response, got ${analyzeParsed.responses.length}`
  );
});

// ---------------------------------------------------------------------------
// Test 6: Anthropic Vertex (manual)
// ---------------------------------------------------------------------------
// This test requires redeploying the service with PDF_ANALYZER_PROVIDER=anthropic-vertex.
// It is documented here for completeness but skipped in automated runs.
// To run manually:
//   1. Redeploy with PDF_ANALYZER_PROVIDER=anthropic-vertex
//   2. Set CLOUD_RUN_URL and E2E_TEST_ANTHROPIC=1
//   3. Run this script

if (process.env.E2E_TEST_ANTHROPIC === "1") {
  await test("Analyze PDF with Anthropic Vertex", async () => {
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(
        jsonRpcRequest(
          "tools/call",
          {
            name: "analyze_pdf",
            arguments: {
              pdf_source: PUBLIC_PDF_URL,
              queries: ["What is this document about?"],
            },
          },
          6
        )
      ),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    const data = await parseMcpResponse(res);
    assert(data.error === undefined, `JSON-RPC error: ${JSON.stringify(data.error)}`);

    const result = data.result as Record<string, unknown>;
    const content = result.content as Array<Record<string, unknown>>;
    const parsed = JSON.parse(content[0].text as string);
    assert(Array.isArray(parsed.responses), "Missing responses array");
    assert(parsed.model.startsWith("claude-"), `Expected Claude model, got ${parsed.model}`);
  });
} else {
  console.log(
    "SKIP Test 6 (Anthropic Vertex): Set E2E_TEST_ANTHROPIC=1 after redeploying with anthropic-vertex provider"
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
