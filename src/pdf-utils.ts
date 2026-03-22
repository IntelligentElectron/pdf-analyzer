/**
 * Shared PDF utility functions.
 *
 * Contains URL validation, path validation, and PDF fetching logic
 * used by both the service layer and provider implementations.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Gemini File API URI prefix. */
const GEMINI_FILE_URI_PREFIX = "https://generativelanguage.googleapis.com/";

/**
 * Check if a string is a Gemini File API URI.
 */
export function isGeminiFileUri(source: string): boolean {
  return source.startsWith(GEMINI_FILE_URI_PREFIX);
}

/**
 * Check if a string is a URL (excluding Gemini File API URIs).
 */
export function isUrl(source: string): boolean {
  if (isGeminiFileUri(source)) {
    return false;
  }
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a local PDF file path.
 * Throws descriptive errors for common issues.
 */
export function validateLocalPath(pdfPath: string): void {
  const trimmedPath = pdfPath.trim();

  if (!path.isAbsolute(trimmedPath)) {
    throw new Error(`PDF path must be absolute: ${trimmedPath}`);
  }

  if (!fs.existsSync(trimmedPath)) {
    throw new Error(`PDF file not found: ${trimmedPath}`);
  }

  const stats = fs.statSync(trimmedPath);
  if (stats.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${trimmedPath}`);
  }

  if (!trimmedPath.toLowerCase().endsWith(".pdf")) {
    throw new Error(`File is not a PDF: ${trimmedPath}`);
  }
}

/** Timeout for fetching PDFs from URLs (60 seconds). */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * Fetch PDF content from a URL with timeout.
 */
export async function fetchPdfFromUrl(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to fetch URL: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (
    contentType &&
    !contentType.includes("application/pdf") &&
    !contentType.includes("octet-stream")
  ) {
    throw new Error(`URL does not point to a PDF file. Content-Type: ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Read PDF bytes from a local file path.
 */
export function readPdfBytes(pdfPath: string): Buffer {
  validateLocalPath(pdfPath);
  return fs.readFileSync(pdfPath.trim());
}
