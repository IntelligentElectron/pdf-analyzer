# PDF Analyzer MCP Server

The **PDF Analyzer MCP Server** gives AI agents the ability to read and
analyze PDF documents, enabling document Q&A through natural conversations.

Supports multiple LLM providers: **Google Gemini**, **Anthropic Claude**, and **OpenAI**. Choose your preferred provider and model during setup.

## Native Install (Recommended)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/IntelligentElectron/pdf-analyzer/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/IntelligentElectron/pdf-analyzer/main/install.ps1 | iex
```

Why use the native installer:
- **No dependencies** — standalone binary, no Node.js required
- **Auto-updates** — checks for updates on startup
- **Signed binaries** — macOS binaries are notarized by Apple

| Platform | Install Directory |
|----------|-------------------|
| macOS | `~/Library/Application Support/pdf-analyzer/` |
| Linux | `~/.pdf-analyzer/` |
| Windows | `%LOCALAPPDATA%\pdf-analyzer\` |

### Update

The server checks for updates on startup. To update manually:

```bash
pdf-analyzer --update
```

## Alternative: Install via npm

For developers who prefer npm:

```bash
npm install -g @intelligentelectron/pdf-analyzer
```

Or use with npx (no installation required):

```bash
npx @intelligentelectron/pdf-analyzer --help
```

Requires Node.js 20+.

To update:

```bash
npm update -g @intelligentelectron/pdf-analyzer
```

## Setup

After installing, run the interactive setup to choose your provider, model, and enter your API key:

```bash
pdf-analyzer --setup
```

You'll be prompted to choose from:

| Provider | Fast Model | Flagship Model | Get API Key |
|----------|-----------|----------------|-------------|
| Google Gemini | Gemini 3 Flash | Gemini 3.1 Pro | [Google AI Studio](https://aistudio.google.com/apikey) |
| Anthropic Claude | Claude Sonnet 4.6 | Claude Opus 4.6 | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| OpenAI GPT | GPT-5.4 Mini | GPT-5.4 | [OpenAI Platform](https://platform.openai.com/api-keys) |

You can re-run `--setup` at any time to switch providers or models.

## Connect the MCP with your favorite AI tool

After setup, connect the MCP to your AI agent of choice.

### Claude Code

Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code), then run:

```bash
claude mcp add --scope user pdf-analyzer -- pdf-analyzer
```

### OpenAI Codex

Install [OpenAI Codex](https://developers.openai.com/codex/cli/), then run:

```bash
codex mcp add pdf-analyzer -- pdf-analyzer
```

### Gemini CLI

Install [Gemini CLI](https://geminicli.com/docs/get-started/installation/), then run:

```bash
gemini mcp add --scope user pdf-analyzer pdf-analyzer
```

### VS Code (GitHub Copilot)

Download [VS Code](https://code.visualstudio.com/)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "pdf-analyzer"
    }
  }
}
```

Then enable it in **Configure Tools** (click the tools icon in Copilot chat).

## Usage

Once connected, ask your AI assistant to analyze any PDF:

- "Analyze /path/to/document.pdf and summarize the key points"
- "What tables are in this PDF? Extract the data from table 2"
- "Compare the findings in sections 3 and 5 of this report"

The server accepts:
- Local file paths: `/Users/name/docs/report.pdf`
- URLs: `https://example.com/document.pdf`

## Supported Platforms

| Platform | Binary |
|----------|--------|
| macOS (Universal) | `pdf-analyzer-darwin-universal` |
| Linux (x64) | `pdf-analyzer-linux-x64` |
| Linux (ARM64) | `pdf-analyzer-linux-arm64` |
| Windows (x64) | `pdf-analyzer-windows-x64.exe` |

## Documentation

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## About

Created by **Valentino Zegna**

This project is hosted on GitHub under the [IntelligentElectron](https://github.com/IntelligentElectron) organization.

## License

Apache License 2.0 - see [LICENSE](LICENSE)
