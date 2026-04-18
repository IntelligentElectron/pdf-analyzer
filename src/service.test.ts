import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  isGeminiFileUri,
  isUrl,
  validateLocalPath,
  classifySource,
  resolveSourceBytes,
} from "./service.js";
import { AnalyzePdfInputSchema } from "./types.js";

describe("isGeminiFileUri", () => {
  it("returns true for valid Gemini File API URIs", () => {
    expect(isGeminiFileUri("https://generativelanguage.googleapis.com/v1beta/files/abc123")).toBe(
      true
    );
    expect(isGeminiFileUri("https://generativelanguage.googleapis.com/v1/files/xyz789")).toBe(true);
  });

  it("returns false for regular URLs", () => {
    expect(isGeminiFileUri("https://example.com/doc.pdf")).toBe(false);
    expect(isGeminiFileUri("https://www.ti.com/lit/ds/symlink/tps62880-q1.pdf")).toBe(false);
  });

  it("returns false for local paths", () => {
    expect(isGeminiFileUri("/Users/name/docs/report.pdf")).toBe(false);
    expect(isGeminiFileUri("/tmp/test.pdf")).toBe(false);
  });

  it("returns false for http URLs", () => {
    expect(isGeminiFileUri("http://example.com/doc.pdf")).toBe(false);
  });
});

describe("isUrl", () => {
  it("returns true for http URLs", () => {
    expect(isUrl("http://example.com/doc.pdf")).toBe(true);
  });

  it("returns true for https URLs", () => {
    expect(isUrl("https://example.com/doc.pdf")).toBe(true);
    expect(isUrl("https://www.ti.com/lit/ds/symlink/tps62880-q1.pdf")).toBe(true);
  });

  it("returns false for Gemini File API URIs", () => {
    expect(isUrl("https://generativelanguage.googleapis.com/v1beta/files/abc123")).toBe(false);
    expect(isUrl("https://generativelanguage.googleapis.com/v1/files/xyz789")).toBe(false);
  });

  it("returns false for local paths", () => {
    expect(isUrl("/Users/name/docs/report.pdf")).toBe(false);
    expect(isUrl("/tmp/test.pdf")).toBe(false);
    expect(isUrl("C:\\Users\\name\\docs\\report.pdf")).toBe(false);
  });

  it("returns false for relative paths", () => {
    expect(isUrl("./test.pdf")).toBe(false);
    expect(isUrl("../docs/test.pdf")).toBe(false);
  });

  it("returns false for invalid URLs", () => {
    expect(isUrl("not-a-url")).toBe(false);
    expect(isUrl("")).toBe(false);
  });
});

describe("validateLocalPath", () => {
  it("throws for relative paths", () => {
    expect(() => validateLocalPath("./test.pdf")).toThrow("must be absolute");
    expect(() => validateLocalPath("test.pdf")).toThrow("must be absolute");
  });

  it("throws for non-existent files", () => {
    expect(() => validateLocalPath("/nonexistent/path/to/file.pdf")).toThrow("not found");
  });

  it("throws for non-PDF files", () => {
    expect(() => validateLocalPath("/etc/passwd")).toThrow("not a PDF");
    expect(() => validateLocalPath("/bin/ls")).toThrow("not a PDF");
  });

  it("throws for directories", () => {
    expect(() => validateLocalPath("/tmp")).toThrow("directory");
  });

  it("trims whitespace from paths", () => {
    expect(() => validateLocalPath("   ")).toThrow("must be absolute");
    expect(() => validateLocalPath("  /nonexistent.pdf  ")).toThrow("not found");
  });

  it("accepts valid PDF files", () => {
    expect(() => validateLocalPath(process.cwd() + "/test/fixtures/1-pager.pdf")).not.toThrow();
  });
});

describe("AnalyzePdfInputSchema", () => {
  it("rejects empty queries array", () => {
    const result = AnalyzePdfInputSchema.safeParse({
      pdf_source: "/path/to/file.pdf",
      queries: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty string queries", () => {
    const result = AnalyzePdfInputSchema.safeParse({
      pdf_source: "/path/to/file.pdf",
      queries: [""],
    });
    expect(result.success).toBe(false);
  });

  it("rejects queries with empty strings mixed with valid ones", () => {
    const result = AnalyzePdfInputSchema.safeParse({
      pdf_source: "/path/to/file.pdf",
      queries: ["valid query", ""],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid queries", () => {
    const result = AnalyzePdfInputSchema.safeParse({
      pdf_source: "/path/to/file.pdf",
      queries: ["What is this document about?"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple valid queries", () => {
    const result = AnalyzePdfInputSchema.safeParse({
      pdf_source: "/path/to/file.pdf",
      queries: ["First question?", "Second question?"],
    });
    expect(result.success).toBe(true);
  });
});

describe("classifySource", () => {
  it("passes gs:// URL through for GCS download in analyzePdf", () => {
    const result = classifySource("gs://my-bucket/uploads/doc.pdf");
    expect(result).toEqual({
      kind: "url",
      url: "gs://my-bucket/uploads/doc.pdf",
    });
  });

  it("passes nested gs:// paths through", () => {
    const result = classifySource("gs://bucket/a/b/c.pdf");
    expect(result).toEqual({
      kind: "url",
      url: "gs://bucket/a/b/c.pdf",
    });
  });

  it("classifies regular URLs as url kind", () => {
    const result = classifySource("https://example.com/doc.pdf");
    expect(result).toEqual({ kind: "url", url: "https://example.com/doc.pdf" });
  });

  it("classifies Gemini URIs as cachedUri kind", () => {
    const uri = "https://generativelanguage.googleapis.com/v1beta/files/abc123";
    const result = classifySource(uri);
    expect(result).toEqual({ kind: "cachedUri", uri });
  });

  it("classifies local paths as path kind", () => {
    const result = classifySource("/tmp/doc.pdf");
    expect(result).toEqual({ kind: "path", path: "/tmp/doc.pdf" });
  });
});

describe("resolveSourceBytes", () => {
  // Regression: gs:// sources get converted to { kind: "bytes" } before the
  // chunking fallback. Before the fix, the fallback cast to { kind: "path" }
  // and crashed with "Cannot read properties of undefined (reading 'trim')".
  it("returns the same bytes for kind: bytes", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const out = await resolveSourceBytes({ kind: "bytes", bytes });
    expect(out).toBe(bytes);
  });

  it("reads file contents for kind: path", async () => {
    const path = process.cwd() + "/test/fixtures/1-pager.pdf";
    const expected = readFileSync(path);
    const out = await resolveSourceBytes({ kind: "path", path });
    expect(out.byteLength).toBe(expected.byteLength);
    expect(out[0]).toBe(0x25); // "%"
    expect(out[1]).toBe(0x50); // "P"
  });
});
