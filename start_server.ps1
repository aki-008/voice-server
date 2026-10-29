<#
.SYNOPSIS
    Bootstrap and start the Voice Server dev backend.

.DESCRIPTION
    PowerShell equivalent of start_server.sh: verifies node/npm, installs
    dependencies only when they are missing or stale, then runs
    `npm run dev:server`.

    -Language sets the default transcription language (BCP-47 code or `auto`)
    for the app and its client UI. `nemo-speech serve` has no language flag --
    language is applied per session via `session.update` -- so this only sets
    the app-level default (equivalent to the STT_LANGUAGE env var).

.EXAMPLE
    .\start_server.ps1

.EXAMPLE
    .\start_server.ps1 -Language es-ES

.NOTES
    If Windows blocks the script, run it with:
        powershell -ExecutionPolicy Bypass -File .\start_server.ps1
    or allow local scripts once with:
        Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
#>
[CmdletBinding()]
param(
    # Default transcription language, e.g. en-US, es-ES, or auto.
    [ValidateNotNullOrEmpty()]
    [string]$Language
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Stop-WithError {
    param(
        [Parameter(Mandatory)][string]$Message,
        [int]$Code = 1
    )

    Write-Host "Error: $Message" -ForegroundColor Red
    exit $Code
}

# Resolve the project from this script's own location, so it works from any
# checkout path (this repo lives in "Voice server", not C:\voice-server) and
# from any current working directory.
$projectDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($projectDir)) {
    $projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$packageJson = Join-Path $projectDir 'package.json'
if (-not (Test-Path -LiteralPath $packageJson -PathType Leaf)) {
    Stop-WithError "package.json not found in $projectDir."
}

function Resolve-Tool {
    param([Parameter(Mandatory)][string[]]$Names)

    foreach ($name in $Names) {
        # A name with an extension can match several entries on PATH, so take
        # the first one (PATH order) instead of an array of all matches.
        $command = Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($command) { return $command.Source }
    }
    return $null
}

# Prefer the .cmd shims: npm.ps1 fails when the execution policy is Restricted.
$node = Resolve-Tool -Names @('node.exe', 'node')
$npm = Resolve-Tool -Names @('npm.cmd', 'npm')

if (-not $node) { Stop-WithError 'node is not installed or not in your PATH.' }
if (-not $npm) { Stop-WithError 'npm is not installed or not in your PATH.' }

Set-Location -LiteralPath $projectDir

# Dependencies are stale when node_modules is missing or older than the manifests.
function Test-DependenciesStale {
    $nodeModules = Join-Path $projectDir 'node_modules'
    if (-not (Test-Path -LiteralPath $nodeModules -PathType Container)) { return $true }

    $stampPath = Join-Path $nodeModules '.package-lock.json'
    $stamp = if (Test-Path -LiteralPath $stampPath -PathType Leaf) {
        Get-Item -LiteralPath $stampPath
    }
    else {
        Get-Item -LiteralPath $nodeModules # npm < 7 has no stamp file
    }

    foreach ($manifest in @('package.json', 'package-lock.json')) {
        $path = Join-Path $projectDir $manifest
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }

        if ((Get-Item -LiteralPath $path).LastWriteTimeUtc -gt $stamp.LastWriteTimeUtc) {
            return $true
        }
    }
    return $false
}

if (Test-DependenciesStale) {
    Write-Host "Installing dependencies in $projectDir..."
    & $npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "npm install failed (exit code $LASTEXITCODE)." -Code $LASTEXITCODE
    }
    Write-Host 'Dependencies installed.'
}
else {
    Write-Host 'Dependencies are up to date.'
}

Write-Host 'Starting server...'
if ($PSBoundParameters.ContainsKey('Language')) {
    $env:STT_LANGUAGE = $Language
    Write-Host "Default transcription language: $Language"
}
& $npm run dev:server
exit $LASTEXITCODE
