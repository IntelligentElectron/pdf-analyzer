import { describe, it, expect } from "vitest";
import { isGeminiFileUri, isUrl, validateLocalPath } from "./service.js";
import { AnalyzePdfInputSchema } from "./types.js";

describe("isGeminiFileUri", () => {
  it("returns true for valid Gemini File API URIs", () => {
    expect(
      isGeminiFileUri("https://generativelanguage.googleapis.com/v1beta/files/abc123")
    ).toBe(true);
    expect(
      isGeminiFileUri("https://generativelanguage.googleapis.com/v1/files/xyz789")
    ).toBe(true);
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
    expect(() =>
      validateLocalPath(process.cwd() + "/test/fixtures/m3000a.pdf")
    ).not.toThrow();
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
