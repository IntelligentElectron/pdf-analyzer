import { generateText, Output } from "ai";
import { z } from "zod";
import type { AnalyzePdfInput, AnalyzePdfResponse, QueryResponse } from "./types.js";
import { ResponseSchema, ChunkedResponseSchema } from "./types.js";
import { pdfBytesToChunk, splitPdfInHalf } from "./chunker.js";
import type { PdfChunk } from "./chunker.js";
import type { ProviderConfig, PdfSource, PreparedPdf } from "./providers/types.js";
import { isGeminiFileUri, isUrl, fetchPdfFromUrl, readPdfBytes } from "./pdf-utils.js";

const SYSTEM_INSTRUCTION = `You are a document analysis assistant. Analyze PDF documents and answer questions based on their content.
For each question, provide a clear, detailed answer based on the content of the PDF.
If the answer cannot be determined from the PDF, say so explicitly.
Always respond with accurate information from the document.`;

/**
 * Build the user prompt with queries.
 */
function buildUserPrompt(queries: string[]): string {
  const queriesText = queries.map((q, i) => `${i + 1}. ${q}`).join("\n");
  return `Please analyze the attached PDF and answer these questions:\n\n${queriesText}`;
}

/**
 * Call the LLM with a prepared PDF and return the parsed response.
 */
async function callLlm<T>(
  provider: ProviderConfig,
  apiKey: string,
  modelId: string,
  prepared: PreparedPdf,
  queries: string[],
  systemInstruction: string,
  schema: z.ZodType<T>
): Promise<{ parsed: T; cachedUri: string | null }> {
  const model = provider.createModel(apiKey, modelId);
  const { text } = await generateText({
    model,
    system: systemInstruction,
    output: Output.object({ schema }),
    providerOptions: provider.providerOptions,
    messages: [
      {
        role: "user",
        content: [...prepared.fileParts, { type: "text" as const, text: buildUserPrompt(queries) }],
      },
    ],
  });

  const responseText = text ?? "{}";
  const parsed = JSON.parse(responseText) as T;
  return { parsed, cachedUri: prepared.cachedUri };
}

/** Maximum chunk size for File API upload: 50MB x 0.85 safety margin. */
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
 * Prepares the PDF via the provider and sends it to the LLM in one call.
 */
async function analyzePdfDirect(
  provider: ProviderConfig,
  apiKey: string,
  modelId: string,
  source: PdfSource,
  queries: string[]
): Promise<AnalyzePdfResponse> {
  const prepared = await provider.preparePdf(source, apiKey);
  const { parsed, cachedUri } = await callLlm(
    provider,
    apiKey,
    modelId,
    prepared,
    queries,
    SYSTEM_INSTRUCTION,
    ResponseSchema
  );

  const pdfSourceValue =
    source.kind === "cachedUri"
      ? source.uri
      : source.kind === "path"
        ? source.path
        : source.kind === "url"
          ? source.url
          : "bytes";

  return {
    model: modelId,
    pdf_source: pdfSourceValue,
    cached_uris: cachedUri ? [cachedUri] : [],
    responses: ensureAllQueriesAnswered(queries, parsed.responses),
  };
}

/**
 * Build system instruction for a chunk at a given position.
 */
