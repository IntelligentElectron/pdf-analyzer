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
  deleteStoredValue,
  deleteVertexCredentials,
  setVertexProject,
  setVertexLocation,
  setVertexKeyFile,
} from "../keychain.js";
import { getSetupProviderList } from "../providers/registry.js";

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
Supports Google Gemini, Google Vertex AI, Anthropic Claude, and OpenAI.

USAGE:
  ${BINARY_NAME} [OPTIONS]

OPTIONS:
  --version, -v    Print version and exit
  --setup          Choose an LLM provider and store credentials
  --set-key        Alias for --setup (deprecated)
  --update         Check for updates and apply if available
  --uninstall      Remove ${BINARY_NAME} from the system
  --help, -h       Show this help message

PROVIDER SETUP:
  ${BINARY_NAME} --setup

  Lets you choose a provider and stores credentials in the OS credential
  store (macOS Keychain, Windows Credential Manager, or Linux secret-tool).
  Vertex AI providers authenticate with a service account JSON key file.

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
 * Resolve a file path, expanding ~ to home directory and resolving to absolute.
 */
function resolveKeyFilePath(p: string): string {
  if (p.startsWith("~")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

/**
 * Check if a provider is a Vertex AI provider (uses service account auth, not API key).
 */
function isVertexProvider(id: string): boolean {
  return id.includes("-vertex");
}

/**
 * Validate a service account JSON key file at the given path.
 * Returns an error message string if invalid, or undefined if valid.
 */
function validateKeyFile(value: string | undefined): string | undefined {
  if (!value) return "Key file path is required";
  const resolved = resolveKeyFilePath(value);
  if (!fs.existsSync(resolved)) return `File not found: ${resolved}`;
  try {
    const content = JSON.parse(fs.readFileSync(resolved, "utf-8"));
    if (content.type !== "service_account") {
      return "Not a service account key (expected type: service_account)";
    }
    if (!content.project_id) return "Key file is missing project_id";
  } catch {
    return "File is not valid JSON";
  }
}

/**
 * Prompt user for a service account JSON key file path.
 */
function promptForKeyFile() {
  return clack.text({
    message: "Path to service account JSON key file",
    placeholder: "/path/to/service-account-key.json",
    validate: validateKeyFile,
  });
}

/**
 * Handle the --setup flag: choose provider and store credentials.
 */
export const handleSetupCommand = async (): Promise<void> => {
  clack.intro("pdf-analyzer setup");

  const allProviders = await getSetupProviderList();

  const existingProvider = getActiveProvider();
  const existingKey = getApiKey();
  const existingModel = getModel();

  if (existingProvider && (existingKey || isVertexProvider(existingProvider))) {
    const providerConfig = allProviders.find((p) => p.id === existingProvider);
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
    options: allProviders.map((p) => ({
      value: p.id,
      label: p.displayName,
    })),
  });
  assertNotCancelled(providerId);

  const selected = allProviders.find((p) => p.id === providerId)!;

  const modelId = await clack.select({
    message: "Choose a model",
    options: selected.models.map((m) => ({
      value: m.id,
      label: `${m.displayName} - ${m.hint}`,
    })),
  });
  assertNotCancelled(modelId);

  const selectedModel = selected.models.find((m) => m.id === modelId)!;

  try {
    if (isVertexProvider(selected.id)) {
      // Vertex AI: detect GOOGLE_APPLICATION_CREDENTIALS or prompt for key file
      let resolvedPath: string;

      const envKeyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (envKeyFile && !validateKeyFile(envKeyFile)) {
        const resolved = resolveKeyFilePath(envKeyFile);
        const useEnvFile = await clack.confirm({
          message: `Detected GOOGLE_APPLICATION_CREDENTIALS: ${resolved}\n  Use this service account key?`,
        });
        assertNotCancelled(useEnvFile);

        if (useEnvFile) {
          resolvedPath = resolved;
        } else {
          const keyFilePath = await promptForKeyFile();
          assertNotCancelled(keyFilePath);
          resolvedPath = resolveKeyFilePath(keyFilePath);
        }
      } else {
        clack.note(
          "Set GOOGLE_APPLICATION_CREDENTIALS in your shell to auto-detect next time.\nYou can also drag and drop the file into the terminal.",
          "Service Account Key"
        );
        const keyFilePath = await promptForKeyFile();
        assertNotCancelled(keyFilePath);
        resolvedPath = resolveKeyFilePath(keyFilePath);
      }

      const keyContent = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

      const project = await clack.text({
        message: "Google Cloud project ID",
        defaultValue: keyContent.project_id,
        placeholder: keyContent.project_id,
      });
      assertNotCancelled(project);

      const location = await clack.text({
        message: "Vertex AI location",
        defaultValue: "us-central1",
        placeholder: "us-central1",
      });
      assertNotCancelled(location);

      setActiveProvider(selected.id);
      setModel(modelId);
      setVertexKeyFile(resolvedPath);
      setVertexProject(project);
      setVertexLocation(location);
      deleteStoredValue("API_KEY");
    } else {
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

      setActiveProvider(selected.id);
      setModel(modelId);
      setApiKey(key);
      deleteVertexCredentials();
    }

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
