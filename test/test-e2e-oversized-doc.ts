/**
 * End-to-end test for chunked PDF processing with the oversized fixture.
 * Requires GEMINI_API_KEY in .env or environment.
 *
 * 1. Analyzes the oversized PDF from a file path (triggers chunking).
 * 2. Re-analyzes using the cached cached_uris from step 1 (no re-upload).
 *
 * Usage: npx tsx test/test-e2e-oversized-doc.ts
 */

import { join } from "node:path";
import { createGeminiClient, analyzePdf } from "../src/service.js";

const fixturePath = join(import.meta.dirname, "fixtures", "oversized-doc.pdf");

async function main() {
  const client = createGeminiClient();

  // --- Step 1: Analyze from file path (triggers chunking) ---

  console.log("=== Step 1: Analyze from file path ===\n");
  console.log(`PDF: ${fixturePath}\n`);

  const t1 = Date.now();
  const result1 = await analyzePdf(client, {
    pdf_source: fixturePath,
    queries: ["What is this document about?", "How many pages does it have?"],
  });
  const elapsed1 = ((Date.now() - t1) / 1000).toFixed(1);

  console.log(`Done in ${elapsed1}s\n`);
  console.log(`cached_uris (${result1.cached_uris.length}):`);
  for (const uri of result1.cached_uris) {
    console.log(`  ${uri}`);
  }
  console.log();
  for (const r of result1.responses) {
    console.log(`Q: ${r.query}`);
    console.log(`A: ${r.answer}\n`);
  }

  // --- Step 2: Re-analyze using cached cached_uris ---

  console.log("=== Step 2: Re-analyze using cached cached_uris ===\n");
  console.log(`Cached URIs: ${result1.cached_uris.length}\n`);

  const t2 = Date.now();
  const result2 = await analyzePdf(client, {
    pdf_source: result1.cached_uris,
    queries: [
      "Compare the power consumption of all radio TX modes at different dBm levels. Which mode is most efficient in terms of mA per dBm?",
      "List every peripheral that supports EasyDMA, including the exact number of channels or buffers each one has.",
      "What are all the differences between the QFN48 and WLCSP package options in terms of pin count, thermal pad, GPIOs available, and any peripherals that are unavailable?",
    ],
  });
  const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);

  console.log(`Done in ${elapsed2}s\n`);
  console.log(JSON.stringify(result2, null, 2));
}

main().catch((err) => {
  console.error("FAILED:", err.message ?? err);
  process.exit(1);
});
