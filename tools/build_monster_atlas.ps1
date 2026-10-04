# ==============================================================================
# build_monster_atlas.ps1
# Extracts Shockbolt 64x64 monster tiles into an HD 4096x4096 WebGL atlas (128x128 tiles),
# generates tangent-space PBR normal maps with 5x5 bilateral denoising and volumetric cushioning,
# and outputs monster_atlas.json with mathematically exact UV bounds and biological scales.
# ==============================================================================

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Resolve-Path "$scriptDir\..").Path
$prfPath = Join-Path $rootDir "engine\lib\tiles\shockbolt\graf-shb-dark.prf"
$srcImgPath = Join-Path $rootDir "engine\lib\tiles\shockbolt\64x64.png"
$outDir = Join-Path $rootDir "server\public\assets\sprites\monsters"

if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$atlasPngPath = Join-Path $outDir "monster_atlas.png"
$normalPngPath = Join-Path $outDir "monster_normal.png"
$jsonPath = Join-Path $outDir "monster_atlas.json"

Write-Host "[Atlas Builder] Reading monster mappings from $prfPath..."
$prfLines = [System.IO.File]::ReadAllLines($prfPath, [System.Text.Encoding]::UTF8)

# Collect unique monster mappings
$monsterList = [System.Collections.Generic.List[PSCustomObject]]::new()
$seenNames = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($line in $prfLines) {
    if ($line -match '^monster:([^:]+):0x([0-9a-fA-F]+):0x([0-9a-fA-F]+)') {
        $name = $Matches[1].Trim()
        $rowHex = [Convert]::ToInt32($Matches[2], 16)
        $colHex = [Convert]::ToInt32($Matches[3], 16)
        
        $row = $rowHex - 128
        $col = $colHex - 128
        
        if ($row -ge 0 -and $row -lt 32 -and $col -ge 0 -and $col -lt 128) {
            if (-not $seenNames.Contains($name)) {
                $seenNames.Add($name) | Out-Null
                $monsterList.Add([PSCustomObject]@{
                    Name = $name
                    Row  = $row
                    Col  = $col
                })
            }
        }
    }
}

Write-Host "[Atlas Builder] Collected $($monsterList.Count) unique monster entries."

