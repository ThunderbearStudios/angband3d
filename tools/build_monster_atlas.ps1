# ==============================================================================
# build_monster_atlas.ps1
# Extracts Shockbolt 64x64 monster tiles into an optimized 2048x2048 WebGL atlas,
# generates tangent-space PBR normal maps with Sobel relief & silhouette beveling,
# and outputs monster_atlas.json with UV bounds and biological scale metadata.
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
$prfLines = Get-Content $prfPath

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

# Compile C# helper for blazing-fast 2048x2048 image processing and normal map generation
Add-Type -ReferencedAssemblies "System.Drawing" -TypeDefinition @"
using System;
using System.Drawing;
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
        int tileSize
    ) {
        using (Bitmap srcBmp = new Bitmap(srcPath))
        using (Bitmap atlasBmp = new Bitmap(atlasSize, atlasSize, PixelFormat.Format32bppArgb))
        using (Bitmap normalBmp = new Bitmap(atlasSize, atlasSize, PixelFormat.Format32bppArgb)) {
            
            int tilesPerRow = atlasSize / tileSize;
            int count = srcXs.Length;

            using (Graphics g = Graphics.FromImage(atlasBmp)) {
                g.Clear(Color.Transparent);
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.NearestNeighbor;
                g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.Half;

                for (int i = 0; i < count; i++) {
                    int slotCol = i % tilesPerRow;
                    int slotRow = i / tilesPerRow;

                    int destX = slotCol * tileSize;
                    int destY = slotRow * tileSize;

                    Rectangle destRect = new Rectangle(destX, destY, tileSize, tileSize);
                    Rectangle srcRect = new Rectangle(srcXs[i], srcYs[i], tileSize, tileSize);

                    g.DrawImage(srcBmp, destRect, srcRect, GraphicsUnit.Pixel);
                }
            }

            // Now generate normal map directly from the atlas pixels using LockBits
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

            // Compute Sobel relief and spherical silhouette normal
            for (int y = 0; y < atlasSize; y++) {
                int yMin = Math.Max(0, y - 1);
                int yMax = Math.Min(atlasSize - 1, y + 1);

                for (int x = 0; x < atlasSize; x++) {
                    int idx = y * stride + x * 4;
                    byte a = atlasBytes[idx + 3];

                    if (a < 15) {
                        // Flat transparent normal (0, 0, 1) encoded as RGB(128, 128, 255)
                        normalBytes[idx + 0] = 255; // B
                        normalBytes[idx + 1] = 128; // G
                        normalBytes[idx + 2] = 128; // R
                        normalBytes[idx + 3] = 0;   // A
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

$srcXs = [int[]]::new($monsterList.Count)
$srcYs = [int[]]::new($monsterList.Count)

for ($i = 0; $i -lt $monsterList.Count; $i++) {
    $srcXs[$i] = $monsterList[$i].Col * $tileSize
    $srcYs[$i] = $monsterList[$i].Row * $tileSize
}

Write-Host "[Atlas Builder] Generating $atlasSize x $atlasSize monster atlas and normal map..."
[AtlasProcessor]::GenerateAtlasAndNormal(
    $srcImgPath,
    $srcXs,
    $srcYs,
    $atlasPngPath,
    $normalPngPath,
    $atlasSize,
    $tileSize
)

Write-Host "[Atlas Builder] Generated monster_atlas.png and monster_normal.png successfully!"

# Build JSON lookup dictionary
$atlasDict = [ordered]@{}
$halfTexel = 0.5 / $atlasSize # Inset to eliminate bilinear texture bleeding

for ($i = 0; $i -lt $monsterList.Count; $i++) {
    $m = $monsterList[$i]
    $slotCol = $i % $tilesPerRow
    $slotRow = [int]($i / $tilesPerRow)

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
    } elseif ($nameLower -match 'great wyrm|ancient.*dragon|morgoth') {
        $height = 3.40
        $width = 2.80
    } elseif ($nameLower -match '\b(rat|mouse|flea|worm|centipede|maggot|spider|tick|crawler|scorpion|louse|beetle)\b') {
        $height = 0.55
        $width = 0.65
    } elseif ($nameLower -match '\b(frog|toad|snake|viper|naga|adder)\b') {
        $height = 0.65
        $width = 0.75
    } elseif ($nameLower -match '\b(kobold|goblin|imp|leprechaun|hobbit|dwarf|gnome|fairy|pixie|snaga)\b') {
        $height = 1.05
        $width = 0.90
    } elseif ($nameLower -match '\b(mold|mushroom|fungus|jelly|ooze|slime|quylthulg|creeping)\b') {
        $height = 0.75
        $width = 0.85
    } elseif ($nameLower -match '\b(bat|wasp|bee|hornet|eye|gazer|ghost|spectre|wraith|spirit|phantom|banshee|vampire bat|poltergeist)\b') {
        $height = 1.25
        $width = 1.25
        $isFloating = $true
    } elseif ($nameLower -match '\b(troll|ogre|minotaur|giant|titan|golem|cyclops|demon|balrog|ettin|behemoth)\b') {
        $height = 2.40
        $width = 1.95
    } elseif ($nameLower -match '\b(dragon|wyrm|drake|hydra)\b') {
        $height = 3.20
        $width = 2.70
    }

    $atlasDict[$m.Name] = [ordered]@{
        uv = @($u0, $v0, $u1, $v1)
        height = $height
        width = $width
        isFloating = $isFloating
    }
}

$glyphPatterns = @(
    @('a', 'soldier ant|ant'),
    @('b', 'fruit bat|bat'),
    @('c', 'centipede'),
    @('d', 'baby.*dragon'),
    @('D', 'ancient.*dragon|dragon'),
    @('e', 'floating eye'),
    @('f', 'cat'),
    @('g', 'golem'),
    @('h', 'hobbit'),
    @('i', 'ooze|slime'),
    @('j', 'jelly'),
    @('k', 'kobold'),
    @('l', 'louse'),
    @('m', 'mold'),
    @(',', 'mushroom'),
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
    @('H', 'harpy'),
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
[System.IO.File]::WriteAllText($jsonPath, $jsonContent)

Write-Host "[Atlas Builder] Saved JSON lookup with $($atlasDict.Count) monsters and $($glyphDict.Count) glyphs to $jsonPath."
Write-Host "[Atlas Builder] Stage 2 Complete!"
