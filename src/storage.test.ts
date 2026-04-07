import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @google-cloud/storage
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockFile = vi.fn(() => ({ save: mockSave }));
const mockBucket = vi.fn(() => ({ file: mockFile }));

vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(() => ({ bucket: mockBucket })),
}));

import { uploadToGcs } from "./storage.js";

describe("uploadToGcs", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockSave.mockClear();
    mockFile.mockClear();
    mockBucket.mockClear();
  });

  it("throws when PDF_UPLOAD_BUCKET is not set", async () => {
    await expect(uploadToGcs(Buffer.from("test"), "test.pdf")).rejects.toThrow(
      "PDF_UPLOAD_BUCKET env var is required for upload_pdf."
    );
  });

  it("calls file.save with correct content type", async () => {
    vi.stubEnv("PDF_UPLOAD_BUCKET", "my-bucket");
    const data = Buffer.from("test-pdf-data");
    await uploadToGcs(data, "doc.pdf");

    expect(mockBucket).toHaveBeenCalledWith("my-bucket");
    expect(mockSave).toHaveBeenCalledWith(data, { contentType: "application/pdf" });
  });

  it("returns gs:// URL with correct format", async () => {
    vi.stubEnv("PDF_UPLOAD_BUCKET", "my-bucket");
    const url = await uploadToGcs(Buffer.from("test"), "doc.pdf");

    expect(url).toMatch(/^gs:\/\/my-bucket\/uploads\/\d+-doc\.pdf$/);
  });
});
