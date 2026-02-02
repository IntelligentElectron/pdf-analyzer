import { GoogleGenAI, ApiError, ThinkingLevel } from "@google/genai";
import { readFileSync, existsSync } from "node:fs";
import * as fs from "node:fs";
import * as path from "node:path";
import { join } from "node:path";
import type { AnalyzePdfInput, AnalyzePdfResponse, QueryResponse } from "./types.js";
import { GeminiResponseSchema } from "./types.js";

/**
 * Load environment variables from .env file in current working directory.
 * Only sets variables that are not already defined in process.env.
 */
function loadEnvFile(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const SYSTEM_INSTRUCTION = `You are a document analysis assistant. Analyze PDF documents and answer questions based on their content.
For each question, provide a clear, detailed answer based on the content of the PDF.
If the answer cannot be determined from the PDF, say so explicitly.
Always respond with accurate information from the document.`;

/** Gemini File API URI prefix */
const GEMINI_FILE_URI_PREFIX = "https://generativelanguage.googleapis.com/";

/**
 * Creates and returns a configured GoogleGenAI client.
 * Loads GEMINI_API_KEY from .env file if not already set in environment.
 */
export function createGeminiClient(): GoogleGenAI {
  loadEnvFile();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set. Get your key from https://aistudio.google.com/apikey");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Check if a string is a Gemini File API URI.
 */
export function isGeminiFileUri(source: string): boolean {
  return source.startsWith(GEMINI_FILE_URI_PREFIX);
}

/**
 * Check if a string is a URL (excluding Gemini File API URIs).
 */
export function isUrl(source: string): boolean {
  if (isGeminiFileUri(source)) {
    return false;
  }
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a local PDF file path.
 * Throws descriptive errors for common issues.
 */
export function validateLocalPath(pdfPath: string): void {
  const trimmedPath = pdfPath.trim();

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error(`PDF path must be absolute: ${trimmedPath}`);
  }

  if (!fs.existsSync(trimmedPath)) {
    throw new Error(`PDF file not found: ${trimmedPath}`);
  }

  const stats = fs.statSync(trimmedPath);
  if (stats.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${trimmedPath}`);
  }

  if (!trimmedPath.toLowerCase().endsWith(".pdf")) {
    throw new Error(`File is not a PDF: ${trimmedPath}`);
  }
}

/** Timeout for fetching PDFs from URLs (60 seconds) */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Fetch PDF content from a URL with timeout.
 */
async function fetchPdfFromUrl(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to fetch URL: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (
    contentType &&
    !contentType.includes("application/pdf") &&
    !contentType.includes("octet-stream")
  ) {
    throw new Error(`URL does not point to a PDF file. Content-Type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Wait for a file to finish processing.
 * Polls the file state until it's no longer PROCESSING.
 */
async function waitForFileReady(
  client: GoogleGenAI,
  fileName: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const fileInfo = await client.files.get({ name: fileName });
    if (fileInfo.state === "FAILED") {
      throw new Error(`File processing failed: ${fileInfo.name}`);
    }
    if (fileInfo.state !== "PROCESSING") {
      return; // File is ready (ACTIVE state)
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("File processing timed out");
}

/**
 * Upload a PDF to the Gemini File API, or return the URI if already a Gemini file.
 * Accepts local paths, web URLs, or Gemini File API URIs.
 * Returns the Gemini file_uri for use in subsequent calls.
 */
async function uploadPdf(client: GoogleGenAI, source: string): Promise<string> {
  // If already a Gemini file URI, return as-is (no upload needed)
  if (isGeminiFileUri(source)) {
    return source;
  }

  // Upload the file
  let file;
  if (isUrl(source)) {
    const pdfBuffer = await fetchPdfFromUrl(source);
    file = await client.files.upload({
      file: new Blob([pdfBuffer], { type: "application/pdf" }),
      config: { mimeType: "application/pdf" },
    });
  } else {
    validateLocalPath(source);
    file = await client.files.upload({
      file: source,
      config: { mimeType: "application/pdf" },
    });
  }

  if (!file.name || !file.uri) {
    throw new Error("File upload failed: missing name or URI");
  }

  // Wait for file to be ready
  await waitForFileReady(client, file.name);

  return file.uri;
}

/**
 * Build the user prompt with queries.
 */
function buildUserPrompt(queries: string[]): string {
  const queriesText = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Please analyze the attached PDF and answer these questions:\n\n${queriesText}`;
}

/**
 * Analyzes a PDF document using Gemini and returns responses to the provided queries.
 * Uses the File API for uploads and structured output for reliable JSON responses.
 * Returns the Gemini file_uri so calling agents can reuse it for subsequent queries.
 */
export async function analyzePdf(
  client: GoogleGenAI,
  input: AnalyzePdfInput
): Promise<AnalyzePdfResponse> {
  const fileUri = await uploadPdf(client, input.pdf_source);

  const response = await client.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri, mimeType: "application/pdf" } },
          { text: buildUserPrompt(input.queries) },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: GeminiResponseSchema,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  const responseText = response.text || "{}";
  const parsed = JSON.parse(responseText) as { responses: QueryResponse[] };

  // Ensure all queries have answers (in case model missed some)
  const responseMap = new Map(parsed.responses.map((r) => [r.query, r.answer]));
  const responses: QueryResponse[] = input.queries.map((query, i) => {
    const existingAnswer = parsed.responses[i];
    if (existingAnswer) {
      return existingAnswer;
    }
    return {
      query,
      answer: responseMap.get(query) || "No answer found for this query.",
    };
  });

  return {
    pdf_source: input.pdf_source,
    file_uri: fileUri,
    responses,
  };
}

/**
 * Check if an error is an ApiError and return typed error info.
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Get error message from ApiError, preserving the actual API response.
 */
export function getApiErrorMessage(error: ApiError): { message: string; details?: string } {
  return {
    message: `Gemini API error (HTTP ${error.status})`,
    details: error.message,
  };
}
