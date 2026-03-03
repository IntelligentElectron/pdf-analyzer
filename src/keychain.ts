/**
 * OS-native credential storage for GEMINI_API_KEY.
 *
 * Uses platform CLI tools (no native addons) so it works with Bun-compiled binaries.
 * - macOS: `security` CLI (Keychain Access)
 * - Windows: `cmdkey` + PowerShell (Credential Manager)
 * - Linux: `secret-tool` (libsecret), if available
 */

import { execSync } from "node:child_process";

const DEFAULT_SERVICE_NAME = "pdf-analyzer";
const ACCOUNT_NAME = "GEMINI_API_KEY";

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

function getMacOS(service: string): string | null {
  try {
    return execSync(
      `security find-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(ACCOUNT_NAME)} -w`,
      { stdio: SILENT_STDIO, encoding: "utf-8" }
    ).trim();
  } catch {
    return null;
  }
}

function setMacOS(service: string, key: string): void {
  execSync(
    `security add-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(ACCOUNT_NAME)} -w ${escapeShellArg(key)} -U`,
    { stdio: SILENT_STDIO }
  );
}

function deleteMacOS(service: string): void {
  try {
    execSync(
      `security delete-generic-password -s ${escapeShellArg(service)} -a ${escapeShellArg(ACCOUNT_NAME)}`,
      { stdio: SILENT_STDIO }
    );
  } catch {
    // Credential may not exist; ignore
  }
}

// ---------------------------------------------------------------------------
// Windows (Credential Manager)
// ---------------------------------------------------------------------------

function getWindows(service: string): string | null {
  try {
    // cmdkey cannot read credential values, so we use PowerShell with P/Invoke
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
if ([Win32.Cred]::CredRead("${service}", 1, 0, [ref]$ptr)) {
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

function setWindows(service: string, key: string): void {
  execSync(`cmdkey /generic:${service} /user:${ACCOUNT_NAME} /pass:${escapeShellArg(key)}`, {
    stdio: SILENT_STDIO,
    shell: "cmd.exe",
  });
}

function deleteWindows(service: string): void {
  try {
    execSync(`cmdkey /delete:${service}`, {
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

function getLinux(service: string): string | null {
  try {
    return (
      execSync(
        `secret-tool lookup service ${escapeShellArg(service)} username ${escapeShellArg(ACCOUNT_NAME)}`,
        { stdio: SILENT_STDIO, encoding: "utf-8" }
      ).trim() || null
    );
  } catch {
    return null;
  }
}

function setLinux(service: string, key: string): void {
  execSync(
    `echo -n ${escapeShellArg(key)} | secret-tool store --label=${escapeShellArg(service)} service ${escapeShellArg(service)} username ${escapeShellArg(ACCOUNT_NAME)}`,
    { stdio: SILENT_STDIO }
  );
}

function deleteLinux(service: string): void {
  try {
    execSync(
      `secret-tool clear service ${escapeShellArg(service)} username ${escapeShellArg(ACCOUNT_NAME)}`,
      { stdio: SILENT_STDIO }
    );
  } catch {
    // Credential may not exist or secret-tool unavailable; ignore
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Read the stored API key from the OS credential store. Returns null if not found. */
export function getStoredApiKey(service: string = DEFAULT_SERVICE_NAME): string | null {
  switch (process.platform) {
    case "darwin":
      return getMacOS(service);
    case "win32":
      return getWindows(service);
    case "linux":
      return getLinux(service);
    default:
      return null;
  }
}

/** Write the API key to the OS credential store. */
export function setStoredApiKey(key: string, service: string = DEFAULT_SERVICE_NAME): void {
  switch (process.platform) {
    case "darwin":
      setMacOS(service, key);
      break;
    case "win32":
      setWindows(service, key);
      break;
    case "linux":
      setLinux(service, key);
      break;
    default:
      throw new Error(`Credential storage is not supported on ${process.platform}`);
  }
}

/** Remove the stored API key from the OS credential store (best-effort). */
export function deleteStoredApiKey(service: string = DEFAULT_SERVICE_NAME): void {
  switch (process.platform) {
    case "darwin":
      deleteMacOS(service);
      break;
    case "win32":
      deleteWindows(service);
      break;
    case "linux":
      deleteLinux(service);
      break;
    default:
      // No-op on unsupported platforms
      break;
  }
}
