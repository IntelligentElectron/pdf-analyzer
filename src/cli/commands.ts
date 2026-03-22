/**
 * CLI command handlers for --version, --help, --setup, --update, and --uninstall.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as clack from "@clack/prompts";
import { VERSION, GITHUB_REPO, BINARY_NAME } from "../version.js";
import { checkForUpdate, performUpdate } from "./updater.js";
import { removeFromPath } from "./shell.js";
import {
  getApiKey,
  setApiKey,
  getActiveProvider,
  setActiveProvider,
  getModel,
  setModel,
  deleteAllCredentials,
} from "../keychain.js";
import { providerList } from "../providers/registry.js";

/**
 * Print version information.
 */
export const printVersion = (): void => {
  console.log(`${BINARY_NAME} v${VERSION}`);
};

/**
 * Print help message.
 */
export const printHelp = (): void => {
  console.log(
    `
${BINARY_NAME} v${VERSION}

MCP server for analyzing PDF documents using AI.
Supports Google Gemini, Anthropic Claude, and OpenAI.

USAGE:
  ${BINARY_NAME} [OPTIONS]

OPTIONS:
  --version, -v    Print version and exit
  --setup          Choose an LLM provider and store your API key
  --set-key        Alias for --setup (deprecated)
  --update         Check for updates and apply if available
  --uninstall      Remove ${BINARY_NAME} from the system
  --help, -h       Show this help message

PROVIDER SETUP:
  ${BINARY_NAME} --setup

  Lets you choose a provider (Google Gemini, Anthropic Claude, or OpenAI)
  and stores your API key in the OS credential store (macOS Keychain,
  Windows Credential Manager, or Linux secret-tool).

INSTALLATION:
  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash

MCP CONFIGURATION:
  {
    "mcpServers": {
      "pdf-analyzer": {
        "command": "${BINARY_NAME}"
      }
    }
  }

MORE INFO:
  https://github.com/${GITHUB_REPO}
`.trim()
  );
};

/**
 * Check if a clack prompt was cancelled (Ctrl+C).
 */
function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (clack.isCancel(value)) {
    clack.cancel("Setup cancelled.");
    process.exit(0);
  }
}

/**
 * Handle the --setup flag: choose provider and store API key.
 */
export const handleSetupCommand = async (): Promise<void> => {
  clack.intro("pdf-analyzer setup");

  const existingProvider = getActiveProvider();
  const existingKey = getApiKey();
  const existingModel = getModel();

  if (existingProvider && existingKey) {
    const providerConfig = providerList.find((p) => p.id === existingProvider);
    const providerName = providerConfig?.displayName ?? existingProvider;
    const modelName =
      providerConfig?.models.find((m) => m.id === existingModel)?.displayName ?? existingModel;
    const shouldReconfigure = await clack.confirm({
      message: `Already configured with ${providerName} (${modelName}). Reconfigure?`,
    });
    assertNotCancelled(shouldReconfigure);
    if (!shouldReconfigure) {
      clack.outro("No changes made.");
      return;
    }
  }

  const providerId = await clack.select({
    message: "Choose your LLM provider",
    options: providerList.map((p) => ({
      value: p.id,
      label: p.displayName,
    })),
  });
  assertNotCancelled(providerId);

  const selected = providerList.find((p) => p.id === providerId)!;

  const modelId = await clack.select({
    message: "Choose a model",
    options: selected.models.map((m) => ({
      value: m.id,
      label: `${m.displayName} - ${m.hint}`,
    })),
  });
  assertNotCancelled(modelId);

  const selectedModel = selected.models.find((m) => m.id === modelId)!;

  clack.note(
    `Model: ${selectedModel.displayName} (${modelId})\nGet your API key from: ${selected.apiKeyUrl}`,
    selected.displayName
  );

  const key = await clack.password({
    message: "Enter your API key",
    validate: (value) => {
      if (!value) return "API key is required";
    },
  });
  assertNotCancelled(key);

  try {
    setActiveProvider(selected.id);
    setModel(modelId);
    setApiKey(key);
    clack.outro(`${selected.displayName} (${selectedModel.displayName}) configured successfully.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    clack.cancel(`Failed to store credentials: ${message}`);
    process.exit(1);
  }
};

/**
 * Handle the deprecated --set-key flag.
 */
export const handleSetKeyCommand = async (): Promise<void> => {
  clack.log.warn("--set-key is deprecated. Use --setup instead.");
  await handleSetupCommand();
};

/**
 * Handle the --update flag: check and apply updates interactively.
 */
export const handleUpdateCommand = async (): Promise<void> => {
  console.log(`Current version: ${VERSION}`);
  console.log("Checking for updates...");

  const check = await checkForUpdate();

  if (check.error) {
    console.error(`Error checking for updates: ${check.error}`);
    process.exit(1);
  }

  if (!check.updateAvailable) {
    console.log(`Already up to date (${VERSION})`);
    return;
  }

  if (!check.downloadUrl || !check.latestVersion) {
    console.error("Update available but no download URL found for your platform");
    process.exit(1);
  }

  console.log(`Update available: ${VERSION} -> ${check.latestVersion}`);
  console.log("Downloading...");

  const result = await performUpdate(check.downloadUrl, check.latestVersion);

  if (!result.success) {
    console.error(`Update failed: ${result.error}`);
    process.exit(1);
  }

  const message = `Successfully updated to ${result.newVersion}\n`;
  await new Promise<void>((resolve) => {
    process.stdout.write(message, () => resolve());
  });
};

/**
 * Handle the --uninstall flag: remove pdf-analyzer from the system.
 */
export const handleUninstallCommand = async (): Promise<void> => {
  const home = os.homedir();
  const installDir = path.join(home, `.${BINARY_NAME}`);
  const binaryPath = path.join(installDir, "bin", BINARY_NAME);

  console.log("");
  console.log(`This will remove ${BINARY_NAME} from your system:`);
  console.log(`  - Binary: ${binaryPath}`);
  console.log(`  - Directory: ${installDir}`);
  console.log("  - PATH entries from shell config files");
  console.log("  - Stored credentials from OS credential store");
  console.log("");

  const confirmed = await clack.confirm({
    message: "Are you sure you want to uninstall?",
  });
  assertNotCancelled(confirmed);

  if (!confirmed) {
    console.log("Uninstall cancelled.");
    return;
  }

  console.log("");

  // Remove all stored credentials
  deleteAllCredentials();
  console.log("Removed stored credentials");

  // Remove PATH entries from shell rc files
  const modifiedFiles = removeFromPath();
  if (modifiedFiles.length > 0) {
    console.log("Removed PATH entries from:");
    for (const file of modifiedFiles) {
      console.log(`  - ${file}`);
    }
  }

  // Remove the installation directory
  if (fs.existsSync(installDir)) {
    fs.rmSync(installDir, { recursive: true });
    console.log(`Removed: ${installDir}`);
  }

  console.log("");
  console.log("Uninstall complete!");
  console.log("");
  console.log("To reinstall, run:");
  console.log(
    `  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash`
  );
  console.log("");
};
