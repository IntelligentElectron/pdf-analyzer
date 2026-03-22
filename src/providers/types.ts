import type { LanguageModel } from "ai";

/**
 * A file content part compatible with the AI SDK message format.
 */
export interface PdfFilePart {
  type: "file";
  data: Uint8Array | URL;
  mediaType: "application/pdf";
}

/**
 * A prepared PDF ready for inclusion in an AI SDK message.
 */
export interface PreparedPdf {
  /** Content parts to include in the AI SDK user message. */
  fileParts: PdfFilePart[];
  /** Gemini File API URI for caching (Google only; null for others). */
  cachedUri: string | null;
}

/**
 * Source of a PDF to analyze. Discriminated union by `kind`.
 */
export type PdfSource =
  | { kind: "path"; path: string }
  | { kind: "url"; url: string }
  | { kind: "bytes"; bytes: Uint8Array }
  | { kind: "cachedUri"; uri: string };

/**
 * A model option available for selection during setup.
 */
export interface ModelOption {
  /** Model ID passed to the AI SDK, e.g. "gemini-3.1-pro-preview". */
  id: string;
  /** Display name shown in the setup TUI. */
  displayName: string;
  /** Short hint shown next to the model name. */
  hint: string;
}

/**
 * Configuration for an LLM provider.
 * Each provider exports a plain object satisfying this interface.
 */
export interface ProviderConfig {
  /** Provider identifier, e.g. "google", "anthropic", "openai". */
  id: string;
  /** Display name shown during setup. */
  displayName: string;
  /** Available models for this provider. */
  models: ModelOption[];
  /** Default (flagship) model ID, used as fallback. */
  defaultModel: string;
  /** URL where the user obtains an API key. */
  apiKeyUrl: string;
  /** Create an AI SDK LanguageModel instance for the given model ID. */
  createModel: (apiKey: string, modelId: string) => LanguageModel;
  /** Provider-specific options for generateText (e.g. thinking/reasoning config). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions: Record<string, any>;
  /** Prepare a PDF source for inclusion in an LLM call. */
  preparePdf: (source: PdfSource, apiKey: string) => Promise<PreparedPdf>;
  /** Check if an error indicates input token limit exceeded (triggers chunking). */
  isTokenLimitError: (error: unknown) => boolean;
}
