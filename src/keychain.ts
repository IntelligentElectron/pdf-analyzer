/**
 * OS-native credential storage.
 *
 * Uses platform CLI tools (no native addons) so it works with Bun-compiled binaries.
 * - macOS: `security` CLI (Keychain Access)
 * - Windows: `cmdkey` + PowerShell (Credential Manager)
 * - Linux: `secret-tool` (libsecret), if available
 */

import { execSync } from "node:child_process";

const DEFAULT_SERVICE = "pdf-analyzer";

/** Stdio config that prevents credential leaks to MCP stdio transport. */
const SILENT_STDIO: ["pipe", "pipe", "pipe"] = ["pipe", "pipe", "pipe"];

/**
 * Escape a string for safe use as a shell argument.
 * Wraps in single quotes and escapes any embedded single quotes.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// macOS (Keychain)
// ---------------------------------------------------------------------------

function getMacOS(service: string, account: string): string | null {
  try {
    return execSync(
      `security find-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(account)} -w`,
      { stdio: SILENT_STDIO, encoding: "utf-8" }
    ).trim();
  } catch {
    return null;
  }
}

function setMacOS(service: string, account: string, value: string): void {
  execSync(
    `security add-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(account)} -w ${escapeShellArg(value)} -U`,
    { stdio: SILENT_STDIO }
  );
}

function deleteMacOS(service: string, account: string): void {
  try {
    execSync(
      `security delete-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(account)}`,
      { stdio: SILENT_STDIO }
    );
  } catch {
    // Credential may not exist; ignore
  }
}

// ---------------------------------------------------------------------------
// Windows (Credential Manager)
// ---------------------------------------------------------------------------

/** Build a Windows credential target from service + account. */
function winTarget(service: string, account: string): string {
  return `${service}/${account}`;
}

function getWindows(service: string, account: string): string | null {
  try {
    const target = winTarget(service, account);
    const script = `
Add-Type -Namespace Win32 -Name Cred -MemberDefinition @'
[DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
[DllImport("advapi32.dll")]
public static extern void CredFree(IntPtr cred);
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct CREDENTIAL {
  public int Flags; public int Type; public string TargetName;
  public string Comment; public long LastWritten; public int CredentialBlobSize;
  public IntPtr CredentialBlob; public int Persist; public int AttributeCount;
  public IntPtr Attributes; public string TargetAlias; public string UserName;
}
'@
$ptr = [IntPtr]::Zero
if ([Win32.Cred]::CredRead("${target}", 1, 0, [ref]$ptr)) {
  $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [Type][Win32.Cred+CREDENTIAL])
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob, $c.CredentialBlobSize/2)
  [Win32.Cred]::CredFree($ptr)
  Write-Output $secret
}`;

    return (
      execSync(`powershell -NoProfile -Command "${script.replace(/"/g, '\\"')}"`, {
        stdio: SILENT_STDIO,
        encoding: "utf-8",
      }).trim() || null
    );
  } catch {
    return null;
  }
}

function setWindows(service: string, account: string, value: string): void {
  const target = winTarget(service, account);
  execSync(`cmdkey /generic:${target} /user:${account} /pass:${escapeShellArg(value)}`, {
    stdio: SILENT_STDIO,
    shell: "cmd.exe",
  });
}

function deleteWindows(service: string, account: string): void {
  try {
    const target = winTarget(service, account);
    execSync(`cmdkey /delete:${target}`, {
      stdio: SILENT_STDIO,
      shell: "cmd.exe",
    });
  } catch {
    // Credential may not exist; ignore
  }
}

// ---------------------------------------------------------------------------
// Linux (libsecret / secret-tool)
// ---------------------------------------------------------------------------

function getLinux(service: string, account: string): string | null {
  try {
    return (
      execSync(
        `secret-tool lookup service ${escapeShellArg(service)} username ${escapeShellArg(account)}`,
        { stdio: SILENT_STDIO, encoding: "utf-8" }
      ).trim() || null
    );
  } catch {
    return null;
  }
}

function setLinux(service: string, account: string, value: string): void {
  execSync(
    `echo -n ${escapeShellArg(value)} | secret-tool store --label=${escapeShellArg(service)} service ${escapeShellArg(service)} username ${escapeShellArg(account)}`,
    { stdio: SILENT_STDIO }
  );
}

function deleteLinux(service: string, account: string): void {
  try {
    execSync(
      `secret-tool clear service ${escapeShellArg(service)} username ${escapeShellArg(account)}`,
      { stdio: SILENT_STDIO }
    );
  } catch {
    // Credential may not exist or secret-tool unavailable; ignore
  }
}

// ---------------------------------------------------------------------------
// Generic credential operations
// ---------------------------------------------------------------------------

