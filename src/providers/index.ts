/**
 * Public entry point for provider configurations and types.
 */

export { googleProvider, isGeminiFileUri } from "./google.js";
export { anthropicProvider } from "./anthropic.js";
export { openaiProvider } from "./openai.js";
export { providers, providerList, resolveActiveProvider } from "./registry.js";
export type { ProviderConfig, ModelOption, PdfSource, PreparedPdf, PdfFilePart } from "./types.js";
