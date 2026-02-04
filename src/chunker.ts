import { PDFDocument } from "pdf-lib";

/** A chunk of pages extracted from a larger PDF */
export interface PdfChunk {
  bytes: Uint8Array;
  startPage: number; // 0-based index in original PDF
  pageCount: number;
  totalPages: number; // total pages in original PDF
}

/**
 * Wrap raw PDF bytes into a PdfChunk with metadata.
 */
export async function pdfBytesToChunk(pdfBytes: Uint8Array): Promise<PdfChunk> {
  const doc = await PDFDocument.load(pdfBytes);
  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new Error("PDF has no pages");
  }
  return { bytes: pdfBytes, startPage: 0, pageCount, totalPages: pageCount };
}

/**
 * Split a PdfChunk in half by page count.
 * First half gets the extra page when the count is odd.
 * Throws if the chunk has only 1 page (can't split further).
 */
export async function splitPdfInHalf(chunk: PdfChunk): Promise<[PdfChunk, PdfChunk]> {
  if (chunk.pageCount <= 1) {
    throw new Error(
      `Cannot split a single-page chunk (page ${chunk.startPage + 1} of the original PDF)`
    );
  }

  const srcDoc = await PDFDocument.load(chunk.bytes);
  const firstCount = Math.ceil(chunk.pageCount / 2);
  const secondCount = chunk.pageCount - firstCount;

  const firstDoc = await PDFDocument.create();
  const firstIndices = Array.from({ length: firstCount }, (_, i) => i);
  const firstPages = await firstDoc.copyPages(srcDoc, firstIndices);
  for (const page of firstPages) firstDoc.addPage(page);

  const secondDoc = await PDFDocument.create();
  const secondIndices = Array.from({ length: secondCount }, (_, i) => firstCount + i);
  const secondPages = await secondDoc.copyPages(srcDoc, secondIndices);
  for (const page of secondPages) secondDoc.addPage(page);

  const firstHalf: PdfChunk = {
    bytes: await firstDoc.save(),
    startPage: chunk.startPage,
    pageCount: firstCount,
    totalPages: chunk.totalPages,
  };

  const secondHalf: PdfChunk = {
    bytes: await secondDoc.save(),
    startPage: chunk.startPage + firstCount,
    pageCount: secondCount,
    totalPages: chunk.totalPages,
  };

  return [firstHalf, secondHalf];
}
