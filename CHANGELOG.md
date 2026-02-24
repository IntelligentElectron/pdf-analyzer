# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
