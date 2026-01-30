# CLAUDE.md - PDF Analyzer MCP Server

## CRITICAL: Gemini Model

**ALWAYS use `gemini-3-pro-preview` as the model. NEVER change it to any other model (e.g., gemini-2.5-pro-preview, gemini-2.0-flash, etc.).**

## Overview

Standalone MCP server for analyzing PDF documents using Gemini API. Distributed as self-updating binaries for all platforms. Users provide their own Gemini API key.

## Architecture

```
src/
├── index.ts          # CLI entry point, flag parsing
├── server.ts         # MCP server setup, tool registration
├── service.ts        # Gemini API integration
├── types.ts          # TypeScript types
├── version.ts        # VERSION, GITHUB_REPO, BINARY_NAME
└── cli/
    ├── commands.ts   # --version, --help, --update, --uninstall
    ├── updater.ts    # Auto-update from GitHub releases
    └── shell.ts      # PATH integration for shells
```

## Build & Package

Uses Bun to compile TypeScript into standalone executables:

```bash
# Build all platforms
npm run compile:all

# Or individual platforms
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile=bin/pdf-analyzer-mcp-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64 --outfile=bin/pdf-analyzer-mcp-darwin-x64
bun build src/index.ts --compile --target=bun-linux-arm64 --outfile=bin/pdf-analyzer-mcp-linux-arm64
bun build src/index.ts --compile --target=bun-linux-x64 --outfile=bin/pdf-analyzer-mcp-linux-x64
bun build src/index.ts --compile --target=bun-windows-x64 --outfile=bin/pdf-analyzer-mcp-windows-x64.exe
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Type check
npm run type-check

# Lint
npm run lint

# Test
npm test
```

## Apple Code Signing & Notarization

### Entitlements (Required for Bun JIT)

Bun uses JIT compilation. Without entitlements in `entitlements.plist`, signed binaries crash with "Ran out of executable memory".

### Signing Command

```bash
codesign --force --options runtime --entitlements entitlements.plist \
  --sign "Developer ID Application: Your Name ($APPLE_TEAM_ID)" \
  pdf-analyzer-mcp-darwin-arm64
```

### Notarization Commands

```bash
# Create ZIP for notarization
zip pdf-analyzer-mcp-darwin-arm64.zip pdf-analyzer-mcp-darwin-arm64

# Submit for notarization
xcrun notarytool submit pdf-analyzer-mcp-darwin-arm64.zip \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# Staple ticket to binary
xcrun stapler staple pdf-analyzer-mcp-darwin-arm64
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | API key from Google AI Studio |
| `PDF_MCP_NO_UPDATE` | No | Set to "1" to disable auto-update |

## CLI Commands

```bash
pdf-analyzer-mcp              # Run server (with auto-update check)
pdf-analyzer-mcp --version    # Print version
pdf-analyzer-mcp --help       # Show help
pdf-analyzer-mcp --update     # Manual update check
pdf-analyzer-mcp --uninstall  # Remove binary and PATH entries
pdf-analyzer-mcp --no-update  # Run without update check
```

## MCP Tool: analyze_pdf

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pdf_path` | `string` | Yes | Absolute path to PDF file |
| `queries` | `string[]` | Yes | Questions to ask about the PDF |

## MCP Client Configuration

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer-mcp",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Installation

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/westworld-ai/pdf-analyzer-mcp/main/install.sh | bash
```

### Windows

```powershell
irm https://raw.githubusercontent.com/westworld-ai/pdf-analyzer-mcp/main/install.ps1 | iex
```

## Error Handling

| Scenario | Response |
|----------|----------|
| Missing GEMINI_API_KEY | Error with setup instructions |
| PDF not found | Error with validated path |
| PDF too large (>20MB) | Error suggesting File API |
| Gemini API error | Pass through with context |

## Common Issues

### "Ran out of executable memory"
Missing JIT entitlements. Add `entitlements.plist` to codesign command.

### Update loop
`VERSION` in `src/version.ts` doesn't match the release tag. Sync and rebuild.

### 404 on install script
Release marked as `prerelease: true`. GitHub `/releases/latest` ignores prereleases.

### MCP not connecting
- Check PATH: `which pdf-analyzer-mcp`
- Restart terminal after install
- Verify GEMINI_API_KEY is set in MCP client config
