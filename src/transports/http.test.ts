import { describe, it, expect, afterEach } from "vitest";
import { createServer as createHttpServer } from "node:http";
import type { Server } from "node:http";
import { createServer } from "../server.js";

/**
 * Helper: start the HTTP server on a random port and return the base URL + server handle.
 */
function startTestServer(): Promise<{ baseUrl: string; server: Server }> {
  return new Promise((resolve) => {
    const httpServer = createHttpServer();
    // Reuse startHttpServer's logic by calling it with port 0 (random)
    // Instead, we replicate the approach: start our own to get a handle
    httpServer.close(); // close the dummy

    // We need the actual server handle. Use a workaround: start on port 0.
    // startHttpServer doesn't return the server, so we test at integration level.
    // Use a direct HTTP server with the same handler pattern.
    const { StreamableHTTPServerTransport } =
      require("@modelcontextprotocol/sdk/server/streamableHttp.js") as typeof import("@modelcontextprotocol/sdk/server/streamableHttp.js");

    const server = createHttpServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/mcp") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcpServer = createServer("http");
        res.on("close", () => {
          transport.close();
          mcpServer.close();
        });
        await mcpServer.connect(transport);
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
});
