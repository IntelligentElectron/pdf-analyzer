import { GoogleGenAI, ApiError, ThinkingLevel } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  AnalyzePdfInput,
  AnalyzePdfResponse,
  ChunkedQueryResponse,
  QueryResponse,
} from "./types.js";
import { ChunkedGeminiResponseSchema, GeminiResponseSchema } from "./types.js";
import { pdfBytesToChunk, splitPdfInHalf } from "./chunker.js";
import type { PdfChunk } from "./chunker.js";

/**
 * Load environment variables from .env file in current working directory.
 * Only sets variables that are not already defined in process.env.
 */
function loadEnvFile(): void {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed
      .slice(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const GEMINI_MODEL = "gemini-3-pro-preview";

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
 * Returns the Gemini URI for use in subsequent calls.
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

/** Maximum chunk size for File API upload: 50MB × 0.85 safety margin */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 * 0.85;

/**
 * Ensure every query has an answer, filling gaps if the model missed some.
 */
function ensureAllQueriesAnswered(queries: string[], parsed: QueryResponse[]): QueryResponse[] {
  const responseMap = new Map(parsed.map((r) => [r.query, r.answer]));
  return queries.map((query, i) => {
    const existingAnswer = parsed[i];
    if (existingAnswer) {
      return existingAnswer;
    }
    return {
      query,
      answer: responseMap.get(query) || "No answer found for this query.",
    };
  });
}

/**
 * Direct single-file analysis path.
 * Uploads the PDF via File API and sends it to Gemini in one call.
 */
async function analyzePdfDirect(
  client: GoogleGenAI,
  source: string,
  queries: string[]
): Promise<AnalyzePdfResponse> {
  const fileUri = await uploadPdf(client, source);

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri, mimeType: "application/pdf" } },
          { text: buildUserPrompt(queries) },
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

  return {
    pdf_source: source,
    cached_uris: [fileUri],
    responses: ensureAllQueriesAnswered(queries, parsed.responses),
  };
}

/**
 * Upload raw PDF bytes to the Gemini File API.
 * Returns the Gemini URI for use in Gemini calls.
 */
async function uploadChunkBytes(client: GoogleGenAI, chunkBytes: Uint8Array): Promise<string> {
  const file = await client.files.upload({
    file: new Blob([chunkBytes], { type: "application/pdf" }),
    config: { mimeType: "application/pdf" },
  });

  if (!file.name || !file.uri) {
    throw new Error("Chunk upload failed: missing name or URI");
  }

  await waitForFileReady(client, file.name);
  return file.uri;
}

/**
 * Build system instruction for a chunk at a given position.
 * When `chunk` metadata is provided, page range info is included in the position line.
 */
function buildChunkedSystemInstruction(
  chunkIndex: number,
  totalChunks: number,
  previousFindings: string | null,
  chunk?: PdfChunk
): string {
  let position = `Processing chunk ${chunkIndex + 1} of ${totalChunks}`;
  if (chunk) {
    const pageRange = `pages ${chunk.startPage + 1}–${chunk.startPage + chunk.pageCount}`;
    position += ` (${pageRange} of ${chunk.totalPages} total)`;
  }
  position += ".";

  const base = `You are a document analysis assistant analyzing a large PDF that has been split into ${totalChunks} chunks.
${position}
For each question, provide a clear, detailed answer based on the content of this chunk.
Always cite page numbers from the original document when possible.`;

  const findingsInstruction = `
In addition to answering the queries, produce a "findings_summary" field that tracks:
- What has been found so far (with page citations)
- What is partially answered
- What remains unanswered`;

  if (chunkIndex === 0) {
    return `${base}
This is the first chunk. Some answers may be incomplete — that's expected.${findingsInstruction}`;
  }

  const previousContext = `
Here are the findings from the previous chunks:
<previous_findings>
${previousFindings}
</previous_findings>

Update your answers by combining the previous findings with any new information from this chunk.`;

  if (chunkIndex === totalChunks - 1) {
    return `${base}
This is the final chunk.${previousContext}
Provide final, comprehensive answers incorporating all findings across the entire document.${findingsInstruction}`;
  }

  return `${base}${previousContext}${findingsInstruction}`;
}

/**
 * Check if an error is a Gemini token limit error (input too large).
 */
function isTokenLimitError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status !== 400) return false;
  return error.message.includes("input token count exceeds");
}

/**
 * Process a work queue of PdfChunks, splitting on token limit errors.
 *
 * Algorithm:
 * 1. Shift a chunk from the queue
 * 2. Upload it and call Gemini
 * 3. On success: accumulate findings, collect cached_uri
 * 4. On token limit error: split the chunk in half, unshift both back
 * 5. Repeat until queue is empty
 */
