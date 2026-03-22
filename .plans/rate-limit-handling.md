# Rate Limit Handling for Chunked PDFs

## Problem

When processing large PDFs (e.g., 980-page nRF52840 spec) with OpenAI, the chunking loop sends multiple large requests back-to-back. This exceeds the TPM (tokens per minute) rate limit:

```
Limit 500000, Used 387097, Requested 210705
"Please try again in 11.736s"
```

The current retry logic (3 attempts) does not distinguish rate limit errors from other failures, so retries fire immediately and fail again.

## Approaches

### 1. Retry with backoff on rate limit errors

Parse the `retry-after` value from the error response and wait that duration before retrying. The AI SDK's `generateText` accepts `maxRetries`, but the default retry strategy may not respect provider-specific cooldown periods.

- Detect rate limit errors per provider (HTTP 429 or provider-specific patterns)
- Extract the wait duration from the error message or `Retry-After` header
- Retry after the specified delay
- Increase `maxRetries` for rate-limited requests (e.g., 5 instead of 3)

### 2. Throttle between chunks

Add a configurable delay between chunk processing calls to stay under TPM limits proactively, rather than reacting to failures.

- Track elapsed time between chunk calls
- If the previous call completed quickly, add a delay before the next one
- This prevents rate limits entirely rather than recovering from them

### 3. Provider-specific notes

- **Google Gemini**: Not affected. File API uploads once server-side; token throughput is not a bottleneck.
- **Anthropic Claude**: Higher default rate limits. Less likely to hit this, but the 100-page PDF limit triggers chunking which could still cause issues at scale.
- **OpenAI**: Most susceptible due to lower TPM limits on standard tiers. Both approaches above are relevant here.

## Recommendation

Combine both: add inter-chunk throttling as the primary defense, and retry-after handling as a safety net. The throttle prevents most rate limit errors; the retry handles edge cases where the estimate is off.
