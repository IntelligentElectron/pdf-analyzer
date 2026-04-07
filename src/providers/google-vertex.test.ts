import { describe, it, expect, vi, beforeEach } from "vitest";
import { vertexProvider } from "./google-vertex.js";
import { isGoogleTokenLimitError } from "./google-shared.js";

describe("vertexProvider", () => {
  it('has id "google" for cached URI routing', () => {
    expect(vertexProvider.id).toBe("google");
  });

  it("has 2 models", () => {
    expect(vertexProvider.models).toHaveLength(2);
  });

  it("defaults to gemini-3.1-pro-preview", () => {
    expect(vertexProvider.defaultModel).toBe("gemini-3.1-pro-preview");
  });

  it("has empty apiKeyUrl (ADC, no key needed)", () => {
    expect(vertexProvider.apiKeyUrl).toBe("");
  });
});

describe("Vertex env var helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("createModel throws when VERTEX_PROJECT is not set", () => {
    vi.stubEnv("VERTEX_PROJECT", "");
    expect(() => vertexProvider.createModel("", "gemini-3-flash-preview")).toThrow(
      "VERTEX_PROJECT env var is required"
    );
  });

  it("createModel uses VERTEX_LOCATION default when not set", () => {
    vi.stubEnv("VERTEX_PROJECT", "test-project");
    // Should not throw; location defaults to us-central1
    expect(() => vertexProvider.createModel("", "gemini-3-flash-preview")).not.toThrow();
  });
});

describe("preparePdf", () => {
  it("rejects cachedUri (Vertex does not support File API)", async () => {
    await expect(
      vertexProvider.preparePdf({ kind: "cachedUri", uri: "https://example.com/file" }, "")
    ).rejects.toThrow("Cached URIs are not supported with the Vertex AI provider");
  });

  it("returns inline bytes for bytes source", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await vertexProvider.preparePdf({ kind: "bytes", bytes }, "");
    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0].type).toBe("file");
    expect(result.fileParts[0].data).toBeInstanceOf(Uint8Array);
    expect(result.fileParts[0].mediaType).toBe("application/pdf");
    expect(result.cachedUri).toBeNull();
  });
});

describe("isGoogleTokenLimitError", () => {
  it('detects "input token count exceeds"', () => {
    expect(isGoogleTokenLimitError(new Error("input token count exceeds the limit"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(isGoogleTokenLimitError(new Error("some other error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isGoogleTokenLimitError("string error")).toBe(false);
  });
});
