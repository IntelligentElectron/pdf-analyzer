/**
 * Anthropic via Google Vertex AI provider.
 *
 * Uses ADC (Application Default Credentials) via the @ai-sdk/google-vertex/anthropic subpath.
 * Shares models, preparePdf (inline bytes), and error detection with the direct Anthropic provider.
 */

import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import type { ProviderConfig, ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
import { fetchPdfFromUrl, readPdfBytes } from "../pdf-utils.js";

const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    hint: "Fast and cost-effective",
  },
  { id: "claude-opus-4-6", displayName: "Claude Opus 4.6", hint: "Best and most expensive" },
];

const DEFAULT_MODEL = "claude-opus-4-6";

function getProject(): string {
  const p = process.env.VERTEX_PROJECT;
  if (!p) throw new Error("VERTEX_PROJECT env var is required for Anthropic Vertex AI provider.");
  return p;
}

function getLocation(): string {
  return process.env.VERTEX_LOCATION || "us-central1";
}

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
    bytes = new Uint8Array(readPdfBytes(source.path));
  }

  const part: PdfFilePart = {
    type: "file",
    data: bytes,
    mediaType: "application/pdf",
  };
  return { fileParts: [part], cachedUri: null };
}

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

export const anthropicVertexProvider: ProviderConfig = {
  id: "anthropic-vertex",
  displayName: "Anthropic via Vertex AI",
  models: MODELS,
  defaultModel: DEFAULT_MODEL,
  apiKeyUrl: "",
  createModel: (apiKey: string, modelId: string) => {
    const client = createVertexAnthropic({
      project: getProject(),
      location: getLocation(),
      ...(apiKey ? { googleAuthOptions: { keyFile: apiKey } } : {}),
    });
    return client(modelId);
  },
  providerOptions: {},
  preparePdf,
  isTokenLimitError,
};