function buildChunkedSystemInstruction(
  chunkIndex: number,
  totalChunks: number,
  previousFindings: string | null,
  chunk?: PdfChunk
): string {
  let position = `Processing chunk ${chunkIndex + 1} of ${totalChunks}`;
  if (chunk) {
    const pageRange = `pages ${chunk.startPage + 1}\u2013${chunk.startPage + chunk.pageCount}`;
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
This is the first chunk. Some answers may be incomplete \u2014 that's expected.${findingsInstruction}`;
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
 * Process a work queue of PdfChunks, splitting on token limit errors.
 */
async function processChunkQueue(
  provider: ProviderConfig,
  apiKey: string,
  modelId: string,
  queue: PdfChunk[],
  queries: string[],
  pdfSource: string | string[]
): Promise<AnalyzePdfResponse> {
  let previousFindings: string | null = null;
  const cachedUris: string[] = [];
  let processedCount = 0;

  while (queue.length > 0) {
    const chunk = queue.shift()!;
    const totalChunks = processedCount + 1 + queue.length;

    // Pre-split chunks that exceed upload limit
    if (chunk.bytes.byteLength > MAX_UPLOAD_BYTES) {
      const [firstHalf, secondHalf] = await splitPdfInHalf(chunk);
      queue.unshift(firstHalf, secondHalf);
      continue;
    }

    const prepared = await provider.preparePdf({ kind: "bytes", bytes: chunk.bytes }, apiKey);

    const systemInstruction = buildChunkedSystemInstruction(
      processedCount,
      totalChunks,
      previousFindings,
      chunk
    );

    try {
      const { parsed, cachedUri } = await callLlm(
        provider,
        apiKey,
        modelId,
        prepared,
        queries,
        systemInstruction,
        ChunkedResponseSchema
      );
      previousFindings = parsed.findings_summary;
      if (cachedUri) {
        cachedUris.push(cachedUri);
      }
      processedCount++;

      if (queue.length === 0) {
        return {
          model: modelId,
          pdf_source: pdfSource,
          cached_uris: cachedUris,
          responses: ensureAllQueriesAnswered(queries, parsed.responses),
        };
      }
    } catch (error) {
      if (!provider.isTokenLimitError(error)) throw error;

      // Token limit hit, split this chunk and retry
      console.warn(`[chunker] Token limit exceeded (${chunk.pageCount} pages), splitting in half`);
      const [firstHalf, secondHalf] = await splitPdfInHalf(chunk);
      queue.unshift(firstHalf, secondHalf);
    }
  }

  throw new Error("No chunks to process");
}

/**
 * Process an array of cached Gemini file URIs with rolling findings.
 * Used for re-analysis of a previously chunked PDF (Google provider only).
 */
async function processCachedUris(
  provider: ProviderConfig,
  apiKey: string,
  modelId: string,
  fileUris: string[],
  queries: string[]
): Promise<AnalyzePdfResponse> {
  let previousFindings: string | null = null;

  for (let i = 0; i < fileUris.length; i++) {
    const prepared = await provider.preparePdf({ kind: "cachedUri", uri: fileUris[i] }, apiKey);
    const systemInstruction = buildChunkedSystemInstruction(i, fileUris.length, previousFindings);

    const { parsed } = await callLlm(
      provider,
      apiKey,
      modelId,
      prepared,
      queries,
      systemInstruction,
      ChunkedResponseSchema
    );
    previousFindings = parsed.findings_summary;

    if (i === fileUris.length - 1) {
      return {
        model: modelId,
        pdf_source: fileUris,
        cached_uris: fileUris,
        responses: ensureAllQueriesAnswered(queries, parsed.responses),
      };
    }
  }

  throw new Error("No URIs to process");
}

/**
 * Download a PDF from a gs:// URI using the GCS client (ADC auth).
 */
async function downloadFromGcs(gcsUri: string): Promise<Uint8Array> {
  const withoutPrefix = gcsUri.slice(5);
  const slashIndex = withoutPrefix.indexOf("/");
  const bucket = withoutPrefix.slice(0, slashIndex);
  const objectPath = withoutPrefix.slice(slashIndex + 1);
  const { Storage } = await import("@google-cloud/storage");
  const storage = new Storage();
  const [buffer] = await storage.bucket(bucket).file(objectPath).download();
  return new Uint8Array(buffer);
}

/**
 * Resolve a non-cached PdfSource to raw bytes for chunking.
 * The exhaustive switch catches at compile time if a new source kind is added
 * without being handled here.
 */
export async function resolveSourceBytes(
  source: Exclude<PdfSource, { kind: "cachedUri" }>
): Promise<Uint8Array> {
  switch (source.kind) {
    case "url":
      return new Uint8Array(await fetchPdfFromUrl(source.url));
    case "bytes":
      return source.bytes;
    case "path":
      return new Uint8Array(readPdfBytes(source.path));
  }
}

/**
 * Classify a PDF source string into a typed PdfSource union.
 */
export function classifySource(source: string): PdfSource {
  if (source.startsWith("gs://")) {
    // Marker kind: actual download happens in analyzePdf via downloadFromGcs
    return { kind: "url", url: source };
  }
  if (isGeminiFileUri(source)) {
    return { kind: "cachedUri", uri: source };
  }
  if (isUrl(source)) {
    return { kind: "url", url: source };
  }
  return { kind: "path", path: source };
}

/**
 * Analyzes a PDF document using the configured provider.
 *
 * Routing:
 * - string[] -> cached chunk URIs, sequential processing with rolling findings (Google only)
 * - Gemini URI string -> direct single-file analysis via cached URI (Google only)
 * - path/URL -> prepare via provider, try full PDF first, split on token limit error
 */
export async function analyzePdf(
  provider: ProviderConfig,
  apiKey: string,
  modelId: string,
  input: AnalyzePdfInput
): Promise<AnalyzePdfResponse> {
  const { pdf_source, queries } = input;

  // Array of cached Gemini file URIs, re-analysis path (Google only)
  if (Array.isArray(pdf_source)) {
    if (provider.id !== "google") {
      throw new Error("Cached URIs are only supported with the Google provider.");
    }
    return processCachedUris(provider, apiKey, modelId, pdf_source, queries);
  }

  // Download gs:// URIs via authenticated GCS client before classification
  const source: PdfSource =
    typeof pdf_source === "string" && pdf_source.startsWith("gs://")
      ? { kind: "bytes", bytes: await downloadFromGcs(pdf_source) }
      : classifySource(pdf_source);

  // Cached URI, direct path (Google only)
  if (source.kind === "cachedUri") {
    if (provider.id !== "google") {
      throw new Error("Cached URIs are only supported with the Google provider.");
    }
    return analyzePdfDirect(provider, apiKey, modelId, source, queries);
  }

  // Path or URL, try the full PDF first via the direct path
  try {
    return await analyzePdfDirect(provider, apiKey, modelId, source, queries);
  } catch (error) {
    if (!provider.isTokenLimitError(error)) throw error;
    console.warn(
      "[analyzePdf] Token limit exceeded for full PDF, falling back to chunked processing"
    );
  }

  // Token limit exceeded, read bytes, split into chunks, and process via work queue.
  // At this point source is "path", "url", or "bytes" (cachedUri was handled above).
  const pdfBytes = await resolveSourceBytes(source);
  const initialChunk = await pdfBytesToChunk(pdfBytes);
  return processChunkQueue(provider, apiKey, modelId, [initialChunk], queries, pdf_source);
}

// Re-export types and utilities used by other modules
export type { AnalyzePdfInput, AnalyzePdfResponse, QueryResponse } from "./types.js";
export { AnalyzePdfInputSchema } from "./types.js";
export { isGeminiFileUri, isUrl, validateLocalPath } from "./pdf-utils.js";
