/**
 * Google Cloud Storage upload for remote PDF deployments.
 */

import { Storage } from "@google-cloud/storage";

/**
 * Upload a PDF buffer to Google Cloud Storage.
 * Returns a gs:// URI for the uploaded file.
 */
export async function uploadToGcs(data: Buffer, filename: string): Promise<string> {
  const bucket = process.env.PDF_UPLOAD_BUCKET;
  if (!bucket) {
    throw new Error("PDF_UPLOAD_BUCKET env var is required for upload_pdf.");
  }
  const storage = new Storage();
  const key = `uploads/${Date.now()}-${filename}`;
  const file = storage.bucket(bucket).file(key);
  await file.save(data, { contentType: "application/pdf" });
  return `gs://${bucket}/${key}`;
}
