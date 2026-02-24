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
 *   --help, -h       Show help
 *
 * Environment variables:
 *   GEMINI_API_KEY        Required. Your Gemini API key.
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

  // If running in a TTY (interactive terminal), show help instead of starting server
  if (process.stdin.isTTY) {
    console.log("This is an MCP server that communicates via stdio.");
    console.log("It should be run by an MCP client, not directly.\n");
    console.log("For setup instructions, see:");
    console.log(`  https://github.com/IntelligentElectron/pdf-analyzer\n`);
    console.log("Run with --help for available options.");
    return;
  }

  // Auto-update check on startup
  const updated = await autoUpdate();
  if (updated) {
    reexec();
  }

  await runServer();
};

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
