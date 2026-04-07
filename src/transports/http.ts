/**
 * Streamable HTTP transport for cloud deployments.
 *
 * Creates a stateless HTTP server that handles MCP protocol messages
 * at POST /mcp and provides a health check at GET /health.
 */

import { createServer as createHttpServer } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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
