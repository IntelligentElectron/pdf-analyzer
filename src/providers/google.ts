/**
 * Google Gemini provider.
 *
 * Uses the Gemini File API for uploading PDFs (supports large files and caching),
 * and the Vercel AI SDK for LLM calls.
 */

import { GoogleGenAI } from "@google/genai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderConfig, PdfSource, PreparedPdf } from "./types.js";
import {
  GOOGLE_MODELS,
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_PROVIDER_OPTIONS,
  prepareGooglePdf,
  isGoogleTokenLimitError,
} from "./google-shared.js";

/** Gemini File API URI prefix. */
const GEMINI_FILE_URI_PREFIX = "https://generativelanguage.googleapis.com/";

/**
 * Check if a string is a Gemini File API URI.
 */
export function isGeminiFileUri(source: string): boolean {
  return source.startsWith(GEMINI_FILE_URI_PREFIX);
}

async function preparePdf(source: PdfSource, apiKey: string): Promise<PreparedPdf> {
  const client = new GoogleGenAI({ apiKey });
  return prepareGooglePdf(client, source);
}

export const googleProvider: ProviderConfig = {
  id: "google",
  displayName: "Google Gemini",
  models: GOOGLE_MODELS,
  defaultModel: GOOGLE_DEFAULT_MODEL,
  apiKeyUrl: "https://aistudio.google.com/apikey",
  createModel: (apiKey: string, modelId: string) => {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelId);
  },
  providerOptions: GOOGLE_PROVIDER_OPTIONS,
  preparePdf,
  isTokenLimitError: isGoogleTokenLimitError,
};
