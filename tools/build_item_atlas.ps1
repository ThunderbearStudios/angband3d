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

$darkLines = [System.IO.File]::ReadAllLines($darkPrfPath, [System.Text.Encoding]::UTF8)
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
$flvrLines = [System.IO.File]::ReadAllLines($flvrPrfPath, [System.Text.Encoding]::UTF8)
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
            int count = srcXs.Length;

            using (Graphics g = Graphics.FromImage(atlasBmp)) {
                g.Clear(Color.Transparent);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;

                for (int i = 0; i < count; i++) {
                    int slotCol = i % tilesPerRow;
                    int slotRow = i / tilesPerRow;

                    int destX = slotCol * tileSize;
                    int destY = slotRow * tileSize;

                    Rectangle destRect = new Rectangle(destX, destY, tileSize, tileSize);
                    Rectangle srcRect = new Rectangle(srcXs[i], srcYs[i], 64, 64);

                    g.DrawImage(srcBmp, destRect, srcRect, GraphicsUnit.Pixel);
                }
            }

            // Lock atlas bits as ReadWrite to perform de-fringing, shadow stripping, and contrast-adaptive detail sharpening
            BitmapData atlasData = atlasBmp.LockBits(
                new Rectangle(0, 0, atlasSize, atlasSize),
                ImageLockMode.ReadWrite,
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

            // Step 1: Silhouette De-Fringing & 2D Baked Drop-Shadow Stripping
            // Eliminates murky 2D drop-shadow smudges so 3D dynamic lighting & contact shadows ground items cleanly.
            // Also un-premultiplies edge pixels to eradicate dirty dark borders.
            for (int y = 0; y < atlasSize; y++) {
                int row = y * stride;
                for (int x = 0; x < atlasSize; x++) {
                    int idx = row + x * 4;
                    byte a = atlasBytes[idx + 3];

                    if (a < 40) {
                        atlasBytes[idx + 0] = 0;
                        atlasBytes[idx + 1] = 0;
                        atlasBytes[idx + 2] = 0;
                        atlasBytes[idx + 3] = 0;
                        continue;
                    }

                    // Detect baked 2D drop shadow (semi-transparent neutral dark grey artifact)
                    byte b = atlasBytes[idx + 0];
                    byte g = atlasBytes[idx + 1];
                    byte r = atlasBytes[idx + 2];
                    bool isDropShadow = (a < 140) && (Math.Abs(b - g) < 18) && (Math.Abs(g - r) < 18) && (r < 135);

                    if (isDropShadow) {
                        atlasBytes[idx + 0] = 0;
                        atlasBytes[idx + 1] = 0;
                        atlasBytes[idx + 2] = 0;
                        atlasBytes[idx + 3] = 0;
                        continue;
                    }

                    // Boost alpha curve for crisp, solid silhouette without blurry translucent transitions
                    float normA = (a - 40) / 215.0f;
                    byte crispA = (byte)Math.Min(255, (int)(Math.Pow(normA, 0.5) * 255.0f));

                    // Un-premultiply RGB: restores full vibrancy to edge pixels darkened by transparent convolution
                    float alphaFactor = Math.Max(0.25f, a / 255.0f);
                    atlasBytes[idx + 0] = (byte)Math.Min(255, (int)(b / alphaFactor));
                    atlasBytes[idx + 1] = (byte)Math.Min(255, (int)(g / alphaFactor));
                    atlasBytes[idx + 2] = (byte)Math.Min(255, (int)(r / alphaFactor));
                    atlasBytes[idx + 3] = Math.Max((byte)180, crispA);
                }
            }

            // Step 2: Contrast-Adaptive High-Frequency Detail Sharpening (Laplacian edge enhancement)
            // Recovers razor-sharp blade edges, potion bottle highlights, and jewelry glints.
            byte[] sharpBytes = new byte[stride * atlasSize];
            Array.Copy(atlasBytes, sharpBytes, sharpBytes.Length);

            float sharpenAmount = 0.90f; // High-fidelity detail recovery
            for (int y = 1; y < atlasSize - 1; y++) {
                int row = y * stride;
                int rowU = (y - 1) * stride;
                int rowD = (y + 1) * stride;

                for (int x = 1; x < atlasSize - 1; x++) {
                    int idx = row + x * 4;
                    byte a = atlasBytes[idx + 3];
                    if (a < 50) continue;

                    for (int c = 0; c < 3; c++) {
                        int center = atlasBytes[idx + c];
                        int left   = atlasBytes[row + (x - 1) * 4 + c];
                        int right  = atlasBytes[row + (x + 1) * 4 + c];
                        int up     = atlasBytes[rowU + x * 4 + c];
                        int down   = atlasBytes[rowD + x * 4 + c];

                        float laplacian = (center * 4) - (left + right + up + down);
                        float delta = Math.Max(-35.0f, Math.Min(35.0f, laplacian * sharpenAmount * 0.40f));
                        sharpBytes[idx + c] = (byte)Math.Max(0, Math.Min(255, (int)(center + delta + 0.5f)));
                    }
                }
            }
            Array.Copy(sharpBytes, atlasBytes, sharpBytes.Length);

            // Copy sharpened, de-fringed pixels back to atlasScan so atlasBmp saves the enhanced image!
            Marshal.Copy(atlasBytes, 0, atlasScan, atlasBytes.Length);

            // Step 3: Pre-calculate raw luminance for normal map
            float[] rawLum = new float[atlasSize * atlasSize];
            for (int y = 0; y < atlasSize; y++) {
                int rowOffset = y * stride;
                int lumOffset = y * atlasSize;
                for (int x = 0; x < atlasSize; x++) {
                    int idx = rowOffset + x * 4;
                    byte a = atlasBytes[idx + 3];
                    if (a < 15) {
                        rawLum[lumOffset + x] = 0.0f;
                    } else {
                        rawLum[lumOffset + x] = (atlasBytes[idx + 2] * 0.299f + atlasBytes[idx + 1] * 0.587f + atlasBytes[idx + 0] * 0.114f) / 255.0f;
                    }
                }
            }

            // Step 2: Separable 5-tap Gaussian / bilateral blur to eliminate pixel dithering noise
            float[] tempLum = new float[atlasSize * atlasSize];
            for (int y = 0; y < atlasSize; y++) {
                int rowOffset = y * atlasSize;
                for (int x = 0; x < atlasSize; x++) {
                    int x0 = Math.Max(0, x - 2);
                    int x1 = Math.Max(0, x - 1);
                    int x2 = x;
                    int x3 = Math.Min(atlasSize - 1, x + 1);
                    int x4 = Math.Min(atlasSize - 1, x + 2);
                    tempLum[rowOffset + x] = (rawLum[rowOffset + x0] * 1.0f +
                                              rawLum[rowOffset + x1] * 4.0f +
                                              rawLum[rowOffset + x2] * 6.0f +
                                              rawLum[rowOffset + x3] * 4.0f +
                                              rawLum[rowOffset + x4] * 1.0f) / 16.0f;
                }
            }

            float[] smoothLum = new float[atlasSize * atlasSize];
            for (int y = 0; y < atlasSize; y++) {
                int y0 = Math.Max(0, y - 2) * atlasSize;
                int y1 = Math.Max(0, y - 1) * atlasSize;
                int y2 = y * atlasSize;
                int y3 = Math.Min(atlasSize - 1, y + 1) * atlasSize;
                int y4 = Math.Min(atlasSize - 1, y + 2) * atlasSize;
                for (int x = 0; x < atlasSize; x++) {
                    smoothLum[y2 + x] = (tempLum[y0 + x] * 1.0f +
                                         tempLum[y1 + x] * 4.0f +
                                         tempLum[y2 + x] * 6.0f +
                                         tempLum[y3 + x] * 4.0f +
                                         tempLum[y4 + x] * 1.0f) / 16.0f;
                }
            }

            // Step 3: Compute Sobel relief + volumetric convex body contouring
            for (int y = 0; y < atlasSize; y++) {
                int yMin = Math.Max(0, y - 1) * atlasSize;
                int yMax = Math.Min(atlasSize - 1, y + 1) * atlasSize;
                int rowOffset = y * atlasSize;
                int byteOffset = y * stride;

                for (int x = 0; x < atlasSize; x++) {
                    int idx = byteOffset + x * 4;
                    byte a = atlasBytes[idx + 3];

                    if (a < 15) {
                        // Flat transparent normal (0, 0, 1) encoded as RGB(128, 128, 255)
                        normalBytes[idx + 0] = 255; // B (Z)
                        normalBytes[idx + 1] = 128; // G (Y)
                        normalBytes[idx + 2] = 128; // R (X)
                        normalBytes[idx + 3] = 0;   // A
                        continue;
                    }

                    int xMin = Math.Max(0, x - 1);
                    int xMax = Math.Min(atlasSize - 1, x + 1);

                    float lLeft  = smoothLum[rowOffset + xMin];
                    float lRight = smoothLum[rowOffset + xMax];
                    float lUp    = smoothLum[yMin + x];
                    float lDown  = smoothLum[yMax + x];

                    // Denoised Sobel relief
                    float dx = (lRight - lLeft) * 2.2f;
                    float dy = (lDown - lUp) * 2.2f;

                    // Volumetric convex contouring: center faces forward (+Z), edges curve smoothly outward
                    float tileRelX = ((x % tileSize) - (tileSize / 2.0f)) / (tileSize / 2.0f);
                    float tileRelY = ((y % tileSize) - (tileSize / 2.0f)) / (tileSize / 2.0f);
                    dx -= tileRelX * 0.45f;
                    dy -= tileRelY * 0.45f;

                    float lenSq = dx * dx + dy * dy;
                    float dz = (lenSq < 1.0f) ? (float)Math.Sqrt(1.0f - lenSq) : 0.05f;

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
}
"@

$atlasSize = 4096
$tileSize = 128
$tilesPerRow = [int]($atlasSize / $tileSize) # 32

$srcXs = [int[]]::new($itemList.Count)
$srcYs = [int[]]::new($itemList.Count)

for ($i = 0; $i -lt $itemList.Count; $i++) {
    $srcXs[$i] = $itemList[$i].Col * 64
    $srcYs[$i] = $itemList[$i].Row * 64
}

Write-Host "[Item Atlas Builder] Generating $atlasSize x $atlasSize HD item atlas and volumetric normal map..."
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
    $slotCol = $i % $tilesPerRow
    $slotRow = [int][Math]::Floor($i / $tilesPerRow)

    $destX = $slotCol * $tileSize
    $destY = $slotRow * $tileSize

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

    $entryObj = [ordered]@{
        category = $item.Category
        uv = @($u0, $v0, $u1, $v1)
        height = $height
        width = $width
        footprint = $footprint
        elevation = $elevation
        isFlat = $isFlat
    }
    $itemsDict[$item.Name] = $entryObj

    # Also store unaccented alias if name contains non-ASCII characters
    $normalizedName = $item.Name.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = [System.Text.StringBuilder]::new()
    foreach ($ch in $normalizedName.ToCharArray()) {
        $cat = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($cat -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            $sb.Append($ch) | Out-Null
        }
    }
    $cleanName = $sb.ToString()
    if ($cleanName -ne $item.Name -and -not $itemsDict.ContainsKey($cleanName)) {
        $itemsDict[$cleanName] = $entryObj
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
    '-' = "Steel wand"
    '_' = "Oak staff"
    '/' = "Spear"
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
