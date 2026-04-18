/**
 * Anthropic Claude provider.
 *
 * Sends PDFs inline as base64/bytes content parts.
 * No File API, no caching.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderConfig, ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import { fetchPdfFromUrl, readPdfBytes } from "../pdf-utils.js";

const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    hint: "Fast and cost-effective",
  },
  { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", hint: "Previous flagship" },
  { id: "claude-opus-4-7", displayName: "Claude Opus 4.7", hint: "Best and most expensive" },
];

const DEFAULT_MODEL = "claude-opus-4-7";

/**
 * Prepare a PDF source for Anthropic by reading bytes inline.
 */
async function preparePdf(source: PdfSource): Promise<PreparedPdf> {
  if (source.kind === "cachedUri") {
    throw new Error("Cached URIs are only supported with the Google provider.");
  }

  let bytes: Uint8Array;

  if (source.kind === "bytes") {
    bytes = source.bytes;
  } else if (source.kind === "url") {
    bytes = new Uint8Array(await fetchPdfFromUrl(source.url));
  } else {
    bytes = new Uint8Array(await readPdfBytes(source.path));
  }

  const part: PdfFilePart = {
    type: "file",
    data: bytes,
    mediaType: "application/pdf",
  };
  return { fileParts: [part], cachedUri: null };
}

/**
 * Check if an error is an Anthropic token limit error.
 */
function isTokenLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("too many input tokens") ||
    msg.includes("prompt is too long") ||
    msg.includes("maximum context length") ||
    msg.includes("maximum of 100 pdf pages") ||
    msg.includes("pdf pages may be provided")
  );
}

export const anthropicProvider: ProviderConfig = {
  id: "anthropic",
  displayName: "Anthropic Claude",
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  apiKeyUrl: "https://console.anthropic.com/settings/keys",
  createModel: (apiKey: string, modelId: string) => {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId);
  },
  providerOptions: {},
  preparePdf,
  isTokenLimitError,
};
