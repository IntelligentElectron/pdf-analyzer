/**
 * PDF Analyzer MCP Server
 *
 * Model Context Protocol server for analyzing PDF documents using Gemini API.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERSION } from "./version.js";
import { createGeminiClient, analyzePdf, isApiError, getApiErrorMessage } from "./service.js";

// =============================================================================
// Server Instructions
// =============================================================================

const SERVER_INSTRUCTIONS = `
# PDF Analyzer MCP Server

Analyzes PDF documents using Gemini's vision capabilities.

## Tool: analyze_pdf

Pass an absolute file path or URL and a list of queries. The server reads the PDF,
sends it to Gemini with your queries, and returns structured responses.

## Caching Strategy

The response includes a \`file_uri\` (Gemini File API URI) that you should reuse for subsequent
queries on the same document. This avoids re-uploading and is cached by Gemini for 48 hours.

**Input types accepted:**
- Local file path: \`/Users/name/docs/report.pdf\`
- Web URL: \`https://example.com/doc.pdf\`
- Gemini file URI: \`https://generativelanguage.googleapis.com/v1beta/files/abc123\` (from previous response)

**Workflow for multiple queries on same document:**
1. First call: pass local path or URL → receive \`file_uri\` in response
2. Subsequent calls: pass the \`file_uri\` as \`pdf_source\` → no re-upload, faster response

## Usage Tips

- Ask specific, focused queries for best results
- For multi-page PDFs, reference page numbers in queries when relevant
- Reuse the returned \`file_uri\` for follow-up questions on the same document

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
- Missing GEMINI_API_KEY: Set the environment variable with your API key
- PDF not found: Verify the path is absolute and file exists
- URL fetch failed: Check that the URL is accessible and points to a valid PDF

## Environment Variables

- GEMINI_API_KEY: Required. Get your key from https://aistudio.google.com/apikey
- PDF_MCP_NO_UPDATE: Set to "1" to disable auto-updates
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

/**
 * Create and configure the MCP server.
 */
export const createServer = (): McpServer => {
  const server = new McpServer(
    {
      name: "pdf-analyzer-mcp",
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
      description:
        "Analyze a PDF document using Gemini AI. Provide an absolute file path, URL, or Gemini file URI (from a previous response) and a list of questions to ask about the PDF content. Returns a file_uri that can be reused for subsequent queries on the same document (cached by Gemini for 48 hours).",
      inputSchema: {
        pdf_source: z
          .string()
          .describe(
            "PDF source: absolute local file path (e.g., /Users/name/docs/report.pdf), URL (e.g., https://example.com/doc.pdf), or Gemini file URI from a previous response (e.g., https://generativelanguage.googleapis.com/v1beta/files/abc123)"
          ),
        queries: z.array(z.string().min(1)).min(1).describe("Array of questions to ask about the PDF"),
      },
    },
    async ({ pdf_source, queries }) => {
      try {
        const client = createGeminiClient();
        const result = await analyzePdf(client, { pdf_source, queries });
        return formatResult(result);
      } catch (error) {
        // Handle typed Gemini API errors
        if (isApiError(error)) {
          const { message, details } = getApiErrorMessage(error);
          return formatError(message, details);
        }

        const message = error instanceof Error ? error.message : "Unknown error occurred";

        // Provide helpful context for common errors
        if (message.includes("GEMINI_API_KEY")) {
          return formatError(
            message,
            "Set the GEMINI_API_KEY environment variable in your MCP client configuration."
          );
        }

        if (message.includes("not found")) {
          return formatError(message, "Ensure the path is absolute and the file exists.");
        }

        if (message.includes("Failed to fetch PDF from URL")) {
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
 * Run the MCP server with stdio transport.
 */
export const runServer = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
