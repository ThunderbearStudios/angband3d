# tools/build_item_atlas.ps1
# Extracts all 246 canonical objects and 252 flavors from Shockbolt's tile suite
# into a mobile-safe 2048 x 2048 item atlas (item_atlas.png), generated PBR
# tangent-space normal map (item_normal.png), and JSON lookup (item_atlas.json).

$ErrorActionPreference = "Stop"

$srcImgPath = "C:\Dev\angband3d\engine\lib\tiles\shockbolt\64x64.png"
$darkPrfPath = "C:\Dev\angband3d\engine\lib\tiles\shockbolt\graf-shb-dark.prf"
$flvrPrfPath = "C:\Dev\angband3d\engine\lib\tiles\shockbolt\flvr-shb.prf"

$outDir = "C:\Dev\angband3d\server\public\assets\sprites\items"
if (!(Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$outAtlasPath = Join-Path $outDir "item_atlas.png"
$outNormalPath = Join-Path $outDir "item_normal.png"
$outJsonPath = Join-Path $outDir "item_atlas.json"

Write-Host "[Item Atlas Builder] Reading items and flavors from Shockbolt PRFs..."

# 1. Parse graf-shb-dark.prf for objects: object:<category>:<name>:<row>:<col>
$itemList = [System.Collections.Generic.List[psobject]]::new()
$seenNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

$darkLines = Get-Content $darkPrfPath
foreach ($line in $darkLines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^object:([^:]+):([^:]+):(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)') {
        $cat = $matches[1]
        $name = $matches[2]
        $row = [Convert]::ToInt32($matches[3], 16) - 128
        $col = [Convert]::ToInt32($matches[4], 16) - 128

        if (!$seenNames.Contains($name)) {
            $seenNames.Add($name) | Out-Null
            $itemList.Add([pscustomobject]@{
                Type = "object"
                Category = $cat
                Name = $name
                Row = $row
                Col = $col
            })
        }
    }
}

# 2. Parse flvr-shb.prf for flavors: flavor:<num>:<row>:<col> with preceding comment
$flvrLines = Get-Content $flvrPrfPath
$curComment = ""
foreach ($line in $flvrLines) {
    $trimmed = $line.Trim()
    if ($trimmed.StartsWith("#")) {
        $curComment = $trimmed.TrimStart("#").Trim()
    } elseif ($trimmed -match '^flavor:(\d+):(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)') {
        if (![string]::IsNullOrEmpty($curComment) -and !$seenNames.Contains($curComment)) {
            $row = [Convert]::ToInt32($matches[2], 16) - 128
            $col = [Convert]::ToInt32($matches[3], 16) - 128
            $seenNames.Add($curComment) | Out-Null
            $itemList.Add([pscustomobject]@{
                Type = "flavor"
                Category = "flavor"
                Name = $curComment
                Row = $row
                Col = $col
            })
        }
    }
}

Write-Host "[Item Atlas Builder] Collected $($itemList.Count) unique item entries."

# Compile C# image processing helper using native System.Drawing
Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class ItemAtlasProcessor {
    public static void GenerateAtlasAndNormal(
        string srcPath,
        int[] srcXs,
        int[] srcYs,
        string outAtlasPath,
        string outNormalPath,
        int atlasSize,
        int tileSize,
        int tilesPerRow
    ) {
        using (Bitmap srcBmp = new Bitmap(srcPath))
        using (Bitmap atlasBmp = new Bitmap(atlasSize, atlasSize, PixelFormat.Format32bppArgb))
        using (Bitmap normalBmp = new Bitmap(atlasSize, atlasSize, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(atlasBmp)) {
                g.Clear(Color.Transparent);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;

                for (int i = 0; i < srcXs.Length; i++) {
                    int destX = (i % tilesPerRow) * tileSize;
                    int destY = (i / tilesPerRow) * tileSize;

                    Rectangle srcRect = new Rectangle(srcXs[i], srcYs[i], tileSize, tileSize);
                    Rectangle destRect = new Rectangle(destX, destY, tileSize, tileSize);
                    g.DrawImage(srcBmp, destRect, srcRect, GraphicsUnit.Pixel);
                }
            }

            // Lock bits to generate tangent-space normal map via 3x3 Sobel filter + contour relief
            BitmapData atlasData = atlasBmp.LockBits(
                new Rectangle(0, 0, atlasSize, atlasSize),
                ImageLockMode.ReadOnly,
                PixelFormat.Format32bppArgb
            );
            BitmapData normalData = normalBmp.LockBits(
                new Rectangle(0, 0, atlasSize, atlasSize),
                ImageLockMode.WriteOnly,
                PixelFormat.Format32bppArgb
            );

            int stride = atlasData.Stride;
            IntPtr atlasScan = atlasData.Scan0;
            IntPtr normalScan = normalData.Scan0;

            byte[] atlasBytes = new byte[stride * atlasSize];
            byte[] normalBytes = new byte[stride * atlasSize];

            Marshal.Copy(atlasScan, atlasBytes, 0, atlasBytes.Length);

            for (int y = 0; y < atlasSize; y++) {
                int yMin = Math.Max(0, y - 1);
                int yMax = Math.Min(atlasSize - 1, y + 1);

                for (int x = 0; x < atlasSize; x++) {
                    int idx = y * stride + x * 4;
                    byte a = atlasBytes[idx + 3];

                    if (a < 15) {
                        // Flat normal (0.5, 0.5, 1.0) encoded as RGB(128, 128, 255)
                        normalBytes[idx + 0] = 255; // B (Z)
                        normalBytes[idx + 1] = 128; // G (Y)
                        normalBytes[idx + 2] = 128; // R (X)
                        normalBytes[idx + 3] = 0;   // Transparent
                        continue;
                    }

                    int xMin = Math.Max(0, x - 1);
                    int xMax = Math.Min(atlasSize - 1, x + 1);

                    // Luminance of 4-neighborhood
                    int lLeft  = GetLum(atlasBytes, y * stride + xMin * 4);
                    int lRight = GetLum(atlasBytes, y * stride + xMax * 4);
                    int lUp    = GetLum(atlasBytes, yMin * stride + x * 4);
                    int lDown  = GetLum(atlasBytes, yMax * stride + x * 4);

                    // Sobel gradients
                    float dx = (lRight - lLeft) / 255.0f * 1.8f;
                    float dy = (lDown - lUp) / 255.0f * 1.8f;

                    // Tile relative coordinates for spherical silhouette contour (0.0 to 1.0)
                    float tileRelX = ((x % tileSize) - (tileSize / 2.0f)) / (tileSize / 2.0f);
                    float tileRelY = ((y % tileSize) - (tileSize / 2.0f)) / (tileSize / 2.0f);
                    
                    // Add subtle spherical bevel on opaque edges
                    dx -= tileRelX * 0.45f;
                    dy -= tileRelY * 0.45f;

                    float lenSq = dx * dx + dy * dy;
                    float dz = (lenSq < 1.0f) ? (float)Math.Sqrt(1.0f - lenSq) : 0.05f;

                    // Normalize vector (dx, dy, dz)
                    float invLen = 1.0f / (float)Math.Sqrt(dx * dx + dy * dy + dz * dz);
                    dx *= invLen;
                    dy *= invLen;
                    dz *= invLen;

                    // Encode to 0..255 (Three.js expects normal map in [0, 1])
                    normalBytes[idx + 0] = (byte)Math.Max(0, Math.Min(255, (int)((dz * 0.5f + 0.5f) * 255.0f))); // B (Z)
                    normalBytes[idx + 1] = (byte)Math.Max(0, Math.Min(255, (int)((dy * 0.5f + 0.5f) * 255.0f))); // G (Y)
                    normalBytes[idx + 2] = (byte)Math.Max(0, Math.Min(255, (int)((dx * 0.5f + 0.5f) * 255.0f))); // R (X)
                    normalBytes[idx + 3] = a; // Keep original alpha for cutout
                }
            }

            Marshal.Copy(normalBytes, 0, normalScan, normalBytes.Length);

            atlasBmp.UnlockBits(atlasData);
            normalBmp.UnlockBits(normalData);

            atlasBmp.Save(outAtlasPath, ImageFormat.Png);
            normalBmp.Save(outNormalPath, ImageFormat.Png);
        }
    }

    private static int GetLum(byte[] bytes, int idx) {
        if (bytes[idx + 3] < 15) return 0;
        return (int)(bytes[idx + 2] * 0.299 + bytes[idx + 1] * 0.587 + bytes[idx + 0] * 0.114);
    }
}
"@

$atlasSize = 2048
$tileSize = 64
$tilesPerRow = [int]($atlasSize / $tileSize) # 32

$srcXs = [int[]]::new($itemList.Count)
$srcYs = [int[]]::new($itemList.Count)

for ($i = 0; $i -lt $itemList.Count; $i++) {
    $srcXs[$i] = $itemList[$i].Col * $tileSize
    $srcYs[$i] = $itemList[$i].Row * $tileSize
}

Write-Host "[Item Atlas Builder] Generating $atlasSize x $atlasSize item atlas and normal map..."
[ItemAtlasProcessor]::GenerateAtlasAndNormal(
    $srcImgPath,
    $srcXs,
    $srcYs,
    $outAtlasPath,
    $outNormalPath,
    $atlasSize,
    $tileSize,
    $tilesPerRow
)

Write-Host "[Item Atlas Builder] Generated item_atlas.png and item_normal.png successfully!"

# 3. Generate item_atlas.json
$itemsDict = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
$halfTexel = 0.5 / $atlasSize

for ($i = 0; $i -lt $itemList.Count; $i++) {
    $item = $itemList[$i]
    $destX = ($i % $tilesPerRow) * $tileSize
    $destY = [int]($i / $tilesPerRow) * $tileSize

    # UV coordinates with Three.js orientation (V is inverted: 0 at bottom, 1 at top)
    $u0 = ($destX / $atlasSize) + $halfTexel
    $v0 = (1.0 - (($destY + $tileSize) / $atlasSize)) + $halfTexel
    $u1 = (($destX + $tileSize) / $atlasSize) - $halfTexel
    $v1 = (1.0 - ($destY / $atlasSize)) - $halfTexel

    $nameLower = $item.Name.ToLower()
    $cat = $item.Category.ToLower()

    # Dimension and physical height heuristics
    $height = 0.40
    $width = 0.40
    $footprint = 0.35
    $elevation = 0.05
    $isFlat = $false

    if ($cat -match 'sword|polearm|hafted|bow') {
        $height = 0.65
        $width = 0.55
        $footprint = 0.45
        $elevation = 0.06
    } elseif ($cat -match 'armor|shield|cloak') {
        $height = 0.55
        $width = 0.50
        $footprint = 0.42
        $elevation = 0.05
    } elseif ($cat -match 'crown|helm|boot|glove') {
        $height = 0.38
        $width = 0.38
        $footprint = 0.32
        $elevation = 0.04
    } elseif ($cat -match 'chest|coffer|box') {
        $height = 0.50
        $width = 0.60
        $footprint = 0.55
        $elevation = 0.02
        $isFlat = $true
    } elseif ($nameLower -match 'ring|band|amulet|necklace|pendant|gem|crystal|diamond|ruby|sapphire|emerald') {
        $height = 0.28
        $width = 0.28
        $footprint = 0.25
        $elevation = 0.06
    } elseif ($nameLower -match 'potion|flask|draught|elixir|bottle') {
        $height = 0.36
        $width = 0.30
        $footprint = 0.28
        $elevation = 0.04
    } elseif ($nameLower -match 'scroll|parchment|tome|book|grimoire') {
        $height = 0.35
        $width = 0.35
        $footprint = 0.30
        $elevation = 0.04
    } elseif ($nameLower -match 'food|bread|meat|biscuit|apple|honey-cake|ration|mushroom|shroom') {
        $height = 0.32
        $width = 0.32
        $footprint = 0.28
        $elevation = 0.03
    } elseif ($nameLower -match 'torch|lantern|light') {
        $height = 0.48
        $width = 0.32
        $footprint = 0.30
        $elevation = 0.05
    } elseif ($nameLower -match 'gold|coin|copper|silver|ingot|treasure') {
        $height = 0.30
        $width = 0.35
        $footprint = 0.32
        $elevation = 0.03
    }

    $itemsDict[$item.Name] = [ordered]@{
        category = $item.Category
        uv = @($u0, $v0, $u1, $v1)
        height = $height
        width = $width
        footprint = $footprint
        elevation = $elevation
        isFlat = $isFlat
    }
}

# 4. Canonical glyph fallbacks (covers all 20 Angband item symbols)
$glyphFallbacks = [ordered]@{
    '$' = "Gold"
    '!' = "Ruby potion"
    '?' = "Scroll of Teleportation"
    '=' = "Plain Gold ring"
    '"' = "Amulet of Charisma"
    '*' = "Diamond"
    '~' = "Wooden Torch"
    ',' = "Ration of Food"
    '(' = "Soft Leather Armour"
    '[' = "Full Plate Armour"
    ']' = "Pair of Soft Leather Boots"
    ')' = "Long Sword"
    '{' = "Arrow"
    '}' = "Long Bow"
    '-' = "Wand of Magic Missile"
    '_' = "Staff of Light"
    '/' = "Rod of Recall"
    '&' = "Large iron chest"
    '|' = "Scrap of Flesh"
    '<' = "<pile>"
}

$glyphDict = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::Ordinal)

foreach ($kv in $glyphFallbacks.GetEnumerator()) {
    $targetName = $kv.Value
    if ($itemsDict.ContainsKey($targetName)) {
        $glyphDict[$kv.Key] = $itemsDict[$targetName]
    } else {
        # Fallback to first item in category or first item
        $found = $false
        foreach ($k in $itemsDict.Keys) {
            if ($k.ToLower().Contains($targetName.ToLower())) {
                $glyphDict[$kv.Key] = $itemsDict[$k]
                $found = $true
                break
            }
        }
        if (!$found) {
            $glyphDict[$kv.Key] = $itemsDict.Values | Select-Object -First 1
        }
    }
}

$finalJson = [ordered]@{
    items = $itemsDict
    glyphs = $glyphDict
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText($outJsonPath, $finalJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "[Item Atlas Builder] Saved JSON lookup with $($itemsDict.Count) items and $($glyphDict.Count) glyph fallbacks to $outJsonPath."
Write-Host "[Item Atlas Builder] Stage 1 Complete!"
