import { describe, it, expect, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";
import { createServer } from "../server.js";
import { createRequestHandler } from "./http.js";

/**
 * Start an HTTP server that uses the exact production request handler.
 * Using createRequestHandler (and not a hand-rolled copy) ensures any change
 * in production routing is reflected in these tests.
 */
function startTestServer(): Promise<{ baseUrl: string; server: Server }> {
  return new Promise((resolve) => {
    const handler = createRequestHandler(() => createServer("http"));
    const server = createHttpServer(handler);

    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server });
    });
  });
}

let testServer: Server | null = null;

afterEach(() => {
  if (testServer) {
    testServer.close();
    testServer = null;
  }
});

describe("HTTP transport", () => {
  it("GET /health returns 200 ok", async () => {
    const { baseUrl, server } = await startTestServer();
    testServer = server;

    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("content-type")).toBe("text/plain");
  });

  it("GET /unknown returns 404", async () => {
    const { baseUrl, server } = await startTestServer();
    testServer = server;

    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
  });

  it("POST /mcp with initialize returns valid JSON-RPC", async () => {
    const { baseUrl, server } = await startTestServer();
    testServer = server;

    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });

    expect(res.status).toBe(200);
    // Response is SSE format; parse the JSON-RPC message from the event stream
    const text = await res.text();
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const body = JSON.parse(dataLine!.slice(6));
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result.serverInfo.name).toBe("pdf-analyzer");
  });

  // Regression: SDK clients probe GET /mcp for SSE streaming during session
  // setup. Before the fix, the handler only matched POST /mcp and returned
  // 404 for GET /mcp, which clients interpreted as "SDK auth failed: HTTP 404".
  // The handler must route any method on /mcp to the SDK transport.
  it("GET /mcp is routed to the SDK transport, not 404", async () => {
    const { baseUrl, server } = await startTestServer();
    testServer = server;

    const res = await fetch(`${baseUrl}/mcp`, { method: "GET" });
    // The SDK responds with 405 (method-not-allowed for stateless mode) or
    // 400 (bad request); the key assertion is that our router does NOT drop
    // the request to the 404 branch.
    expect(res.status).not.toBe(404);
  });

  it("DELETE /mcp is routed to the SDK transport, not 404", async () => {
    const { baseUrl, server } = await startTestServer();
    testServer = server;

    const res = await fetch(`${baseUrl}/mcp`, { method: "DELETE" });
    expect(res.status).not.toBe(404);
  });
});
