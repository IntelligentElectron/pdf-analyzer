/**
 * Google Vertex AI provider.
 *
 * Uses ADC (Application Default Credentials) instead of API keys.
 * Vertex AI does not support the Gemini File API, so PDFs are sent inline
 * as bytes (same approach as Anthropic). No caching.
 */

import { createVertex } from "@ai-sdk/google-vertex";
import type { ProviderConfig, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import {
  GOOGLE_MODELS,
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_PROVIDER_OPTIONS,
  isGoogleTokenLimitError,
} from "./google-shared.js";
import { fetchPdfFromUrl, readPdfBytes } from "../pdf-utils.js";

function getProject(): string {
  const p = process.env.VERTEX_PROJECT;
  if (!p) throw new Error("VERTEX_PROJECT env var is required for Google Vertex AI provider.");
  return p;
}

function getLocation(): string {
  return process.env.VERTEX_LOCATION || "us-central1";
}

async function preparePdf(source: PdfSource): Promise<PreparedPdf> {
  if (source.kind === "cachedUri") {
    throw new Error("Cached URIs are not supported with the Vertex AI provider.");
  }

  let bytes: Uint8Array;

  if (source.kind === "bytes") {
    bytes = source.bytes;
  } else if (source.kind === "url") {
    bytes = new Uint8Array(await fetchPdfFromUrl(source.url));
  } else {
    bytes = new Uint8Array(readPdfBytes(source.path));
  }

  const part: PdfFilePart = {
    type: "file",
    data: bytes,
    mediaType: "application/pdf",
  };
  return { fileParts: [part], cachedUri: null };
}

export const vertexProvider: ProviderConfig = {
  id: "google-vertex",
  displayName: "Google Vertex AI",
  models: GOOGLE_MODELS,
  defaultModel: GOOGLE_DEFAULT_MODEL,
  apiKeyUrl: "",
  createModel: (apiKey: string, modelId: string) => {
    const vertex = createVertex({
      project: getProject(),
      location: getLocation(),
      ...(apiKey ? { googleAuthOptions: { keyFile: apiKey } } : {}),
    });
    return vertex(modelId);
  },
  providerOptions: GOOGLE_PROVIDER_OPTIONS,
  preparePdf,
  isTokenLimitError: isGoogleTokenLimitError,
};
