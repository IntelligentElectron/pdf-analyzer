/**
 * Shared logic for Google Gemini and Google Vertex AI providers.
 *
 * Extracts: models, File API helpers, token limit detection, provider options.
 */

import { GoogleGenAI, ApiError } from "@google/genai";
import type { ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import { fetchPdfFromUrl, validateLocalPath } from "../pdf-utils.js";

export const GOOGLE_MODELS: ModelOption[] = [
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash",
    hint: "Fast and cost-effective",
  },
  { id: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro", hint: "Best and most expensive" },
];

export const GOOGLE_DEFAULT_MODEL = "gemini-3.1-pro-preview";

export const GOOGLE_PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingLevel: "low" } },
};

/**
 * Wait for a file to finish processing on the Gemini File API.
 */
export async function waitForFileReady(
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
export async function uploadToFileApi(client: GoogleGenAI, data: Blob | string): Promise<string> {
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
 * Prepare a PDF source using a GoogleGenAI client (works for both API-key and Vertex ADC).
 */
export async function prepareGooglePdf(
  client: GoogleGenAI,
  source: PdfSource
): Promise<PreparedPdf> {
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
export function isGoogleTokenLimitError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 400 && error.message.includes("input token count exceeds");
  }
  if (error instanceof Error) {
    return error.message.includes("input token count exceeds");
  }
  return false;
}
