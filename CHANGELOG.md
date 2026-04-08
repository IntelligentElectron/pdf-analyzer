# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.2.2] - 2026-04-08

### Added
- Vertex AI service account JSON key authentication in `--setup` flow
- Google Vertex AI and Anthropic via Vertex AI as first-class setup options
- Auto-detection of `GOOGLE_APPLICATION_CREDENTIALS` environment variable during setup
- Keychain storage for Vertex credentials (project, location, key file path)

### Changed
- Fixed Vertex provider IDs (`google-vertex`, `anthropic-vertex`) to match registry keys
- Test fixtures replaced with smaller, cheaper PDFs (1-pager.pdf, attention-is-all-you-need.pdf)
- Test URL documents updated from IC datasheets to CS/ML papers, sorted by page count

## [1.2.1] - 2026-04-06

### Changed
- Refactored LLM call logic into shared `callLlm` helper, reducing ~25 lines of duplication across three call sites
- CI: switched npm publish job from Node 22 to Node 24 (fixes broken npm in GitHub Actions runner images)

## [1.2.0] - 2026-04-06

### Added
- Cloud Run deployment with Streamable HTTP transport (`POST /mcp`)
- Direct REST endpoint (`POST /analyze`) for clients that don't speak MCP
- Health check endpoint (`GET /health`)
- Google Vertex AI provider for Cloud Run (uses ADC, no API keys needed)
- Anthropic Vertex AI provider
- Provider and model configuration via environment variables (`PDF_ANALYZER_PROVIDER`, `VERTEX_PROJECT`, `VERTEX_LOCATION`)
- Authenticated GCS downloads for `gs://` URIs via `@google-cloud/storage`
- Dockerfile for containerized deployments
- Deployment scripts: gcloud CLI (`deploy/gcloud.sh`) and Terraform (`deploy/main.tf`)
- Deployment documentation (`deploy/README.md`)
- Architecture documentation (`docs/architecture.md`) covering stdio vs HTTP transport
- Cloud Run E2E test suite (`test/test-e2e-cloud-run.ts`)
- Plans: OAuth 2.1 authorization, rate limit handling

### Changed
- Cloud Run configured with 15-minute request timeout and 4 GiB memory for large PDFs
- PDF fetch timeout increased from 60 seconds to 5 minutes for slow CDNs
- Adaptive chunking works with inline bytes on Vertex AI (no Gemini File API)

### Removed
- `upload_pdf` tool (unnecessary: stdio reads local files, HTTP accepts URLs and `gs://` URIs)
- `src/storage.ts` module (only used by `upload_pdf`)

## [1.0.1] - 2026-03-23

### Added
- `./providers` subpath export for importing provider configs (`googleProvider`, `anthropicProvider`, `openaiProvider`), registry utilities, and provider types directly

## [1.0.0] - 2026-03-22

### Added
- Multi-provider support: Google Gemini, Anthropic Claude, and OpenAI
- Interactive TUI setup (`--setup`) with provider and model selection using @clack/prompts
- Model selection per provider: fast (cost-effective) and flagship options
  - Google: Gemini 3 Flash / Gemini 3.1 Pro
  - Anthropic: Claude Sonnet 4.6 / Claude Opus 4.6
  - OpenAI: GPT-5.4 Mini / GPT-5.4
- Provider-specific PDF handling: Gemini File API for Google, inline bytes for Anthropic and OpenAI
- Thinking/reasoning set to minimum across all providers (optimized for document analysis)

### Changed
- Migrated from direct `@google/genai` SDK to Vercel AI SDK V6 for provider abstraction
- Replaced Gemini-specific `Type.OBJECT` schemas with Zod schemas (`Output.object()`)
- Generalized keychain storage to support provider ID, model ID, and API key
- Adaptive chunking now works across all providers (not just Gemini)
- Response includes `model` field showing which model produced the response
- `--set-key` is now a deprecated alias for `--setup`

### Removed
- Legacy `GEMINI_API_KEY` credential and backward-compatibility fallback
- Direct dependency on `@google/genai` for LLM calls (kept for File API uploads only)

