<#
.SYNOPSIS
    Package Angband3D for standalone distribution.
.DESCRIPTION
    Builds the C engine, compiles the C# Godot client in Release mode, stages
    all assets, gamedata, and runtime binaries into a clean distribution folder,
    and compresses it into a ready-to-distribute ZIP archive.
.PARAMETER OutputDir
    Where to output the packaged distribution. Defaults to 'dist'.
.PARAMETER SkipZip
    If specified, stages the folder but skips creating the ZIP archive.
.EXAMPLE
    .\tools\package.ps1
#>
[CmdletBinding()]
param(
    [string]$OutputDir = 'dist',
    [switch]$SkipZip,
    [switch]$AllowSourceFallback
)

$ErrorActionPreference = 'Stop'
$repo = (Get-Item $PSScriptRoot).Parent.FullName

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Angband3D Standalone Packaging Tool   " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Setup staging directories
$distRoot = Join-Path $repo $OutputDir
$pkgName = "Angband3D-Windows-x64"
$stageDir = Join-Path $distRoot $pkgName

if (Test-Path $stageDir) {
    Write-Host "Cleaning existing staging directory $stageDir..." -ForegroundColor Gray
    Remove-Item $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

# 1. Check/Build Angband C Engine
$engineExe = Join-Path $repo 'engine\build\game\angband.exe'
if (-not (Test-Path $engineExe)) {
    Write-Host "[1/5] Building Angband C engine..." -ForegroundColor Yellow
    & (Join-Path $repo 'tools\build.ps1')
} else {
    Write-Host "[1/5] Angband C engine already built: $engineExe" -ForegroundColor Green
}

# 2. Build Desktop Standalone Executable (Full Enhanced WebGL/Wasm Client)
Write-Host "[2/5] Building modern standalone desktop executable..." -ForegroundColor Yellow
$desktopProj = Join-Path $repo 'desktop\Angband3D.csproj'
if (Test-Path $desktopProj) {
    Write-Host "Publishing self-contained Angband3D.exe from $desktopProj..." -ForegroundColor Cyan
    & dotnet publish $desktopProj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $stageDir
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to publish desktop project."
    }
} else {
    Write-Warning "desktop/Angband3D.csproj not found; skipping modern desktop build."
}

# Stage full web assets (shaders, PBR textures, 3D models, audio, wasm engine, UI)
$webSource = Join-Path $repo 'server\public'
$webDest = Join-Path $stageDir 'www'
if (Test-Path $webSource) {
    Write-Host "Staging full enhanced game assets into $webDest..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $webDest -Force | Out-Null
    Copy-Item "$webSource\*" $webDest -Recurse -Force

    # Keep standalone distribution clean: strip web demo video walkthroughs & recording caches
    $pkgVideoDir = Join-Path $webDest 'assets\video'
    if (Test-Path $pkgVideoDir) {
        Write-Host "Excluding heavy web demo videos from game distribution package..." -ForegroundColor Gray
        Remove-Item $pkgVideoDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Optional: Build Godot C# Client in Release mode & Export Godot Executable if available
$clientProj = Join-Path $repo 'client\angband3d.csproj'
if (Test-Path $clientProj) {
    Write-Host "Compiling Godot C# client (Release)..." -ForegroundColor Yellow
    & dotnet build $clientProj -c Release
}

# Find Godot executable for export (prefer console binary to ensure synchronous completion)
function Find-GodotExe {
    if ($env:GODOT -and (Test-Path $env:GODOT)) {
        return (Resolve-Path $env:GODOT).Path
    }

    $cmd = Get-Command godot, godot4, Godot* -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -eq '.exe' } |
        Sort-Object { $_.Name -like '*console*' } -Descending |
        Select-Object -First 1
    if ($cmd) { return $cmd.Source }

    $roots = @(
        "C:\Godot",
        "C:\Godot*",
        "$env:SystemDrive\Godot*",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages",
        "$env:ProgramFiles\Godot*",
        "$env:LOCALAPPDATA\Programs\Godot*"
    )
    foreach ($pattern in $roots) {
        $dirs = Get-Item $pattern -ErrorAction SilentlyContinue
        foreach ($root in $dirs) {
            if (-not (Test-Path $root.FullName)) { continue }
            $hit = Get-ChildItem $root.FullName -Recurse -Filter 'Godot*.exe' -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like '*console*' } |
                Sort-Object { $_.Name -like '*mono*' } -Descending |
                Select-Object -First 1
            if ($hit) { return $hit.FullName }
        }
    }
    return $null
}

