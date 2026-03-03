#
# PDF Analyzer MCP Server Installer for Windows
#
# Usage:
#   irm https://raw.githubusercontent.com/IntelligentElectron/pdf-analyzer/main/install.ps1 | iex
#
# Environment variables:
#   PDF_MCP_INSTALL_DIR  Installation directory (default: %LOCALAPPDATA%\pdf-analyzer)
#   PDF_MCP_VERSION      Specific version to install (default: latest)
#

$ErrorActionPreference = "Stop"

# Configuration
$Repo = "IntelligentElectron/pdf-analyzer"
$BinaryName = "pdf-analyzer"
$DefaultInstallDir = Join-Path $env:LOCALAPPDATA "pdf-analyzer"

# Logging functions
function Write-Info { param($Message) Write-Host "[INFO] " -ForegroundColor Blue -NoNewline; Write-Host $Message }
function Write-Success { param($Message) Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $Message }
function Write-Warn { param($Message) Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err { param($Message) Write-Host "[ERROR] " -ForegroundColor Red -NoNewline; Write-Host $Message }

function Get-Platform {
    $arch = $env:PROCESSOR_ARCHITECTURE

    switch ($arch) {
        "AMD64" { return "pdf-analyzer-windows-x64.exe" }
        "x86" {
            Write-Err "32-bit Windows is not supported"
            exit 1
        }
        "ARM64" {
            Write-Warn "Native ARM64 binary not available, using x64-baseline (runs via emulation)"
            return "pdf-analyzer-windows-x64-baseline.exe"
        }
        default {
            Write-Err "Unsupported architecture: $arch"
            exit 1
        }
    }
}

function Get-LatestVersion {
    $url = "https://api.github.com/repos/$Repo/releases/latest"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -UseBasicParsing
        return $response.tag_name
    }
    catch {
        Write-Err "Failed to fetch latest version from GitHub API"
        Write-Err "Please check https://github.com/$Repo/releases"
        exit 1
    }
}