/** Read a value from the OS credential store. */
export function getStoredValue(account: string, service: string = DEFAULT_SERVICE): string | null {
  switch (process.platform) {
    case "darwin":
      return getMacOS(service, account);
    case "win32":
      return getWindows(service, account);
    case "linux":
      return getLinux(service, account);
    default:
      return null;
  }
}

/** Write a value to the OS credential store. */
export function setStoredValue(
  account: string,
  value: string,
  service: string = DEFAULT_SERVICE
): void {
  switch (process.platform) {
    case "darwin":
      setMacOS(service, account, value);
      break;
    case "win32":
      setWindows(service, account, value);
      break;
    case "linux":
      setLinux(service, account, value);
      break;
    default:
      throw new Error(`Credential storage is not supported on ${process.platform}`);
  }
}

/** Remove a value from the OS credential store (best-effort). */
export function deleteStoredValue(account: string, service: string = DEFAULT_SERVICE): void {
  switch (process.platform) {
    case "darwin":
      deleteMacOS(service, account);
      break;
    case "win32":
      deleteWindows(service, account);
      break;
    case "linux":
      deleteLinux(service, account);
      break;
    default:
      // No-op on unsupported platforms
      break;
  }
}

// ---------------------------------------------------------------------------
// Convenience API for provider and API key storage
// ---------------------------------------------------------------------------

const PROVIDER_ACCOUNT = "PROVIDER";
const API_KEY_ACCOUNT = "API_KEY";
const MODEL_ACCOUNT = "MODEL";
const VERTEX_PROJECT_ACCOUNT = "VERTEX_PROJECT";
const VERTEX_LOCATION_ACCOUNT = "VERTEX_LOCATION";
const VERTEX_KEY_FILE_ACCOUNT = "VERTEX_KEY_FILE";

/** Get the active provider ID. Returns null if not set. */
export function getActiveProvider(): string | null {
  return getStoredValue(PROVIDER_ACCOUNT);
}

/** Store the active provider ID. */
export function setActiveProvider(providerId: string): void {
  setStoredValue(PROVIDER_ACCOUNT, providerId);
}

/** Get the stored API key. Returns null if not found. */
export function getApiKey(): string | null {
  return getStoredValue(API_KEY_ACCOUNT);
}

/** Store the API key. */
export function setApiKey(key: string): void {
  setStoredValue(API_KEY_ACCOUNT, key);
}

/** Get the stored model ID. Returns null if not set. */
export function getModel(): string | null {
  return getStoredValue(MODEL_ACCOUNT);
}

/** Store the selected model ID. */
export function setModel(modelId: string): void {
  setStoredValue(MODEL_ACCOUNT, modelId);
}

/** Get the stored Vertex AI project ID. Returns null if not set. */
export function getVertexProject(): string | null {
  return getStoredValue(VERTEX_PROJECT_ACCOUNT);
}

/** Store the Vertex AI project ID. */
export function setVertexProject(value: string): void {
  setStoredValue(VERTEX_PROJECT_ACCOUNT, value);
}

/** Get the stored Vertex AI location. Returns null if not set. */
export function getVertexLocation(): string | null {
  return getStoredValue(VERTEX_LOCATION_ACCOUNT);
}

/** Store the Vertex AI location. */
export function setVertexLocation(value: string): void {
  setStoredValue(VERTEX_LOCATION_ACCOUNT, value);
}

/** Get the stored Vertex AI service account key file path. Returns null if not set. */
export function getVertexKeyFile(): string | null {
  return getStoredValue(VERTEX_KEY_FILE_ACCOUNT);
}

/** Store the Vertex AI service account key file path. */
export function setVertexKeyFile(value: string): void {
  setStoredValue(VERTEX_KEY_FILE_ACCOUNT, value);
}

/** Delete Vertex-specific credentials (project, location, key file). Best-effort. */
export function deleteVertexCredentials(): void {
  deleteStoredValue(VERTEX_PROJECT_ACCOUNT);
  deleteStoredValue(VERTEX_LOCATION_ACCOUNT);
  deleteStoredValue(VERTEX_KEY_FILE_ACCOUNT);
}

/** Delete all stored credentials (provider + API key + model + Vertex). Best-effort. */
export function deleteAllCredentials(): void {
  deleteStoredValue(PROVIDER_ACCOUNT);
  deleteStoredValue(API_KEY_ACCOUNT);
  deleteStoredValue(MODEL_ACCOUNT);
  deleteStoredValue(VERTEX_PROJECT_ACCOUNT);
  deleteStoredValue(VERTEX_LOCATION_ACCOUNT);
  deleteStoredValue(VERTEX_KEY_FILE_ACCOUNT);
}
