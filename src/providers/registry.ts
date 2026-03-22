/**
 * Provider registry.
 *
 * Maps provider IDs to their configurations and resolves
 * the active provider from the OS credential store.
 */

import type { ProviderConfig } from "./types.js";
import { googleProvider } from "./google.js";
import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
import { getActiveProvider as getStoredProvider, getApiKey, getModel } from "../keychain.js";

/** All supported providers, keyed by ID. */
export const providers: Record<string, ProviderConfig> = {
  google: googleProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

/** Ordered list for display in the setup menu. */
export const providerList: ProviderConfig[] = [googleProvider, anthropicProvider, openaiProvider];

/**
 * Resolve the active provider and API key from the credential store.
 * Returns the provider config and the API key.
 *
 * Throws if no provider is configured or the API key is missing.
 */
export function resolveActiveProvider(): {
  provider: ProviderConfig;
  apiKey: string;
  modelId: string;
} {
  const providerId = getStoredProvider();
  const apiKey = getApiKey();

  if (!providerId) {
    throw new Error(
      "No provider configured. Run `pdf-analyzer --setup` to choose a provider and set your API key."
    );
  }

  const provider = providers[providerId];

  if (!provider) {
    throw new Error(
      `Unknown provider "${providerId}". Run \`pdf-analyzer --setup\` to reconfigure.`
    );
  }

  if (!apiKey) {
    throw new Error(
      `API key not found for ${provider.displayName}. Run \`pdf-analyzer --setup\` to set your API key.`
    );
  }

  const storedModel = getModel();
  const modelId =
    storedModel && provider.models.some((m) => m.id === storedModel)
      ? storedModel
      : provider.defaultModel;

  return { provider, apiKey, modelId };
}
