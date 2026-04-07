/**
 * PDF Analyzer MCP Server
 *
 * Model Context Protocol server for analyzing PDF documents using
 * a configurable LLM provider (Google Gemini, Anthropic Claude, or OpenAI).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION } from "./version.js";
import { analyzePdf } from "./service.js";
import { resolveActiveProvider } from "./providers/registry.js";
// Cloud-only modules loaded lazily to avoid pulling in heavy deps in stdio mode.
// import { startHttpServer } from "./transports/http.js";

// =============================================================================
// Server Instructions
// =============================================================================

const SERVER_INSTRUCTIONS = `
# PDF Analyzer MCP Server

Analyzes PDF documents using AI vision capabilities. Supports multiple LLM providers
(Google Gemini, Anthropic Claude, OpenAI).

## Tool: analyze_pdf

Pass an absolute file path, URL, or cached file URI(s) and a list of queries. The server reads the PDF,
sends it to the configured LLM with your queries, and returns structured responses.

Large PDFs that exceed the model's token limit are automatically split into chunks and processed
sequentially with rolling context. No user intervention is needed.

## Caching Strategy (Google provider only)

When using Google Gemini, the response includes a \`cached_uris\` array (Gemini File API URIs)
that you should reuse for subsequent queries on the same document. This avoids re-uploading
and is cached by Gemini for 48 hours. Other providers return an empty \`cached_uris\` array.

**Input types accepted:**
- Local file path: \`/Users/name/docs/report.pdf\`
- Web URL: \`https://example.com/doc.pdf\`
- Gemini file URI: \`https://generativelanguage.googleapis.com/v1beta/files/abc123\` (Google only, from previous response)
- Array of Gemini file URIs: for re-analyzing a previously chunked document (Google only)

**Workflow for multiple queries on same document (Google provider):**
1. First call: pass local path or URL -> receive \`cached_uris\` in response
2. Subsequent calls: pass the \`cached_uris\` value as \`pdf_source\` -> no re-upload, faster response

## Usage Tips

- Ask specific, focused queries for best results
- For multi-page PDFs, reference page numbers in queries when relevant
- With Google provider, reuse the returned \`cached_uris\` for follow-up questions

## Example

\`\`\`json
{
  "pdf_source": "/path/to/document.pdf",
  "queries": [
    "What is the main topic of this document?",
    "List all the key findings mentioned",
    "What recommendations are made in the conclusion?"
  ]
}
\`\`\`

## Error Handling

Common errors and solutions:
- Missing provider/API key: Run \`pdf-analyzer --setup\` to choose a provider and store your API key
- PDF not found: Verify the path is absolute and file exists
- URL fetch failed: Check that the URL is accessible and points to a valid PDF
`.trim();

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a result as MCP tool response content.
 */
const formatResult = (result: unknown): { content: { type: "text"; text: string }[] } => {
  const text = JSON.stringify(result, null, 2);
  return {
    content: [{ type: "text", text }],
  };
};

/**
 * Format an error as MCP tool response content.
 */
const formatError = (
  error: string,
  details?: string
): { content: { type: "text"; text: string }[]; isError: true } => {
  const result = details ? { error, details } : { error };
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
};

// =============================================================================
// Server Setup
// =============================================================================

/** Tool description varies by transport mode. */
const ANALYZE_PDF_DESCRIPTION_STDIO =
  "Analyze a PDF document using AI. Provide an absolute file path, URL, cached file URI (from a previous response, Google only), or array of cached file URIs (from a previous chunked response, Google only) and a list of questions to ask about the PDF content. With the Google provider, returns a cached_uris array that can be reused for subsequent queries on the same document.";

const ANALYZE_PDF_DESCRIPTION_HTTP =
  "Analyze a PDF document using AI. Provide a URL, a gs:// URL returned by upload_pdf, cached file URI (from a previous response, Google only), or array of cached file URIs (from a previous chunked response, Google only) and a list of questions to ask about the PDF content. With the Google provider, returns a cached_uris array that can be reused for subsequent queries on the same document.";

/**
 * Create and configure the MCP server.
 */
export const createServer = (mode: "stdio" | "http" = "stdio"): McpServer => {
  const server = new McpServer(
    {
      name: "pdf-analyzer",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // -------------------------------------------------------------------------
  // Tool: analyze_pdf
  // -------------------------------------------------------------------------
  server.registerTool(
    "analyze_pdf",
    {
      description: mode === "http" ? ANALYZE_PDF_DESCRIPTION_HTTP : ANALYZE_PDF_DESCRIPTION_STDIO,
      inputSchema: {
        pdf_source: z
          .union([z.string(), z.array(z.string().min(1)).min(1)])
          .describe(
            "PDF source: absolute local file path, URL, cached file URI from a previous response (Google only), or array of cached file URIs from a previous chunked response (Google only)"
          ),
        queries: z
          .array(z.string().min(1))
          .min(1)
          .describe("Array of questions to ask about the PDF"),
      },
    },
    async ({ pdf_source, queries }) => {
      try {
        const { provider, apiKey, modelId } = await resolveActiveProvider();
        const result = await analyzePdf(provider, apiKey, modelId, { pdf_source, queries });
        return formatResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";

        if (message.includes("No provider configured") || message.includes("API key not found")) {
          return formatError(message);
        }

        if (message.includes("not found")) {
          return formatError(message, "Ensure the path is absolute and the file exists.");
        }

        if (message.includes("Failed to fetch")) {
          return formatError(
            message,
            "Check that the URL is accessible and points to a valid PDF file."
          );
        }

        return formatError(message);
      }
    }
  );

  return server;
};

/**
 * Run the MCP server.
 * Uses HTTP transport when PORT env var is set, otherwise stdio.
 */
export const runServer = async (): Promise<void> => {
  const port = process.env.PORT;
  if (port) {
    const { startHttpServer } = await import("./transports/http.js");
    startHttpServer(() => createServer("http"), parseInt(port, 10));
  } else {
    const server = createServer("stdio");
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
};
