import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { pdfBytesToChunk, splitPdfInHalf } from "./chunker.js";

/**
 * Create a synthetic PDF with the given number of pages.
 * Each page has some text content to give it realistic size.
 */
async function createSyntheticPdf(pageCount: number, contentPerPage = ""): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage();
    if (contentPerPage) {
      page.drawText(contentPerPage, { x: 50, y: 500, size: 12 });
    } else {
      page.drawText(`Page ${i + 1}`, { x: 50, y: 500, size: 12 });
    }
  }
  return doc.save();
}

describe("pdfBytesToChunk", () => {
  it("creates a chunk with correct metadata", async () => {
    const pdfBytes = await createSyntheticPdf(7);
    const chunk = await pdfBytesToChunk(pdfBytes);

    expect(chunk.startPage).toBe(0);
    expect(chunk.pageCount).toBe(7);
    expect(chunk.totalPages).toBe(7);
    expect(chunk.bytes).toBe(pdfBytes);
  });

  it("handles a single-page PDF from PDFDocument.create()", async () => {
    // pdf-lib's PDFDocument.create() + save() produces a valid 1-page-like structure
    // that getPageCount() reports as having pages, so this just verifies it doesn't throw
    const pdfBytes = await createSyntheticPdf(1);
    const chunk = await pdfBytesToChunk(pdfBytes);
    expect(chunk.pageCount).toBe(1);
    expect(chunk.totalPages).toBe(1);
  });
});

describe("splitPdfInHalf", () => {
  it("splits an even page count into two equal halves", async () => {
    const pdfBytes = await createSyntheticPdf(10);
    const chunk = await pdfBytesToChunk(pdfBytes);
    const [first, second] = await splitPdfInHalf(chunk);

    expect(first.pageCount).toBe(5);
    expect(second.pageCount).toBe(5);
    expect(first.startPage).toBe(0);
    expect(second.startPage).toBe(5);
  });

  it("gives the first half the extra page on odd count", async () => {
    const pdfBytes = await createSyntheticPdf(7);
    const chunk = await pdfBytesToChunk(pdfBytes);
    const [first, second] = await splitPdfInHalf(chunk);

    expect(first.pageCount).toBe(4);
    expect(second.pageCount).toBe(3);
    expect(first.startPage).toBe(0);
    expect(second.startPage).toBe(4);
  });

  it("throws on a 1-page chunk", async () => {
    const pdfBytes = await createSyntheticPdf(1);
    const chunk = await pdfBytesToChunk(pdfBytes);

    await expect(splitPdfInHalf(chunk)).rejects.toThrow("Cannot split a single-page chunk");
  });

  it("preserves totalPages from the original PDF", async () => {
    const pdfBytes = await createSyntheticPdf(20);
    const chunk = await pdfBytesToChunk(pdfBytes);
    const [first, second] = await splitPdfInHalf(chunk);

    expect(first.totalPages).toBe(20);
    expect(second.totalPages).toBe(20);
  });

  it("produces contiguous page ranges", async () => {
    const pdfBytes = await createSyntheticPdf(12);
    const chunk = await pdfBytesToChunk(pdfBytes);
    const [first, second] = await splitPdfInHalf(chunk);

    expect(first.startPage + first.pageCount).toBe(second.startPage);
    expect(first.pageCount + second.pageCount).toBe(12);
  });

  it("produces valid PDFs for each half", async () => {
    const pdfBytes = await createSyntheticPdf(8);
    const chunk = await pdfBytesToChunk(pdfBytes);
    const [first, second] = await splitPdfInHalf(chunk);

    const firstDoc = await PDFDocument.load(first.bytes);
    expect(firstDoc.getPageCount()).toBe(first.pageCount);

    const secondDoc = await PDFDocument.load(second.bytes);
    expect(secondDoc.getPageCount()).toBe(second.pageCount);
  });

  it("works with the oversized-doc.pdf fixture", async () => {
    const fixturePath = join(__dirname, "..", "test", "fixtures", "oversized-doc.pdf");
    const pdfBytes = new Uint8Array(readFileSync(fixturePath));
    const chunk = await pdfBytesToChunk(pdfBytes);

    expect(chunk.pageCount).toBeGreaterThan(1);

    const [first, second] = await splitPdfInHalf(chunk);

    // Both halves are valid PDFs
    const firstDoc = await PDFDocument.load(first.bytes);
    const secondDoc = await PDFDocument.load(second.bytes);
    expect(firstDoc.getPageCount()).toBe(first.pageCount);
    expect(secondDoc.getPageCount()).toBe(second.pageCount);

    // Page counts sum to original
    expect(first.pageCount + second.pageCount).toBe(chunk.pageCount);

    // Each half is smaller than the original
    expect(first.bytes.byteLength).toBeLessThan(pdfBytes.byteLength);
    expect(second.bytes.byteLength).toBeLessThan(pdfBytes.byteLength);
  });
});