## [0.2.0] - 2026-03-03

### Added
- OS-native credential storage for Gemini API key (macOS Keychain, Linux secret-tool, Windows Credential Manager)
- `--set-key` CLI command to store/update the API key interactively
- Install scripts prompt to store the API key during installation
- Install scripts detect existing stored key and ask before overwriting

### Changed
- API key is now read from the OS credential store instead of environment variables
- Remove `--env GEMINI_API_KEY` from all MCP client config examples in README
- Remove `ThinkingLevel.HIGH` config; Gemini now uses default dynamic thinking (auto-adjusts per query)

### Removed
- `.env` file auto-loading for API key
- Environment variable `GEMINI_API_KEY` support (replaced by OS credential store)

## [0.1.6] - 2026-03-02

### Changed
- Upgrade Gemini model from `gemini-3-pro-preview` to `gemini-3.1-pro-preview`

## [0.1.5] - 2026-03-01

### Added

- Library exports for programmatic use from TypeScript codebases (`@intelligentelectron/pdf-analyzer/service`)
- Package `exports` map with `./service` and `./types` subpath entry points
- Type re-exports from `service.ts`: `AnalyzePdfInput`, `AnalyzePdfResponse`, `QueryResponse`, `AnalyzePdfInputSchema`

### Changed

- Switch TypeScript config to `module: "NodeNext"` / `moduleResolution: "NodeNext"` for proper subpath export resolution
- Add `declarationMap` for "go to definition" support in consuming projects
- Exclude test files from compiled output

## [0.1.4] - 2026-02-24

### Fixed
- Remove deprecated `baseUrl` from tsconfig, add explicit `rootDir`

## [0.1.3] - 2026-02-24

### Fixed
- Skip auto-update for npm installs (detect `node_modules` in script path)

## [0.1.2] - 2026-02-24

### Changed
- Detect interactive terminal (TTY) and show help message instead of hanging
- Auto-update always runs on startup (removed `--no-update` flag and `PDF_MCP_NO_UPDATE` env var)

## [0.1.1] - 2026-02-09

### Changed
- macOS: ship a single universal binary (arm64 + x64) instead of two separate binaries
- Installer and auto-updater now download the universal binary on macOS
- Arch-specific download names preserved for backward compatibility with v0.1.0

### Removed
- Claude Code CI workflow files (claude.yml, claude-review.yml)

## [0.1.0] - 2026-02-04

### Added
- Automatic chunked processing for large PDFs that exceed Gemini's token limit
- Try-and-split algorithm: tries the full PDF first, splits in half on token limit error, retries
- Rolling context across chunks preserves findings from earlier sections
- `cached_uris` array in responses for re-analyzing previously chunked documents
- `pdf_source` now accepts `string[]` (array of cached Gemini URIs) for chunk re-analysis
- New dependency: `pdf-lib` for PDF page splitting

### Changed
- Renamed response field `file_uri` to `cached_uris` (now always an array)
- `pdf_source` input accepts file paths, URLs, single Gemini URIs, or arrays of Gemini URIs

## [0.0.5] - 2026-02-04

### Changed
- Revert to absolute-only paths in `analyze_pdf` tool for reliability
- Add Claude Code GitHub Actions workflows for automated PR review

## [0.0.4] - 2026-02-03

### Added
- npm publishing support (`npx @intelligentelectron/pdf-analyzer`)
- Accept relative paths in `analyze_pdf` tool

## [0.0.3] - 2026-02-02

### Added
- 60-second timeout for URL fetching to prevent indefinite hangs

## [0.0.2] - 2026-02-01

### Added
- Auto-load `GEMINI_API_KEY` from `.env` file in current working directory
- Environment variables take precedence over `.env` values

### Changed
- Simplified MCP client configuration examples (no longer require `env` block)

## [0.0.1] - 2026-02-01

### Added
- Initial release
- PDF analysis using Gemini 3 Pro Preview model
- Self-updating binaries for macOS (arm64, x64), Linux (arm64, x64), Windows (x64)
- Auto-update from GitHub releases
- Shell/PowerShell installers
