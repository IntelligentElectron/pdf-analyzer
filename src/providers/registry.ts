/**
 * Provider registry.
 *
 * Maps provider IDs to their configurations and resolves
 * the active provider from env vars or the OS credential store.
 *
 * Precedence: env vars > keychain > error
 */

import type { ProviderConfig } from "./types.js";
import { googleProvider } from "./google.js";
import { anthropicProvider } from "./anthropic.js";
import { openaiProvider } from "./openai.js";
// Vertex providers are loaded lazily to avoid pulling in @ai-sdk/google-vertex in stdio mode.
// import { vertexProvider } from "./google-vertex.js";
// import { anthropicVertexProvider } from "./anthropic-vertex.js";
import {
  getActiveProvider as getStoredProvider,
  getApiKey,
  getModel,
  getVertexProject,
  getVertexLocation,
  getVertexKeyFile,
} from "../keychain.js";

/** Eagerly loaded providers (no cloud-only deps). */
const eagerProviders: Record<string, ProviderConfig> = {
  google: googleProvider,
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

/** Cache for lazily loaded vertex providers. */
let vertexProviders: Record<string, ProviderConfig> | null = null;

/**
 * Load vertex providers on demand.
 */
async function loadVertexProviders(): Promise<Record<string, ProviderConfig>> {
  if (vertexProviders) return vertexProviders;
  const [{ vertexProvider }, { anthropicVertexProvider }] = await Promise.all([
    import("./google-vertex.js"),
    import("./anthropic-vertex.js"),
  ]);
  vertexProviders = {
    "google-vertex": vertexProvider,
    "anthropic-vertex": anthropicVertexProvider,
  };
  return vertexProviders;
}

/** All supported providers, keyed by ID. Vertex providers are added lazily. */
export const providers: Record<string, ProviderConfig> = { ...eagerProviders };

/** Ordered list for display in the setup menu (API-key providers only). */
export const providerList: ProviderConfig[] = [googleProvider, anthropicProvider, openaiProvider];

/**
 * Full provider list including Vertex AI providers, for the --setup menu.
 * Vertex providers are lazy-loaded here (acceptable in CLI path).
 */
export async function getSetupProviderList(): Promise<ProviderConfig[]> {
  const vp = await loadVertexProviders();
  return [
    googleProvider,
    vp["google-vertex"],
    anthropicProvider,
    vp["anthropic-vertex"],
    openaiProvider,
  ];
}

/**
 * Look up a provider by ID, loading vertex providers lazily if needed.
 */
async function getProvider(providerId: string): Promise<ProviderConfig | undefined> {
  if (eagerProviders[providerId]) return eagerProviders[providerId];
  const vp = await loadVertexProviders();
  // Populate the exported providers map so downstream code sees them.
  Object.assign(providers, vp);
  return vp[providerId];
}

/**
 * Try resolving provider config from environment variables.
 * Returns null if PDF_ANALYZER_PROVIDER is not set.
 */
async function resolveFromEnv(): Promise<{
  provider: ProviderConfig;
  apiKey: string;
  modelId: string;
} | null> {
  const providerId = process.env.PDF_ANALYZER_PROVIDER;
  if (!providerId) return null;

  const provider = await getProvider(providerId);
  if (!provider) {
    const allIds = [...Object.keys(eagerProviders), "google-vertex", "anthropic-vertex"];
    throw new Error(
      `Unknown provider "${providerId}" in PDF_ANALYZER_PROVIDER. Valid providers: ${allIds.join(", ")}`
    );
  }

  const envModel = process.env.PDF_ANALYZER_MODEL;
  const modelId =
    envModel && provider.models.some((m) => m.id === envModel) ? envModel : provider.defaultModel;

  const apiKey = process.env.PDF_ANALYZER_API_KEY ?? "";

  return { provider, apiKey, modelId };
}

/**
 * Resolve the active provider and API key.
 *
 * Checks environment variables first (PDF_ANALYZER_PROVIDER, PDF_ANALYZER_MODEL,
 * PDF_ANALYZER_API_KEY), then falls back to the OS credential store.
 *
 * Throws if no provider is configured or the API key is missing.
 */
export async function resolveActiveProvider(): Promise<{
  provider: ProviderConfig;
  apiKey: string;
  modelId: string;
}> {
  // Env vars take precedence
  const fromEnv = await resolveFromEnv();
  if (fromEnv) return fromEnv;

  // Fall back to keychain
  const providerId = getStoredProvider();

  if (!providerId) {
    throw new Error(
      "No provider configured. Run `pdf-analyzer --setup` to choose a provider and set your API key."
    );
  }

  const provider = await getProvider(providerId);

  if (!provider) {
    throw new Error(
      `Unknown provider "${providerId}". Run \`pdf-analyzer --setup\` to reconfigure.`
    );
  }

  const storedModel = getModel();
  const modelId =
    storedModel && provider.models.some((m) => m.id === storedModel)
      ? storedModel
      : provider.defaultModel;

  // Vertex providers: inject keychain values into env vars, return key file path as apiKey
  if (providerId.includes("-vertex")) {
    const keychainProject = getVertexProject();
    const keychainLocation = getVertexLocation();
    const keyFile = getVertexKeyFile();

    if (!process.env.VERTEX_PROJECT && keychainProject) {
      process.env.VERTEX_PROJECT = keychainProject;
    }
    if (!process.env.VERTEX_LOCATION && keychainLocation) {
      process.env.VERTEX_LOCATION = keychainLocation;
    }

    return { provider, apiKey: keyFile ?? "", modelId };
  }

  // Non-Vertex providers: require API key
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error(
      `API key not found for ${provider.displayName}. Run \`pdf-analyzer --setup\` to set your API key.`
    );
  }

  return { provider, apiKey, modelId };
}
