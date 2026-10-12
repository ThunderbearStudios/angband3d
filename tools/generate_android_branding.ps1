# tools/generate_android_branding.ps1
# Generates Android adaptive launcher icons, legacy mipmaps, round icons, and splash screens
# from client/assets/thunderbear_logo.png using high quality bicubic interpolation.

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$rootDir = Resolve-Path "$PSScriptRoot\.."
$logoPath = Join-Path $rootDir "client\assets\thunderbear_logo.png"

if (-not (Test-Path $logoPath)) {
    Write-Error "Source logo not found at $logoPath"
    exit 1
}

$logo = [System.Drawing.Image]::FromFile($logoPath)
Write-Host "Source logo loaded: $($logo.Width)x$($logo.Height)"

$resDir = Join-Path $rootDir "android\app\src\main\res"

# 1. Update ic_launcher_background.xml to black (#000000)
$bgXmlPath = Join-Path $resDir "values\ic_launcher_background.xml"
$bgXmlContent = @"
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#000000</color>
</resources>
"@
Set-Content -Path $bgXmlPath -Value $bgXmlContent -Encoding UTF8
Write-Host "Updated $bgXmlPath -> #000000"

# Helper to render logo into canvas
function Render-Logo([int]$canvasW, [int]$canvasH, [double]$logoScaleRatio, [System.Drawing.Color]$bgColor, [bool]$isRound) {
    $bmp = New-Object System.Drawing.Bitmap($canvasW, $canvasH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($bgColor -ne [System.Drawing.Color]::Transparent) {
        if ($isRound) {
            $g.Clear([System.Drawing.Color]::Transparent)
            $brush = New-Object System.Drawing.SolidBrush($bgColor)
            $g.FillEllipse($brush, 0, 0, $canvasW, $canvasH)
            $brush.Dispose()
        } else {
            $g.Clear($bgColor)
        }
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    # Calculate proportional fit
    $targetMaxW = $canvasW * $logoScaleRatio
    $targetMaxH = $canvasH * $logoScaleRatio
    $scale = [Math]::Min($targetMaxW / $logo.Width, $targetMaxH / $logo.Height)
    $w = [Math]::Max(1, [int]($logo.Width * $scale))
    $h = [Math]::Max(1, [int]($logo.Height * $scale))

    $x = [int](($canvasW - $w) / 2)
    $y = [int](($canvasH - $h) / 2)

    $g.DrawImage($logo, $x, $y, $w, $h)
    $g.Dispose()
    return $bmp
}

# 2. Generate Mipmap densities
$densities = @(
    @{ Name = "mipmap-mdpi";    IconSize = 48;  FgSize = 108 },
    @{ Name = "mipmap-hdpi";    IconSize = 72;  FgSize = 162 },
    @{ Name = "mipmap-xhdpi";   IconSize = 96;  FgSize = 216 },
    @{ Name = "mipmap-xxhdpi";  IconSize = 144; FgSize = 324 },
    @{ Name = "mipmap-xxxhdpi"; IconSize = 192; FgSize = 432 }
)

foreach ($d in $densities) {
    $dir = Join-Path $resDir $d.Name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    # A. Standard launcher icon (solid black bg, 86% scale)
    $iconBmp = Render-Logo $d.IconSize $d.IconSize 0.86 ([System.Drawing.Color]::FromArgb(255, 0, 0, 0)) $false
    $iconPath = Join-Path $dir "ic_launcher.png"
    $iconBmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $iconBmp.Dispose()

    # B. Round launcher icon (round black bg, 78% scale for safe circle padding)
    $roundBmp = Render-Logo $d.IconSize $d.IconSize 0.78 ([System.Drawing.Color]::FromArgb(255, 0, 0, 0)) $true
    $roundPath = Join-Path $dir "ic_launcher_round.png"
    $roundBmp.Save($roundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $roundBmp.Dispose()

    # C. Adaptive foreground icon (transparent bg, 65% scale for Android adaptive safe zone)
    $fgBmp = Render-Logo $d.FgSize $d.FgSize 0.65 ([System.Drawing.Color]::Transparent) $false
    $fgPath = Join-Path $dir "ic_launcher_foreground.png"
    $fgBmp.Save($fgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $fgBmp.Dispose()

    Write-Host "Generated $($d.Name): ic_launcher ($($d.IconSize)x$($d.IconSize)), round ($($d.IconSize)x$($d.IconSize)), fg ($($d.FgSize)x$($d.FgSize))"
}

# 3. Generate Splash screens
$splashConfigs = @(
    @{ Folder = "drawable";             W = 480;  H = 320;  Scale = 0.55 },
    @{ Folder = "drawable-land-mdpi";   W = 480;  H = 320;  Scale = 0.55 },
    @{ Folder = "drawable-land-hdpi";   W = 800;  H = 480;  Scale = 0.55 },
    @{ Folder = "drawable-land-xhdpi";  W = 1280; H = 720;  Scale = 0.50 },
    @{ Folder = "drawable-land-xxhdpi"; W = 1600; H = 960;  Scale = 0.50 },
    @{ Folder = "drawable-land-xxxhdpi";W = 1920; H = 1280; Scale = 0.45 },
    @{ Folder = "drawable-port-mdpi";   W = 320;  H = 480;  Scale = 0.55 },
    @{ Folder = "drawable-port-hdpi";   W = 480;  H = 800;  Scale = 0.50 },
    @{ Folder = "drawable-port-xhdpi";  W = 720;  H = 1280; Scale = 0.45 },
    @{ Folder = "drawable-port-xxhdpi"; W = 960;  H = 1600; Scale = 0.40 },
    @{ Folder = "drawable-port-xxxhdpi";W = 1280; H = 1920; Scale = 0.35 }
)

foreach ($sc in $splashConfigs) {
    $dir = Join-Path $resDir $sc.Folder
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

    $splashBmp = Render-Logo $sc.W $sc.H $sc.Scale ([System.Drawing.Color]::FromArgb(255, 0, 0, 0)) $false
    $splashPath = Join-Path $dir "splash.png"
    $splashBmp.Save($splashPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $splashBmp.Dispose()

    Write-Host "Generated $($sc.Folder)\splash.png ($($sc.W)x$($sc.H))"
}

$logo.Dispose()
Write-Host "All Android branding assets successfully generated!"
