import { describe, it, expect, vi, beforeEach } from "vitest";
import { anthropicVertexProvider } from "./anthropic-vertex.js";
import { anthropicProvider } from "./anthropic.js";

describe("anthropicVertexProvider", () => {
  it('has id "anthropic-vertex" matching registry key', () => {
    expect(anthropicVertexProvider.id).toBe("anthropic-vertex");
  });

  it("has same models as direct anthropic provider", () => {
    expect(anthropicVertexProvider.models).toEqual(anthropicProvider.models);
  });

  it("has empty apiKeyUrl (ADC, no key needed)", () => {
    expect(anthropicVertexProvider.apiKeyUrl).toBe("");
  });

  it("defaults to claude-opus-4-7", () => {
    expect(anthropicVertexProvider.defaultModel).toBe("claude-opus-4-7");
  });
});

describe("Anthropic Vertex env var helpers", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("createModel throws when VERTEX_PROJECT is not set", () => {
    vi.stubEnv("VERTEX_PROJECT", "");
    expect(() => anthropicVertexProvider.createModel("", "claude-sonnet-4-6")).toThrow(
      "VERTEX_PROJECT env var is required"
    );
  });
});

describe("anthropicVertexProvider.isTokenLimitError", () => {
  it('detects "too many input tokens"', () => {
    expect(anthropicVertexProvider.isTokenLimitError(new Error("too many input tokens"))).toBe(
      true
    );
  });

  it('detects "prompt is too long"', () => {
    expect(anthropicVertexProvider.isTokenLimitError(new Error("prompt is too long"))).toBe(true);
  });

  it("returns false for other errors", () => {
    expect(anthropicVertexProvider.isTokenLimitError(new Error("network error"))).toBe(false);
  });
});

describe("anthropicVertexProvider.preparePdf", () => {
  it("rejects cached URIs", async () => {
    await expect(
      anthropicVertexProvider.preparePdf({ kind: "cachedUri", uri: "https://example.com" }, "")
    ).rejects.toThrow("Cached URIs are only supported with the Google provider");
  });

  it("returns inline file parts for bytes", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await anthropicVertexProvider.preparePdf({ kind: "bytes", bytes }, "");
    expect(result.fileParts).toHaveLength(1);
    expect(result.fileParts[0].type).toBe("file");
    expect(result.fileParts[0].mediaType).toBe("application/pdf");
    expect(result.fileParts[0].data).toBeInstanceOf(Uint8Array);
    expect(result.cachedUri).toBeNull();
  });
});