$godotExe = Find-GodotExe
if ($godotExe) {
    Write-Host "Found Godot executable: $godotExe" -ForegroundColor Green
    $clientPath = Join-Path $repo 'client'
    $exportTarget = Join-Path $stageDir 'Angband3D-Godot.exe'

    Write-Host "Exporting optional Angband3D-Godot.exe using Godot ($godotExe)..." -ForegroundColor Yellow
    $logPath = Join-Path $repo "godot-export.log"
    & $godotExe --headless --path $clientPath --export-release "Windows Desktop" $exportTarget *>&1 | Tee-Object -FilePath $logPath
    $exportCode = $LASTEXITCODE

    if ($exportCode -eq 0 -and (Test-Path $exportTarget)) {
        Write-Host "Godot client exported successfully: $exportTarget" -ForegroundColor Green
    }
}

# Copy root docs and licenses
Copy-Item (Join-Path $repo 'LICENSE') $stageDir
Copy-Item (Join-Path $repo 'README.md') $stageDir

# Copy Engine binaries and gamedata
$destEngine = Join-Path $stageDir 'engine\build\game'
New-Item -ItemType Directory -Path $destEngine -Force | Out-Null
Copy-Item $engineExe $destEngine

$engineLib = Join-Path $repo 'engine\build\game\lib'
if (Test-Path $engineLib) {
    Copy-Item $engineLib $destEngine -Recurse
    # Clean any local save files from distribution package
    $pkgSaveDir = Join-Path $destEngine 'lib\save'
    if (Test-Path $pkgSaveDir) {
        Get-ChildItem $pkgSaveDir -File | Remove-Item -Force -ErrorAction SilentlyContinue
    } else {
        New-Item -ItemType Directory -Path $pkgSaveDir -Force | Out-Null
    }
}

# Copy Launchers
Copy-Item (Join-Path $repo 'play.cmd') $stageDir
Copy-Item (Join-Path $repo 'play.ps1') $stageDir

# Create root quick-launcher Play-Angband3D.cmd
$quickLauncherContent = @"
@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0Angband3D.exe" (
    "%~dp0Angband3D.exe" %*
) else (
    call play.cmd %*
)
"@
Set-Content -Path (Join-Path $stageDir 'Play-Angband3D.cmd') -Value $quickLauncherContent

# Verify standalone binaries
if (-not $AllowSourceFallback) {
    $exeCheck = Join-Path $stageDir 'Angband3D.exe'
    $htmlCheck = Join-Path $stageDir 'www\index.html'
    $wasmCheck = Join-Path $stageDir 'www\wasm\angband.wasm'
    $engineCheck = Join-Path $stageDir 'engine\build\game\angband.exe'

    if (-not (Test-Path $exeCheck)) {
        throw "Packaging verification failed: $exeCheck does not exist!"
    }
    if (-not (Test-Path $htmlCheck)) {
        throw "Packaging verification failed: $htmlCheck does not exist!"
    }
    if (-not (Test-Path $wasmCheck)) {
        throw "Packaging verification failed: $wasmCheck does not exist!"
    }
    if (-not (Test-Path $engineCheck)) {
        throw "Packaging verification failed: $engineCheck does not exist!"
    }
    Write-Host "Package verification PASSED: Standalone binary, full enhanced assets, and offline engine present." -ForegroundColor Green
}

Write-Host "[4/5] Staged distribution files successfully." -ForegroundColor Green

# 4. Compress to ZIP Archive
if (-not $SkipZip) {
    $zipPath = Join-Path $distRoot "$pkgName.zip"
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force
    }
    Write-Host "[5/5] Compressing to $zipPath..." -ForegroundColor Yellow
    if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
        Push-Location $stageDir
        try {
            & tar.exe -a -cf $zipPath *
        } finally {
            Pop-Location
        }
    } else {
        Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
    }
    $canonicalZip = Join-Path $distRoot "angband3d-standalone.zip"
    Copy-Item $zipPath $canonicalZip -Force
    Write-Host "Package created: $zipPath" -ForegroundColor Green
    Write-Host "Canonical server download: $canonicalZip" -ForegroundColor Green
} else {
    Write-Host "[5/5] Skipping ZIP compression as requested." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Build & Packaging Complete!" -ForegroundColor Cyan
Write-Host "Output: $stageDir" -ForegroundColor Cyan
if (-not $SkipZip) {
    Write-Host "Archive: $zipPath" -ForegroundColor Cyan
}
