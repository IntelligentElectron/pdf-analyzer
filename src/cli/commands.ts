/**
 * CLI command handlers for --version, --help, --update, and --uninstall.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { VERSION, GITHUB_REPO, BINARY_NAME } from "../version.js";
import { checkForUpdate, performUpdate } from "./updater.js";
import { removeFromPath } from "./shell.js";

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

MCP server for analyzing PDF documents using Gemini AI.

USAGE:
  ${BINARY_NAME} [OPTIONS]

OPTIONS:
  --version, -v    Print version and exit
  --update         Check for updates and apply if available
  --uninstall      Remove ${BINARY_NAME} from the system
  --no-update      Skip auto-update check on startup
  --help, -h       Show this help message

ENVIRONMENT VARIABLES:
  GEMINI_API_KEY        Required. Your Gemini API key from Google AI Studio.
  PDF_MCP_NO_UPDATE=1   Disable auto-updates

INSTALLATION:
  curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash

MCP CONFIGURATION:
  {
    "mcpServers": {
      "pdf-analyzer": {
        "command": "${BINARY_NAME}",
        "env": {
          "GEMINI_API_KEY": "your-api-key-here"
        }
      }
    }
  }

MORE INFO:
  https://github.com/${GITHUB_REPO}
`.trim()
  );
};

/**
 * Simple confirmation prompt for terminal.
 */
const confirm = async (message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    process.stdout.write(`${message} [y/N] `);

    const onData = (data: Buffer) => {
      const answer = data.toString().trim().toLowerCase();
      process.stdin.removeListener("data", onData);
      process.stdin.pause();
      resolve(answer === "y" || answer === "yes");
    };

    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", onData);
  });
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

  console.log(`Update available: ${VERSION} → ${check.latestVersion}`);
  console.log("Downloading...");

  const result = await performUpdate(check.downloadUrl, check.latestVersion);

  if (!result.success) {
    console.error(`Update failed: ${result.error}`);
    process.exit(1);
  }

  // On Windows, we need to ensure stdout is flushed before exiting
  // because replacing the running executable can cause issues
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
  console.log("");

  const confirmed = await confirm("Are you sure you want to uninstall?");

  if (!confirmed) {
    console.log("Uninstall cancelled.");
    return;
  }

  console.log("");

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
