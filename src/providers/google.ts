/**
 * Google Gemini provider.
 *
 * Uses the Gemini File API for uploading PDFs (supports large files and caching),
 * and the Vercel AI SDK for LLM calls.
 */

import { GoogleGenAI, ApiError } from "@google/genai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderConfig, ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import { fetchPdfFromUrl, validateLocalPath } from "../pdf-utils.js";

const MODELS: ModelOption[] = [
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash",
    hint: "Fast and cost-effective",
  },
  { id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro", hint: "Best and most expensive" },
];

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

/** Gemini File API URI prefix. */
const GEMINI_FILE_URI_PREFIX = "https://generativelanguage.googleapis.com/";

/**
 * Check if a string is a Gemini File API URI.
 */
export function isGeminiFileUri(source: string): boolean {
  return source.startsWith(GEMINI_FILE_URI_PREFIX);
}

/**
 * Wait for a file to finish processing on the Gemini File API.
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
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("File processing timed out");
}

/**
 * Upload a PDF to the Gemini File API.
 * Returns the Gemini File API URI.
 */
async function uploadToFileApi(client: GoogleGenAI, data: Blob | string): Promise<string> {
  const file = await client.files.upload(
    typeof data === "string"
      ? { file: data, config: { mimeType: "application/pdf" } }
      : { file: data, config: { mimeType: "application/pdf" } }
  );

  if (!file.name || !file.uri) {
    throw new Error("File upload failed: missing name or URI");
  }

  await waitForFileReady(client, file.name);
  return file.uri;
}

/**
 * Prepare a PDF source for Google Gemini.
 * Uploads to the File API and returns a URL-based file part.
 */
async function preparePdf(source: PdfSource, apiKey: string): Promise<PreparedPdf> {
  const client = new GoogleGenAI({ apiKey });

  if (source.kind === "cachedUri") {
    const part: PdfFilePart = {
      type: "file",
      data: new URL(source.uri),
      mediaType: "application/pdf",
    };
    return { fileParts: [part], cachedUri: source.uri };
  }

  let fileUri: string;

  if (source.kind === "bytes") {
    const blob = new Blob([source.bytes], { type: "application/pdf" });
    fileUri = await uploadToFileApi(client, blob);
  } else if (source.kind === "url") {
    const pdfBuffer = await fetchPdfFromUrl(source.url);
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    fileUri = await uploadToFileApi(client, blob);
  } else {
    validateLocalPath(source.path);
    fileUri = await uploadToFileApi(client, source.path);
  }

  const part: PdfFilePart = {
    type: "file",
    data: new URL(fileUri),
    mediaType: "application/pdf",
  };
  return { fileParts: [part], cachedUri: fileUri };
}

/**
 * Check if an error is a Gemini token limit error.
 */
function isTokenLimitError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 400 && error.message.includes("input token count exceeds");
  }
  if (error instanceof Error) {
    return error.message.includes("input token count exceeds");
  }
  return false;
}

export const googleProvider: ProviderConfig = {
  id: "google",
  displayName: "Google Gemini",
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  apiKeyUrl: "https://aistudio.google.com/apikey",
  createModel: (apiKey: string, modelId: string) => {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  },
  providerOptions: {
    google: { thinkingConfig: { thinkingLevel: "low" } },
  },
  preparePdf,
  isTokenLimitError,
};
