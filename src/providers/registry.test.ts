import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock keychain before importing registry
vi.mock("../keychain.js", () => ({
  getActiveProvider: vi.fn(() => null),
  getApiKey: vi.fn(() => null),
  getModel: vi.fn(() => null),
}));

import { resolveActiveProvider, providers } from "./registry.js";
import { getActiveProvider, getApiKey, getModel } from "../keychain.js";

const mockedGetActiveProvider = vi.mocked(getActiveProvider);
const mockedGetApiKey = vi.mocked(getApiKey);
const mockedGetModel = vi.mocked(getModel);

describe("resolveActiveProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockedGetActiveProvider.mockReturnValue(null);
    mockedGetApiKey.mockReturnValue(null);
    mockedGetModel.mockReturnValue(null);
  });

  // --- Env var path ---

  it("returns provider from PDF_ANALYZER_PROVIDER env var", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "google");
    const result = await resolveActiveProvider();
    expect(result.provider).toBe(providers["google"]);
  });

  it("uses PDF_ANALYZER_MODEL when valid", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "google");
    vi.stubEnv("PDF_ANALYZER_MODEL", "gemini-3-flash-preview");
    const result = await resolveActiveProvider();
    expect(result.modelId).toBe("gemini-3-flash-preview");
  });

  it("falls back to default model when PDF_ANALYZER_MODEL is invalid", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "google");
    vi.stubEnv("PDF_ANALYZER_MODEL", "nonexistent-model");
    const result = await resolveActiveProvider();
    expect(result.modelId).toBe(providers["google"].defaultModel);
  });

  it("passes API key from PDF_ANALYZER_API_KEY", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "google");
    vi.stubEnv("PDF_ANALYZER_API_KEY", "test-key-123");
    const result = await resolveActiveProvider();
    expect(result.apiKey).toBe("test-key-123");
  });

  it("uses empty string API key when PDF_ANALYZER_API_KEY is not set", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "google");
    const result = await resolveActiveProvider();
    expect(result.apiKey).toBe("");
  });

  it("throws on unknown provider in env var", async () => {
    vi.stubEnv("PDF_ANALYZER_PROVIDER", "nope");
    await expect(resolveActiveProvider()).rejects.toThrow(/Unknown provider "nope"/);
    await expect(resolveActiveProvider()).rejects.toThrow(/Valid providers:/);
  });

  // --- Keychain fallback path ---

  it("falls back to keychain when no env vars set", async () => {
    mockedGetActiveProvider.mockReturnValue("anthropic");
    mockedGetApiKey.mockReturnValue("keychain-key");
    const result = await resolveActiveProvider();
    expect(result.provider).toBe(providers["anthropic"]);
    expect(result.apiKey).toBe("keychain-key");
  });

  it("throws when no env vars and no keychain provider", async () => {
    await expect(resolveActiveProvider()).rejects.toThrow(/No provider configured/);
    await expect(resolveActiveProvider()).rejects.toThrow(/--setup/);
  });
});
