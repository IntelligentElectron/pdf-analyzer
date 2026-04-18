# PDF Analyzer MCP Server

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

## CRITICAL: Model Configuration

Models per provider (do not change without discussion). Users choose during `--setup`:

- **Google Gemini**: `gemini-3-flash-preview` (fast) / `gemini-3.1-pro-preview` (flagship)
- **Anthropic Claude**: `claude-sonnet-4-6` (fast) / `claude-opus-4-7` (flagship) / `claude-opus-4-6` (previous flagship, still selectable)
- **OpenAI**: `gpt-5.4-mini` (fast) / `gpt-5.4` (flagship)

Thinking/reasoning is set to minimum for all models (document analysis doesn't benefit from extended thinking).

References (Google File API for large PDFs):
- <https://ai.google.dev/gemini-api/docs/document-processing>
- <https://ai.google.dev/gemini-api/docs/document-processing#large-pdfs>
- <https://ai.google.dev/gemini-api/docs/files>

## Overview

Standalone MCP server for analyzing PDF documents using AI. Supports multiple LLM providers (Google Gemini, Anthropic Claude, OpenAI) via the Vercel AI SDK. Distributed as self-updating binaries for all platforms. Users choose their provider and provide an API key during setup.

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

## Testing with PDFs

Always use `test/fixtures/1-pager.pdf` for MCP tool testing. It is small and cheap on LLM API calls. Never use `test/fixtures/oversized-doc.pdf` or other large PDFs unless the user gives explicit approval.

## Deploying to Cloud Run

The deploy scripts (`deploy/gcloud.sh` and `deploy/main.tf`) support every provider and both auth modes; which one runs is decided by `PDF_ANALYZER_PROVIDER` in `deploy/env` (gcloud) or `provider_id` in `terraform.tfvars`:

- `google-vertex`, `anthropic-vertex` → ADC via attached service account, no API key required
- `google`, `anthropic`, `openai` → API key pulled from a Secret Manager secret named in `API_KEY_SECRET_NAME` / `api_key_secret_name`

See `deploy/README.md` for the full matrix, required IAM roles per provider, and the one-time `gcloud secrets create` command for the direct-API providers. The service is always deployed `--no-allow-unauthenticated` (private).

### Running the remote MCP locally

Because the service requires authenticated invocation, MCP clients connect through a local proxy that mints fresh identity tokens per request:

```bash
gcloud run services proxy <service-name> \
  --project=<project-id> --region=<region> --port=8080
```

Point `.mcp.json`'s HTTP MCP entry at `http://localhost:8080/mcp`. When the proxy stops, the MCP disconnects until you start it again. No secrets live in `.mcp.json` — auth is handled per-request by the proxy against your ADC.

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

## Credential Storage

The provider ID and API key are stored in the OS credential store (macOS Keychain, Linux `secret-tool`, Windows Credential Manager). Users set them via `pdf-analyzer --setup` or during installation. Backward compatible with the legacy `GEMINI_API_KEY` credential.

## CLI Commands

```bash
pdf-analyzer              # Run server (with auto-update check)
pdf-analyzer --version    # Print version
pdf-analyzer --help       # Show help
pdf-analyzer --setup      # Choose provider and store API key
pdf-analyzer --set-key    # Deprecated alias for --setup
pdf-analyzer --update     # Manual update check
pdf-analyzer --uninstall  # Remove binary and PATH entries
```

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
- Verify provider is configured: `pdf-analyzer --setup`

### npm OIDC Publishing

npm publishing uses OIDC trusted publishing (configured on npmjs.com) - no tokens required.

**Gotchas:**
- Do NOT use `registry-url` with `actions/setup-node` - it creates a `.npmrc` that breaks OIDC
- OIDC requires npm 11.5.1+ (Node 22 ships with older npm, so we explicitly upgrade)
- Use `npm install` not `npm ci` (stricter lockfile validation fails with cross-platform optional deps)
- Don't commit any lockfile (cross-platform optional deps like rollup cause CI failures)
