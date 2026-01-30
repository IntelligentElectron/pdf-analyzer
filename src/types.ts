import { z } from "zod";
import { Type, type Schema } from "@google/genai";

/** Schema for the analyze_pdf tool input */
export const AnalyzePdfInputSchema = z.object({
  pdf_source: z.string().describe("PDF source: absolute local file path or URL"),
  queries: z.array(z.string().min(1)).min(1).describe("Array of questions to ask about the PDF"),
});

/** Input type for the analyze_pdf tool */
export type AnalyzePdfInput = z.infer<typeof AnalyzePdfInputSchema>;

/** Response for a single query */
export interface QueryResponse {
  query: string;
  answer: string;
}

/** Response from the analyze_pdf tool */
export interface AnalyzePdfResponse {
  pdf_source: string;
  file_uri: string;
  responses: QueryResponse[];
}

/**
 * Gemini response schema for structured output.
 * This ensures the model returns a predictable JSON structure.
 */
export const GeminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    responses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "The original question" },
          answer: { type: Type.STRING, description: "The answer based on PDF content" },
        },
        required: ["query", "answer"],
      },
      description: "Array of query-answer pairs",
    },
  },
  required: ["responses"],
};

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
