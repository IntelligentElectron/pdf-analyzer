/**
 * Google Vertex AI provider.
 *
 * Uses ADC (Application Default Credentials) instead of API keys.
 * Shares models, File API logic, and provider options with the direct Google provider.
 */

import { GoogleGenAI } from "@google/genai";
import { createVertex } from "@ai-sdk/google-vertex";
import type { ProviderConfig, PdfSource, PreparedPdf } from "./types.js";
import {
  GOOGLE_MODELS,
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_PROVIDER_OPTIONS,
  prepareGooglePdf,
  isGoogleTokenLimitError,
} from "./google-shared.js";

function getProject(): string {
  const p = process.env.VERTEX_PROJECT;
  if (!p) throw new Error("VERTEX_PROJECT env var is required for Google Vertex AI provider.");
  return p;
}

function getLocation(): string {
  return process.env.VERTEX_LOCATION || "us-central1";
}

async function preparePdf(source: PdfSource): Promise<PreparedPdf> {
  const client = new GoogleGenAI({
    vertexai: true,
    project: getProject(),
    location: getLocation(),
  });
  return prepareGooglePdf(client, source);
}

export const vertexProvider: ProviderConfig = {
  id: "google",
  displayName: "Google Vertex AI",
  models: GOOGLE_MODELS,
  defaultModel: GOOGLE_DEFAULT_MODEL,
  apiKeyUrl: "",
  createModel: (_apiKey: string, modelId: string) => {
    const vertex = createVertex({
      project: getProject(),
      location: getLocation(),
    });
    return vertex(modelId);
  },
  providerOptions: GOOGLE_PROVIDER_OPTIONS,
  preparePdf,
  isTokenLimitError: isGoogleTokenLimitError,
};
