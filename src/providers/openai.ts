/**
 * OpenAI provider.
 *
 * Sends PDFs inline as bytes content parts.
 * No File API, no caching.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderConfig, ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import { fetchPdfFromUrl, readPdfBytes } from "../pdf-utils.js";

const MODELS: ModelOption[] = [
  {
    id: "gpt-5.4-mini",
    displayName: "GPT-5.4 Mini",
    hint: "Fast and cost-effective",
  },
  { id: "gpt-5.4", displayName: "GPT-5.4", hint: "Best and most expensive" },
];

const DEFAULT_MODEL = "gpt-5.4";

/**
 * Prepare a PDF source for OpenAI by reading bytes inline.
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
 * Check if an error is an OpenAI token limit error.
 */
function isTokenLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("maximum context length") ||
    msg.includes("exceeds the context window") ||
    msg.includes("too many tokens") ||
    msg.includes("request too large")
  );
}

export const openaiProvider: ProviderConfig = {
  id: "openai",
  displayName: "OpenAI GPT",
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  apiKeyUrl: "https://platform.openai.com/api-keys",
  createModel: (apiKey: string, modelId: string) => {
    const openai = createOpenAI({ apiKey });
    return openai(modelId);
  },
  providerOptions: {
    openai: { reasoningEffort: "low" },
  },
  preparePdf,
  isTokenLimitError,
};
