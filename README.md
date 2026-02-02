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
3. Create a `.env` file in your project folder:

```
GEMINI_API_KEY=your-api-key-here
```

The server automatically loads the API key from `.env` in your current working directory.

## Connect the MCP with your favorite AI tool

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "pdf-analyzer"
    }
  }
}
```

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add pdf-analyzer -- pdf-analyzer
```

Or using the standalone binary path:

macOS:

```bash
claude mcp add pdf-analyzer -- ~/Library/Application\ Support/pdf-analyzer/bin/pdf-analyzer
```

Linux:

```bash
claude mcp add pdf-analyzer -- ~/.pdf-analyzer/bin/pdf-analyzer
```

</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add to `.vscode/mcp.json` in your project.

**macOS:**

```json
{
  "servers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "/Users/YOUR_USERNAME/Library/Application Support/pdf-analyzer/bin/pdf-analyzer"
    }
  }
}
```

**Linux:**

```json
{
  "servers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "/home/YOUR_USERNAME/.pdf-analyzer/bin/pdf-analyzer"
    }
  }
}
```

**Windows:**

```json
{
  "servers": {
    "pdf-analyzer": {
      "type": "stdio",
      "command": "C:\\Users\\YOUR_USERNAME\\AppData\\Local\\pdf-analyzer\\bin\\pdf-analyzer.exe"
    }
  }
}
```

Then enable in **Configure Tools** (click the tools icon in Copilot chat).

</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Add to `~/.gemini/settings.json` (global) or `.gemini/settings.json` (project).

**macOS:**

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "/Users/YOUR_USERNAME/Library/Application Support/pdf-analyzer/bin/pdf-analyzer"
    }
  }
}
```

**Linux:**

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "/home/YOUR_USERNAME/.pdf-analyzer/bin/pdf-analyzer"
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "pdf-analyzer": {
      "command": "C:\\Users\\YOUR_USERNAME\\AppData\\Local\\pdf-analyzer\\bin\\pdf-analyzer.exe"
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
