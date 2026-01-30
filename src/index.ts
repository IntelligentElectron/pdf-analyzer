#!/usr/bin/env node

/**
 * PDF Analyzer MCP Server Entry Point
 *
 * Run with: npx tsx src/index.ts
 * Or after build: node dist/index.js
 *
 * CLI flags:
 *   --version, -v    Print version and exit
 *   --update         Check for updates and apply if available
 *   --uninstall      Remove pdf-analyzer from the system
 *   --no-update      Skip auto-update check on startup
 *   --help, -h       Show help
 *
 * Environment variables:
 *   GEMINI_API_KEY        Required. Your Gemini API key.
 *   PDF_MCP_NO_UPDATE=1   Disable auto-updates
 */

import { autoUpdate, reexec } from "./cli/updater.js";
import {
  printVersion,
  printHelp,
  handleUpdateCommand,
  handleUninstallCommand,
} from "./cli/commands.js";
import { runServer } from "./server.js";

/**
 * Main entry point for the PDF Analyzer MCP server.
 */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);

  // Handle --version / -v
  if (args.includes("--version") || args.includes("-v")) {
    printVersion();
    return;
  }

  // Handle --help / -h
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  // Handle --update
  if (args.includes("--update")) {
    await handleUpdateCommand();
    return;
  }

  // Handle --uninstall
  if (args.includes("--uninstall")) {
    await handleUninstallCommand();
    return;
  }

  // Auto-update check on startup (unless --no-update or env var)
  const skipUpdate = args.includes("--no-update") || process.env.PDF_MCP_NO_UPDATE === "1";

  if (!skipUpdate) {
    const updated = await autoUpdate();
    if (updated) {
      reexec();
    }
  }

  await runServer();
};

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
