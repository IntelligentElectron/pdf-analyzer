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

## Get Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key (free tier available)
3. Add the key to your MCP client configuration (see below)

## Connect the MCP with your favorite AI tool

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

<details>
<summary><strong>Claude Code</strong></summary>

Add to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot/Continue)</strong></summary>

Add to your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer",
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

</details>

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
| macOS (Apple Silicon) | `pdf-analyzer-darwin-arm64` |
| macOS (Intel) | `pdf-analyzer-darwin-x64` |
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
