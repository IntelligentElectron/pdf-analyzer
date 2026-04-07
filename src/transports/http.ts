/**
 * Streamable HTTP transport for cloud deployments.
 *
 * Creates a stateless HTTP server that handles:
 * - POST /mcp       MCP protocol (Streamable HTTP)
 * - POST /analyze   Direct REST endpoint (no MCP overhead)
 * - GET  /health    Health check
 */

import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { analyzePdf } from "../service.js";
import { resolveActiveProvider } from "../providers/registry.js";

/**
 * Read the full request body as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

/**
 * Handle POST /analyze - direct REST endpoint.
 *
 * Request body: { "pdf_source": "...", "queries": ["..."] }
 * Response body: AnalyzePdfResponse JSON
 */
async function handleAnalyze(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req));
    const { pdf_source, queries } = body;
    if (!pdf_source || !queries || !Array.isArray(queries) || queries.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Required: pdf_source (string) and queries (string[])" }));
      return;
    }
    const { provider, apiKey, modelId } = await resolveActiveProvider();
    const result = await analyzePdf(provider, apiKey, modelId, { pdf_source, queries });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
}

/**
 * Start a stateless HTTP server for MCP over Streamable HTTP.
 */
export function startHttpServer(createMcpServer: () => McpServer, port: number): void {
  const httpServer = createHttpServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const server = createMcpServer();
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/analyze") {
      await handleAnalyze(req, res);
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
