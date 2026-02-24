# CLAUDE.md - PDF Analyzer MCP Server

## CRITICAL: Branch Protection

**NEVER push directly to `main`. ALL changes must go through a PR.**

1. Create a feature branch: `git checkout -b <branch-name>`
2. Make changes and commit
3. Push the branch: `git push -u origin <branch-name>`
4. Create PR: `gh pr create`

If you accidentally commit to main locally, fix it:
```bash
git branch <branch-name>          # Create branch from current commit
git reset --hard origin/main      # Reset main to match remote
git checkout <branch-name>        # Switch to your branch
git push -u origin <branch-name>  # Push and create PR
```

## CRITICAL: Gemini Model

**ALWAYS use `gemini-3-pro-preview` as the model. NEVER change it to any other model (e.g., gemini-2.5-pro-preview, gemini-2.0-flash, etc.).**

- <https://ai.google.dev/gemini-api/docs/document-processing>
- <https://ai.google.dev/gemini-api/docs/document-processing#large-pdfs> (File API for large PDFs)
- <https://ai.google.dev/gemini-api/docs/files> (Files API reference)

## Overview

Standalone MCP server for analyzing PDF documents using Gemini API. Distributed as self-updating binaries for all platforms. Users provide their own Gemini API key.

## Architecture

```
src/
├── index.ts          # CLI entry point, flag parsing
├── server.ts         # MCP server setup, tool registration
├── service.ts        # Gemini API integration, chunked processing
├── chunker.ts        # PDF splitting (pdf-lib)
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
bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile=bin/pdf-analyzer-darwin-arm64
bun build src/index.ts --compile --target=bun-darwin-x64 --outfile=bin/pdf-analyzer-darwin-x64
bun build src/index.ts --compile --target=bun-linux-arm64 --outfile=bin/pdf-analyzer-linux-arm64
bun build src/index.ts --compile --target=bun-linux-x64 --outfile=bin/pdf-analyzer-linux-x64
bun build src/index.ts --compile --target=bun-windows-x64 --outfile=bin/pdf-analyzer-windows-x64.exe
```

## Development

```bash
# Install dependencies (prefer bun over npm)
bun install

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

Before committing:

```bash
npm run type-check && npm run lint && npm test
```

## Release Process

Branch protection requires releases to go through a PR:

1. `git checkout -b release/vX.Y.Z`
2. Update `CHANGELOG.md` with new version section
3. `git commit -am "Add vX.Y.Z changelog"`
4. `npm version patch --no-git-tag-version` (bumps `package.json` only, no tag)
5. `git commit -am "vX.Y.Z"`
6. Push branch and open PR: `git push -u origin release/vX.Y.Z && gh pr create`
7. Merge the PR
8. Tag the merge commit and push:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   **Note:** Do NOT use `npm version` without `--no-git-tag-version` — it creates a local git tag that points to the release branch commit, not the merge commit on main. The tag must be created manually on the merge commit.

The tag push triggers the release workflow. GitHub Actions handles: binary builds, macOS signing/notarization, GitHub Release creation.

## Apple Code Signing & Notarization

### Entitlements (Required for Bun JIT)

Bun uses JIT compilation. Without entitlements in `entitlements.plist`, signed binaries crash with "Ran out of executable memory".

### Signing Command

```bash
codesign --force --options runtime --entitlements entitlements.plist \
  --sign "Developer ID Application: Your Name ($APPLE_TEAM_ID)" \
  pdf-analyzer-darwin-arm64
```

### Notarization Commands

```bash
# Create ZIP for notarization
zip pdf-analyzer-darwin-arm64.zip pdf-analyzer-darwin-arm64

# Submit for notarization
xcrun notarytool submit pdf-analyzer-darwin-arm64.zip \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# Staple ticket to binary
xcrun stapler staple pdf-analyzer-darwin-arm64
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | API key from Google AI Studio. Auto-loaded from `.env` in CWD |

## CLI Commands

```bash
pdf-analyzer              # Run server (with auto-update check)
pdf-analyzer --version    # Print version
pdf-analyzer --help       # Show help
pdf-analyzer --update     # Manual update check
pdf-analyzer --uninstall  # Remove binary and PATH entries
```

## MCP Tool: analyze_pdf

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pdf_source` | `string \| string[]` | Yes | File path, URL, Gemini URI, or array of cached URIs |
| `queries` | `string[]` | Yes | Questions to ask about the PDF |

## MCP Client Configuration

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer"
    }
  }
}
```

API key is loaded from `.env` file in the current working directory.

## Installation

### macOS / Linux

```bash
FIX
```

### Windows

```powershell
FIX
```

## Error Handling

| Scenario | Response |
|----------|----------|
| Missing GEMINI_API_KEY | Error with setup instructions |
| PDF not found | Error with validated path |
| PDF exceeds token limit | Auto-split into chunks and retry |
| Single page exceeds limit | Error (cannot split further) |
| Gemini API error | Pass through with context |

## Common Issues

### "Ran out of executable memory"
Missing JIT entitlements. Add `entitlements.plist` to codesign command.

### Update loop
`VERSION` in `src/version.ts` doesn't match the release tag. Sync and rebuild.

### 404 on install script
Release marked as `prerelease: true`. GitHub `/releases/latest` ignores prereleases.

### MCP not connecting
- Check PATH: `which pdf-analyzer`
- Restart terminal after install
- Verify GEMINI_API_KEY is set in MCP client config

### npm OIDC Publishing

npm publishing uses OIDC trusted publishing (configured on npmjs.com) - no tokens required.

**Gotchas:**
- Do NOT use `registry-url` with `actions/setup-node` - it creates a `.npmrc` that breaks OIDC
- OIDC requires npm 11.5.1+ (Node 22 ships with older npm, so we explicitly upgrade)
- Use `npm install` not `npm ci` (stricter lockfile validation fails with cross-platform optional deps)
- Don't commit any lockfile (cross-platform optional deps like rollup cause CI failures)
