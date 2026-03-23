# Project TODO

- [x] Add AI SDK dependencies (ai, @ai-sdk/google, @ai-sdk/anthropic, @ai-sdk/openai)
- [x] Create provider types (src/providers/types.ts)
- [x] Create Google provider (src/providers/google.ts)
- [x] Create Anthropic provider (src/providers/anthropic.ts)
- [x] Create OpenAI provider (src/providers/openai.ts)
- [x] Create provider registry (src/providers/registry.ts)
- [x] Extract shared PDF utilities (src/pdf-utils.ts)
- [x] Refactor types.ts - replace Gemini schemas with Zod
- [x] Refactor service.ts - use AI SDK generateText + Output.object
- [x] Refactor keychain.ts - generalize to multi-account storage
- [x] Refactor cli/commands.ts - --setup replaces --set-key
- [x] Update server.ts - use provider registry
- [x] Update index.ts - add --setup flag
- [x] Update tests - all passing
- [x] Cleanup: package.json, server instructions, CLAUDE.md
- [x] Add ./providers export to package.json for external consumers
