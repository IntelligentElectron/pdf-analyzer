# PDF Analyzer MCP Server

The **PDF Analyzer MCP Server** gives AI agents the ability to read and
analyze PDF documents, enabling document Q&A through natural conversations.

Powered by Google's Gemini API. You'll need a free API key from Google AI Studio.

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

## Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key (free tier available)
3. Copy your API key, we will use it to setup the MCP in the next section

## Connect the MCP with your favorite AI tool

After installing the MCP with one of the methods above, you can connect it to your AI agent of choice.

### Claude Code

Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code), then run:

```bash
claude mcp add --scope user pdf-analyzer --env GEMINI_API_KEY=your-key -- pdf-analyzer
```

### OpenAI Codex

Install [OpenAI Codex](https://developers.openai.com/codex/cli/), then run:

```bash
codex mcp add pdf-analyzer --env GEMINI_API_KEY=your-key -- pdf-analyzer
```

### Gemini CLI

Install [Gemini CLI](https://geminicli.com/docs/get-started/installation/), then run:

```bash
gemini mcp add --scope user -e GEMINI_API_KEY=your-key pdf-analyzer pdf-analyzer
```

### VS Code (GitHub Copilot)

Download [VS Code](https://code.visualstudio.com/)

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "pdf-analyzer",
      "env": {
        "GEMINI_API_KEY": "your-key"
      }
    }
  }
}
```

Then enable it in **Configure Tools** (click the tools icon in Copilot chat).

> **Warning:** Do not commit `.vscode/mcp.json` to version control — it contains your API key. Add it to your `.gitignore`.

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