# Compile C# helper for blazing-fast 4096x4096 HD bicubic upscaling and bilateral volumetric normal map generation
Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class AtlasProcessor {
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
        using (Bitmap normalBmp = new Bitmap(atlasSize, atlasSize, PixelFormat.Format32bppArgb)) {
            
            int count = srcXs.Length;

            using (Graphics g = Graphics.FromImage(atlasBmp)) {
                g.Clear(Color.Transparent);
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.SmoothingMode = SmoothingMode.HighQuality;

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

            // Generate bilateral denoised volumetric normal map
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

            // Step 1: Pre-calculate raw luminance
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
                    float dx = (lRight - lLeft) * 2.4f;
                    float dy = (lDown - lUp) * 2.4f;

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

$srcXs = [int[]]::new($monsterList.Count)
$srcYs = [int[]]::new($monsterList.Count)

for ($i = 0; $i -lt $monsterList.Count; $i++) {
    $srcXs[$i] = $monsterList[$i].Col * 64
    $srcYs[$i] = $monsterList[$i].Row * 64
}

Write-Host "[Atlas Builder] Generating $atlasSize x $atlasSize HD monster atlas and volumetric normal map..."
[AtlasProcessor]::GenerateAtlasAndNormal(
    $srcImgPath,
    $srcXs,
    $srcYs,
    $atlasPngPath,
    $normalPngPath,
    $atlasSize,
    $tileSize,
    $tilesPerRow
)

Write-Host "[Atlas Builder] Generated monster_atlas.png and monster_normal.png successfully!"

# Build JSON lookup dictionary with mathematical floor rounding (fixing row shift bug)
$atlasDict = [ordered]@{}
$halfTexel = 0.5 / $atlasSize # Inset to eliminate bilinear texture bleeding

for ($i = 0; $i -lt $monsterList.Count; $i++) {
    $m = $monsterList[$i]
    $slotCol = $i % $tilesPerRow
    $slotRow = [int][Math]::Floor($i / $tilesPerRow)

    $destX = $slotCol * $tileSize
    $destY = $slotRow * $tileSize

    # UV coordinates with Three.js orientation (V is inverted: 0 at bottom, 1 at top)
    $u0 = ($destX / $atlasSize) + $halfTexel
    $v0 = (1.0 - (($destY + $tileSize) / $atlasSize)) + $halfTexel
    $u1 = (($destX + $tileSize) / $atlasSize) - $halfTexel
    $v1 = (1.0 - ($destY / $atlasSize)) - $halfTexel

    # Anatomical scale heuristics based on name
    $nameLower = $m.Name.ToLower()
    $height = 1.70
    $width = 1.25
    $isFloating = $false

    if ($nameLower -match 'farmer maggot') {
        $height = 1.20
        $width = 1.00
    } elseif ($nameLower -match 'baby.*dragon|young.*dragon|small.*dragon') {
        $height = 1.45
        $width = 1.60
    } elseif ($nameLower -match 'great wyrm|ancient.*dragon|morgoth|sauron|ancalagon|glaurung|smaug|scatha|itangast|baphomet|kronos|ungoliant') {
        $height = 3.40
        $width = 2.80
    } elseif ($nameLower -match '\b(balrog|lungorthin|gothmog)\b') {
        $height = 3.00
        $width = 2.20
    } elseif ($nameLower -match '\b(dragon|drake|wyrm)\b') {
        $height = 2.60
        $width = 2.30
    } elseif ($nameLower -match '\b(hippogriff|pegasus|griffon|gryphon)\b') {
        $height = 1.85
        $width = 1.75
    } elseif ($nameLower -match '\b(hydra|chimera|manticore)\b') {
        $height = 2.20
        $width = 2.00
    } elseif ($nameLower -match '\b(rat|mouse|flea|worm|centipede|maggot|spider|tick|crawler|scorpion|louse|beetle)\b') {
        $height = 0.55
        $width = 0.65
    } elseif ($nameLower -match '\b(frog|toad|snake|viper|naga|adder)\b') {
        $height = 0.65
        $width = 0.75
    } elseif ($nameLower -match '\b(kobold|goblin|imp|leprechaun|hobbit|dwarf|gnome|fairy|pixie|snaga)\b') {
        $height = 1.05
        $width = 0.90
    } elseif ($nameLower -match '\b(orc|uruk|skeleton|zombie|mummy|spectre|wight|wraith|vampire|ghoul)\b') {
        $height = 1.65
        $width = 1.20
    } elseif ($nameLower -match '\b(ogre|troll|giant|golem|cyclops|colossus|titan|yeti)\b') {
        $height = 2.40
        $width = 1.80
    }

    if ($nameLower -match '\b(ghost|spectre|wraith|phantom|spirit|shadow|poltergeist|vortex|eye|beholder|bat|bird|wasp|quylthulg)\b') {
        $isFloating = $true
    }

    $entryObj = [ordered]@{
        uv         = @($u0, $v0, $u1, $v1)
        height     = [Math]::Round($height, 2)
        width      = [Math]::Round($width, 2)
        isFloating = $isFloating
    }
    $atlasDict[$m.Name] = $entryObj

    # Also store unaccented alias if name contains non-ASCII characters (e.g. Sméagol -> Smeagol)
    $normalizedName = $m.Name.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = [System.Text.StringBuilder]::new()
    foreach ($ch in $normalizedName.ToCharArray()) {
        $cat = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($cat -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            $sb.Append($ch) | Out-Null
        }
    }
    $cleanName = $sb.ToString()
    if ($cleanName -ne $m.Name -and -not $atlasDict.Contains($cleanName)) {
        $atlasDict[$cleanName] = $entryObj
    }
}

# Add canonical glyph fallbacks
$glyphPatterns = @(
    @('a', 'giant.*ant|ant'),
    @('b', 'giant.*bat|bat'),
    @('c', 'centipede'),
    @('d', 'baby.*dragon|young.*dragon'),
    @('e', 'floating eye|eye'),
    @('f', 'feline|cat'),
    @('g', 'golem'),
    @('h', 'hobbit|dwarf|elf'),
    @('i', 'icky thing'),
    @('j', 'jelly'),
    @('k', 'kobold'),
    @('l', 'giant.*louse|louse'),
    @('m', 'mold|mushroom'),
    @('o', 'snaga|orc'),
    @('p', 'rogue|warrior'),
    @('q', 'wolf|bear'),
    @('r', 'giant.*rat|rat'),
    @('s', 'skeleton'),
    @('t', 'townsperson|beggar'),
    @('u', 'imp'),
    @('v', 'vortex'),
    @('w', 'worm mass|worm'),
    @('y', 'yeek'),
    @('z', 'zombified'),
    @('B', 'crow|falcon'),
    @('C', 'warg|hound'),
    @('E', 'elemental'),
    @('F', 'beetle|fly'),
    @('G', 'ghost'),
    @('H', 'hippogriff|harpy'),
    @('I', 'beetle'),
    @('J', 'snake|viper'),
    @('K', 'killer.*beetle'),
    @('L', 'lich'),
    @('M', 'hydra'),
    @('O', 'ogre'),
    @('P', 'giant'),
    @('Q', 'quylthulg'),
    @('R', 'salamander'),
    @('S', 'spider'),
    @('T', 'troll'),
    @('U', 'demon'),
    @('V', 'vampire'),
    @('W', 'wight|wraith'),
    @('X', 'xorn'),
    @('Y', 'yeti'),
    @('Z', 'hound')
)

$glyphDict = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::Ordinal)
foreach ($gp in $glyphPatterns) {
    $glyphChar = $gp[0]
    $glyphRegex = $gp[1]
    $foundMonster = $monsterList | Where-Object { $_.Name -match $glyphRegex } | Select-Object -First 1
    if ($foundMonster -and $atlasDict.Contains($foundMonster.Name)) {
        $glyphDict[$glyphChar] = $atlasDict[$foundMonster.Name]
    }
}

$finalJson = [ordered]@{
    monsters = $atlasDict
    glyphs   = $glyphDict
}

$jsonContent = $finalJson | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($jsonPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))

Write-Host "[Atlas Builder] Saved JSON lookup with $($atlasDict.Count) monsters and $($glyphDict.Count) glyphs to $jsonPath."
Write-Host "[Atlas Builder] Stage 2 Complete!"