function Get-FileChecksum {
    param($FilePath)

    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

function Add-ToUserPath {
    param($BinDir)

    # Get current user PATH from registry
    $regPath = "HKCU:\Environment"
    $currentPath = (Get-ItemProperty -Path $regPath -Name Path -ErrorAction SilentlyContinue).Path

    if ($null -eq $currentPath) {
        $currentPath = ""
    }

    # Check if already in PATH
    $pathDirs = $currentPath -split ";"
    if ($pathDirs -contains $BinDir) {
        Write-Info "Already in PATH"
        return
    }

    # Add to PATH
    Write-Info "Adding to user PATH via registry"

    if ($currentPath -eq "") {
        $newPath = $BinDir
    }
    else {
        $newPath = "$currentPath;$BinDir"
    }

    Set-ItemProperty -Path $regPath -Name Path -Value $newPath

    # Notify the system of environment variable change
    $HWND_BROADCAST = [IntPtr]0xffff
    $WM_SETTINGCHANGE = 0x1a
    $result = [UIntPtr]::Zero

    if (-not ("Win32.NativeMethods" -as [Type])) {
        Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern IntPtr SendMessageTimeout(
    IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam,
    uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
"@
    }

    [Win32.NativeMethods]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [UIntPtr]::Zero, "Environment", 2, 5000, [ref]$result) | Out-Null

    Write-Success "Added to PATH"
}

function Install-PdfAnalyzerMcp {
    $installDir = if ($env:PDF_MCP_INSTALL_DIR) { $env:PDF_MCP_INSTALL_DIR } else { $DefaultInstallDir }
    $version = $env:PDF_MCP_VERSION

    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "    PDF Analyzer MCP Server Installer" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""

    # Detect platform
    $platform = Get-Platform
    Write-Info "Detected platform: $platform"

    # Get version
    if (-not $version) {
        Write-Info "Fetching latest version..."
        $version = Get-LatestVersion
    }
    Write-Info "Version: $version"

    # Construct URLs
    $downloadUrl = "https://github.com/$Repo/releases/download/$version/$platform"
    $checksumUrl = "https://github.com/$Repo/releases/download/$version/checksums.txt"

    # Create installation directory
    $binDir = Join-Path $installDir "bin"
    if (-not (Test-Path $binDir)) {
        New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    }
    Write-Info "Install directory: $installDir"

    # Download binary
    $tempFile = Join-Path $env:TEMP "$BinaryName-download.exe"
    Write-Info "Downloading from $downloadUrl"

    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing
    }
    catch {
        Write-Err "Download failed: $_"
        exit 1
    }

    # Download and verify checksum
    try {
        $checksumFile = Join-Path $env:TEMP "checksums.txt"
        Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumFile -UseBasicParsing

        $checksumContent = Get-Content $checksumFile
        $expectedLine = $checksumContent | Where-Object { $_ -match $platform }

        if ($expectedLine) {
            $expectedChecksum = ($expectedLine -split "\s+")[0].ToLower()
            $actualChecksum = Get-FileChecksum -FilePath $tempFile

            if ($actualChecksum -ne $expectedChecksum) {
                Write-Err "Checksum verification failed"
                Write-Err "Expected: $expectedChecksum"
                Write-Err "Got: $actualChecksum"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                exit 1
            }
            Write-Success "Checksum verified"
        }
        else {
            Write-Warn "No checksum found for $platform, skipping verification"
        }

        Remove-Item $checksumFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-Warn "Checksums not available, skipping verification"
    }

    # Install binary
    $binaryPath = Join-Path $binDir "$BinaryName.exe"

    # Remove existing binary if present
    if (Test-Path $binaryPath) {
        Remove-Item $binaryPath -Force
    }

    Move-Item $tempFile $binaryPath -Force
    Write-Success "Installed to $binaryPath"

    # Add to PATH
    Add-ToUserPath -BinDir $binDir

    # Update current session's PATH so command is immediately available
    if ($env:Path -notlike "*$binDir*") {
        $env:Path = "$binDir;$env:Path"
    }

    # Print success message
    Write-Host ""
    Write-Success "Installation complete!"
    Write-Host ""
    Write-Host "Verify with:"
    Write-Host "  pdf-analyzer --version"
    Write-Host ""
    Write-Host "To update, run:"
    Write-Host "  pdf-analyzer --update"
    Write-Host ""
    Write-Host "Configure your MCP client with:"
    Write-Host '  {"mcpServers": {"pdf-analyzer": {"command": "pdf-analyzer"}}}'
    Write-Host ""

    # Prompt user to store API key
    Request-ApiKey
}

function Request-ApiKey {
    # Check for existing key in Windows Credential Manager
    $existingKey = $false
    try {
        $cmdkeyOutput = cmdkey /list:pdf-analyzer 2>&1
        if ($cmdkeyOutput -match "pdf-analyzer") {
            $existingKey = $true
        }
    }
    catch {}

    if ($existingKey) {
        $overwrite = Read-Host "A Gemini API key is already stored. Overwrite it? [y/N]"
        if ($overwrite -ne "y" -and $overwrite -ne "Y") {
            Write-Success "Keeping existing API key."
            Write-Host ""
            return
        }
    }
    else {
        $answer = Read-Host "Would you like to store your Gemini API key now? [y/N]"
        if ($answer -ne "y" -and $answer -ne "Y") {
            Write-Host ""
            Write-Host "You can store your key later with:"
            Write-Host "  pdf-analyzer --set-key"
            Write-Host ""
            return
        }
    }

    $secureKey = Read-Host "Enter your Gemini API key" -AsSecureString
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    )

    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Warn "No key entered. You can store your key later with: pdf-analyzer --set-key"
        return
    }

    try {
        $null = cmdkey /generic:pdf-analyzer /user:GEMINI_API_KEY /pass:$apiKey 2>&1
        Write-Success "API key stored successfully."
    }
    catch {
        Write-Warn "Could not store API key in credential store."
        Write-Host "  You can try again with: pdf-analyzer --set-key"
    }
    Write-Host ""
}

# Run installer
Install-PdfAnalyzerMcp
