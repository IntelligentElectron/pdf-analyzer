/** Current version of the PDF Analyzer MCP Server */
export const VERSION = "0.0.1";

/** GitHub repository for release downloads */
export const GITHUB_REPO = "westworld-ai/pdf-analyzer-mcp";

/** Binary name for the compiled executable */
export const BINARY_NAME = "pdf-analyzer-mcp";

/** Default installation directory for the binary */
export const DEFAULT_INSTALL_DIR =
  process.platform === "win32"
    ? `${process.env.LOCALAPPDATA || "C:\\Program Files"}\\pdf-analyzer-mcp`
    : `${process.env.HOME}/.local/bin`;
