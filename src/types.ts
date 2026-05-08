import { z } from "zod";

/** Field schemas for the analyze_pdf tool input. Shared between MCP and HTTP. */
export const AnalyzePdfInputShape = {
  pdf_source: z
    .union([z.string(), z.array(z.string().min(1)).min(1)])
    .describe(
      "PDF source: absolute local file path, URL, cached file URI from a previous response (Google only), or array of cached file URIs from a previous chunked response (Google only)"
    ),
  queries: z.array(z.string().min(1)).min(1).describe("Array of questions to ask about the PDF"),
};

/** Schema for the analyze_pdf tool input */
export const AnalyzePdfInputSchema = z.object(AnalyzePdfInputShape);

/** Input type for the analyze_pdf tool */
export type AnalyzePdfInput = z.infer<typeof AnalyzePdfInputSchema>;

/** Response for a single query */
export interface QueryResponse {
  query: string;
  answer: string;
}

/** Response from the analyze_pdf tool */
export interface AnalyzePdfResponse {
  model: string;
  pdf_source: string | string[];
  cached_uris: string[];
  responses: QueryResponse[];
}

/**
 * Zod schema for structured LLM output (single PDF).
 * Used with AI SDK's Output.object().
 */
export const ResponseSchema = z.object({
  responses: z.array(
    z.object({
      query: z.string().describe("The original question"),
      answer: z.string().describe("The answer based on PDF content"),
    })
  ),
});

/**
 * Zod schema for structured LLM output (chunked PDF).
 * Extends the base schema with rolling findings.
 */
export const ChunkedResponseSchema = ResponseSchema.extend({
  findings_summary: z
    .string()
    .describe(
      "Summary of findings so far across all processed chunks. Include page citations, partial answers, and what remains unanswered."
    ),
});

/** Inferred type for chunked response */
export type ChunkedQueryResponse = z.infer<typeof ChunkedResponseSchema>;

/** Error response from the tool */
export interface ToolError {
  error: string;
  details?: string;
}

/** GitHub release asset information */
export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** GitHub release information */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubAsset[];
}

/** Platform and architecture identifier for binary downloads */
export type Platform = "darwin-arm64" | "darwin-x64" | "linux-arm64" | "linux-x64" | "windows-x64";
