import { createRequire } from "node:module";

// BUILD_VERSION is injected at compile time via --define (for Bun binaries)
declare const BUILD_VERSION: string | undefined;

/** Current version of the PDF Analyzer MCP Server */
export const VERSION = (() => {
  // Bun compiled binary: use injected version
  if (typeof BUILD_VERSION !== "undefined") {
    return BUILD_VERSION;
  }
  // Node.js/npm: read from package.json
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0-dev";
  }
})();

/** GitHub repository for release downloads */
export const GITHUB_REPO = "IntelligentElectron/pdf-analyzer";

/** Binary name for the compiled executable */
export const BINARY_NAME = "pdf-analyzer";

/** Default installation directory for the binary */
export const DEFAULT_INSTALL_DIR = (() => {
  if (process.platform === "win32") {
    return `${process.env.LOCALAPPDATA || "C:\\Program Files"}\\pdf-analyzer`;
  }
  if (process.platform === "darwin") {
    return `${process.env.HOME}/Library/Application Support/pdf-analyzer`;
  }
  return `${process.env.HOME}/.pdf-analyzer`;
})();