async function processChunkQueue(
  client: GoogleGenAI,
  queue: PdfChunk[],
  queries: string[],
  pdfSource: string | string[]
): Promise<AnalyzePdfResponse> {
  let previousFindings: string | null = null;
  const fileUris: string[] = [];
  let processedCount = 0;

  // We don't know total chunks upfront (splitting changes it),
  // so we track completed chunks and estimate total as completed + remaining.
  while (queue.length > 0) {
    const chunk = queue.shift()!;
    const totalChunks = processedCount + 1 + queue.length;

    // Pre-split chunks that exceed File API upload limit
    if (chunk.bytes.byteLength > MAX_UPLOAD_BYTES) {
      const [firstHalf, secondHalf] = await splitPdfInHalf(chunk);
      queue.unshift(firstHalf, secondHalf);
      continue;
    }

    const fileUri = await uploadChunkBytes(client, chunk.bytes);

    const systemInstruction = buildChunkedSystemInstruction(
      processedCount,
      totalChunks,
      previousFindings,
      chunk
    );

    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri, mimeType: "application/pdf" } },
              { text: buildUserPrompt(queries) },
            ],
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: ChunkedGeminiResponseSchema,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        },
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText) as ChunkedQueryResponse;
      previousFindings = parsed.findings_summary;
      fileUris.push(fileUri);
      processedCount++;

      // On the last chunk, return the final responses
      if (queue.length === 0) {
        return {
          pdf_source: pdfSource,
          cached_uris: fileUris,
          responses: ensureAllQueriesAnswered(queries, parsed.responses),
        };
      }
    } catch (error) {
      if (!isTokenLimitError(error)) throw error;

      // Token limit hit — split this chunk and retry
      const [firstHalf, secondHalf] = await splitPdfInHalf(chunk);
      queue.unshift(firstHalf, secondHalf);
    }
  }

  // Unreachable — loop returns on last successful chunk
  throw new Error("No chunks to process");
}

/**
 * Process an array of cached Gemini file URIs with rolling findings.
 * Used for re-analysis of a previously chunked PDF.
 */
async function processCachedUris(
  client: GoogleGenAI,
  fileUris: string[],
  queries: string[]
): Promise<AnalyzePdfResponse> {
  let previousFindings: string | null = null;

  for (let i = 0; i < fileUris.length; i++) {
    const fileUri = fileUris[i];
    const systemInstruction = buildChunkedSystemInstruction(i, fileUris.length, previousFindings);

    const response = await client.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri, mimeType: "application/pdf" } },
            { text: buildUserPrompt(queries) },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: ChunkedGeminiResponseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      },
    });

    const responseText = response.text || "{}";
    const parsed = JSON.parse(responseText) as ChunkedQueryResponse;
    previousFindings = parsed.findings_summary;

    if (i === fileUris.length - 1) {
      return {
        pdf_source: fileUris,
        cached_uris: fileUris,
        responses: ensureAllQueriesAnswered(queries, parsed.responses),
      };
    }
  }

  throw new Error("No URIs to process");
}

/**
 * Read PDF bytes from a source (URL or local file).
 */
async function readPdfBytes(source: string): Promise<Buffer> {
  if (isUrl(source)) {
    return fetchPdfFromUrl(source);
  }
  validateLocalPath(source);
  return fs.readFileSync(source.trim());
}

/**
 * Analyzes a PDF document using Gemini.
 *
 * Routing:
 * - string[] → cached chunk URIs, sequential processing with rolling findings
 * - Gemini URI string → direct single-file analysis (no bytes to split)
 * - path/URL → read bytes, try full PDF first, split on token limit error
 */
export async function analyzePdf(
  client: GoogleGenAI,
  input: AnalyzePdfInput
): Promise<AnalyzePdfResponse> {
  const { pdf_source, queries } = input;

  // Array of cached Gemini file URIs — re-analysis path
  if (Array.isArray(pdf_source)) {
    return processCachedUris(client, pdf_source, queries);
  }

  // Single Gemini file URI — direct path, no splitting possible
  if (isGeminiFileUri(pdf_source)) {
    return analyzePdfDirect(client, pdf_source, queries);
  }

  // Path or URL — try the full PDF first via the direct path
  try {
    return await analyzePdfDirect(client, pdf_source, queries);
  } catch (error) {
    if (!isTokenLimitError(error)) throw error;
  }

  // Token limit exceeded — read bytes, split into chunks, and process via work queue
  const pdfBytes = await readPdfBytes(pdf_source);
  const initialChunk = await pdfBytesToChunk(new Uint8Array(pdfBytes));
  return processChunkQueue(client, [initialChunk], queries, pdf_source);
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
