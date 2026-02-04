# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
