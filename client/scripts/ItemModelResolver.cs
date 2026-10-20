using System;
using System.Collections.Generic;
using System.Text.Json;
using Godot;

namespace Angband3D;

/// <summary>
/// Resolves Angband items to 3D pickups with continuous hover animation,
/// slow rotation, and emissive color accents.
/// </summary>
public static class ItemModelResolver
{
    private static readonly Dictionary<string, PackedScene> _modelCache = new();
    private static readonly Dictionary<char, Mesh> _meshCache = new();
    private static readonly Dictionary<(char Glyph, Color Color), StandardMaterial3D> _materialCache = new();

    private struct ItemAtlasEntry
    {
        public float U0;
        public float V0;
        public float U1;
        public float V1;
        public float Width;
        public float Height;
        public bool IsFlat;
    }

    private static bool _itemAtlasLoaded;
    private static Texture2D _itemAtlasTexture;
    private static Texture2D _itemNormalTexture;
    private static readonly Dictionary<string, ItemAtlasEntry> _itemAtlasItems = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, ItemAtlasEntry> _itemAtlasGlyphs = new(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, StandardMaterial3D> _itemAtlasMaterialCache = new();

    private static string ResolveAssetPath(string relPath)
    {
        try
        {
            var pRes = ProjectSettings.GlobalizePath(relPath.StartsWith("res://") ? relPath : $"res://{relPath}");
            if (System.IO.File.Exists(pRes)) return pRes;
        }
        catch { }

        if (System.IO.File.Exists(relPath)) return relPath;

        try
        {
            var pFull = System.IO.Path.GetFullPath(relPath);
            if (System.IO.File.Exists(pFull)) return pFull;
        }
        catch { }

        try
        {
            var pBase = System.IO.Path.Combine(System.AppDomain.CurrentDomain.BaseDirectory, relPath);
            if (System.IO.File.Exists(pBase)) return pBase;
        }
        catch { }

        return null;
    }

    public static void EnsureItemAtlasLoaded()
    {
        if (_itemAtlasLoaded) return;
        _itemAtlasLoaded = true;

        try
        {
            var atlasPngPath = ResolveAssetPath("../server/public/assets/sprites/items/item_atlas.png");
            var normalPngPath = ResolveAssetPath("../server/public/assets/sprites/items/item_normal.png");
            var jsonPath = ResolveAssetPath("../server/public/assets/sprites/items/item_atlas.json");

            if (atlasPngPath != null && System.IO.File.Exists(atlasPngPath))
            {
                var img = Image.LoadFromFile(atlasPngPath);
                if (img != null)
                {
                    img.GenerateMipmaps();
                    _itemAtlasTexture = ImageTexture.CreateFromImage(img);
                }
            }

            if (normalPngPath != null && System.IO.File.Exists(normalPngPath))
            {
                var nImg = Image.LoadFromFile(normalPngPath);
                if (nImg != null)
                {
                    nImg.GenerateMipmaps();
                    _itemNormalTexture = ImageTexture.CreateFromImage(nImg);
                }
            }

            if (jsonPath != null && System.IO.File.Exists(jsonPath))
            {
                var jsonStr = System.IO.File.ReadAllText(jsonPath);
                using var doc = JsonDocument.Parse(jsonStr);
                var root = doc.RootElement;

                if (root.TryGetProperty("items", out var itemsElem) && itemsElem.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in itemsElem.EnumerateObject())
                    {
                        var entry = ParseItemAtlasEntry(prop.Value);
                        _itemAtlasItems[prop.Name] = entry;
                    }
                }

                if (root.TryGetProperty("glyphs", out var glyphsElem) && glyphsElem.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in glyphsElem.EnumerateObject())
                    {
                        var entry = ParseItemAtlasEntry(prop.Value);
                        _itemAtlasGlyphs[prop.Name] = entry;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            GD.PrintErr($"[ItemModelResolver] Failed to load Shockbolt item atlas: {ex.Message}");
        }
    }

    private static ItemAtlasEntry ParseItemAtlasEntry(JsonElement el)
    {
        var entry = new ItemAtlasEntry
        {
            Width = 0.40f,
            Height = 0.40f,
            IsFlat = false
        };

        if (el.TryGetProperty("uv", out var uvElem) && uvElem.ValueKind == JsonValueKind.Array && uvElem.GetArrayLength() >= 4)
        {
            entry.U0 = uvElem[0].GetSingle();
            entry.V0 = uvElem[1].GetSingle();
            entry.U1 = uvElem[2].GetSingle();
            entry.V1 = uvElem[3].GetSingle();
        }

        if (el.TryGetProperty("width", out var wElem) && wElem.TryGetSingle(out var w))
        {
            entry.Width = w;
        }

        if (el.TryGetProperty("height", out var hElem) && hElem.TryGetSingle(out var h))
        {
            entry.Height = h;
        }

        if (el.TryGetProperty("isFlat", out var flatElem))
        {
            entry.IsFlat = flatElem.GetBoolean();
        }

        return entry;
    }

    public static bool TryCreateAtlasBillboard(string itemName, char glyph, out Node3D billboardNode)
    {
        billboardNode = null;
        EnsureItemAtlasLoaded();

        if (_itemAtlasTexture == null) return false;

        ItemAtlasEntry entry = default;
        bool found = false;

        if (!string.IsNullOrEmpty(itemName))
        {
            var raw = itemName.Trim();
            if (raw.EndsWith(" (pile)")) raw = raw.Substring(0, raw.Length - 7).Trim();

            if (_itemAtlasItems.TryGetValue(raw, out entry))
            {
                found = true;
            }
            else
            {
                var lower = raw.ToLowerInvariant();
                foreach (var (k, v) in _itemAtlasItems)
                {
                    if (lower.StartsWith(k.ToLowerInvariant()) || lower.Contains(k.ToLowerInvariant()))
                    {
                        entry = v;
                        found = true;
                        break;
                    }
                }
            }
        }

        if (!found)
        {
            var glyphKey = glyph.ToString();
            if (_itemAtlasGlyphs.TryGetValue(glyphKey, out entry))
            {
                found = true;
            }
        }

        if (!found) return false;

        var matKey = $"{entry.U0}_{entry.V0}_{entry.U1}_{entry.V1}_{entry.IsFlat}";
        if (!_itemAtlasMaterialCache.TryGetValue(matKey, out var mat))
        {
            mat = new StandardMaterial3D
            {
                AlbedoTexture = _itemAtlasTexture,
                NormalEnabled = true,
                NormalTexture = _itemNormalTexture,
                NormalScale = 0.80f,
                Transparency = BaseMaterial3D.TransparencyEnum.AlphaScissor,
                AlphaScissorThreshold = 0.35f,
                AlphaAntialiasingMode = BaseMaterial3D.AlphaAntiAliasing.AlphaToCoverage,
                BillboardMode = BaseMaterial3D.BillboardModeEnum.FixedY,
                TextureFilter = BaseMaterial3D.TextureFilterEnum.LinearWithMipmapsAnisotropic,
                Uv1Scale = new Vector3(entry.U1 - entry.U0, entry.V1 - entry.V0, 1.0f),
                Uv1Offset = new Vector3(entry.U0, 1.0f - entry.V1, 0.0f),
                CullMode = BaseMaterial3D.CullModeEnum.Disabled,
            };
            _itemAtlasMaterialCache[matKey] = mat;
        }

        var w = entry.Width > 0 ? entry.Width : 0.40f;
        var h = entry.Height > 0 ? entry.Height : 0.40f;

        var quad = new QuadMesh
        {
            Size = new Vector2(w, h),
        };

        var meshInst = new MeshInstance3D
        {
            Mesh = quad,
            MaterialOverride = mat,
            CastShadow = GeometryInstance3D.ShadowCastingSetting.On,
            Position = new Vector3(0, h * 0.5f, 0),
        };

        billboardNode = meshInst;
        return true;
    }

    /// <summary>
    /// Declarative mapping of item glyphs to CC0 3D mesh assets and scaling factors.
    /// Contributors can add new 3D item models here or via RegisterItemModel.
    /// </summary>
    public static readonly Dictionary<char, (string ModelPath, float Scale)> ModelMappings = new()
    {
        { '$', ("res://assets/models/items/coin_pile_spill.glb", 0.55f) },
        { '!', ("res://assets/models/items/healing_potion.glb", 0.50f) },
        { '?', ("res://assets/models/items/scroll.glb", 0.50f) },
        { ')', ("res://assets/models/items/steel_longsword.glb", 0.40f) },
        { '[', ("res://assets/models/items/plate_armor.glb", 0.45f) },
        { ']', ("res://assets/models/items/plate_armor.glb", 0.45f) },
        { '(', ("res://assets/models/items/shield_wooden.glb", 0.48f) },
        { '/', ("res://assets/models/items/spear.glb", 0.32f) },
        { '_', ("res://assets/models/items/staff.glb", 0.42f) },
        { '-', ("res://assets/models/items/wand.glb", 0.42f) },
        { '|', ("res://assets/models/items/spear.glb", 0.32f) },
        { '\\', ("res://assets/polyhaven/models/rusted_spade_01/rusted_spade_01.gltf", 0.45f) },
        { ',', ("res://assets/models/items/bread.glb", 0.55f) },
        { '"', ("res://assets/models/items/phoenix_talisman.glb", 0.40f) },
        { '=', ("res://assets/models/items/Ring1.fbx", 0.16f) },
        { '*', ("res://assets/models/items/Crystal1.fbx", 0.18f) },
        { '~', ("res://assets/models/items/torch.glb", 0.48f) },
        { '{', ("res://assets/models/items/steel_arrow.glb", 0.40f) },
        { '}', ("res://assets/models/items/bow.glb", 0.42f) },
    };

    /// <summary>
    /// Register or override a 3D model mapping for an item glyph.
    /// </summary>
    public static void RegisterItemModel(char glyph, string modelPath, float scale = 0.20f)
    {
        ModelMappings[glyph] = (modelPath, scale);
    }

    public static Node3D CreateItemNode(JsonElement item, Vector3 worldPos, bool isVisibleInView = true)
    {
        var root = new Node3D { Position = worldPos };

        var glyphStr = item.TryGetProperty("glyph", out var gProp) ? gProp.GetString() ?? "?" : "?";
        var glyph = glyphStr.Length > 0 ? glyphStr[0] : '?';
        var attr = item.TryGetProperty("attr", out var aProp) ? aProp.GetInt32() : 1;
        var color = AngbandColors.Get(attr);

        string itemName = item.TryGetProperty("name", out var nProp) ? nProp.GetString() : null;
        if (item.TryGetProperty("pile", out var pProp) && pProp.GetBoolean())
        {
            itemName += " (pile)";
        }

        // Subtle ground-level rarity plinth ring
        var plinthMat = new StandardMaterial3D
        {
            AlbedoColor = color,
            EmissionEnabled = true,
            Emission = color,
            EmissionEnergyMultiplier = 0.45f,
            Roughness = 0.35f,
            Metallic = 0.15f,
        };
        var plinthMesh = new TorusMesh
        {
            InnerRadius = 0.10f,
            OuterRadius = 0.22f,
            Rings = 24,
            RingSegments = 12,
        };
        var plinth = new MeshInstance3D
        {
            Mesh = plinthMesh,
            MaterialOverride = plinthMat,
            Position = new Vector3(0, 0.01f, 0),
        };
        root.AddChild(plinth);

        var visual = CreateVisual(glyph, color, itemName);
        var rotator = new ItemRotator();
        rotator.Position = new Vector3(0, 0.12f, 0);
        rotator.AddChild(visual);
        root.AddChild(rotator);

        if (!string.IsNullOrEmpty(itemName))
        {
            var caption = CreateCaption(itemName, new Vector3(0, 0.45f, 0),
                new Color(0.88f, 0.88f, 0.82f), 34);
            caption.Name = "ItemCaption";
            caption.Visible = isVisibleInView;
            root.AddChild(caption);
        }

        return root;
    }

    public static void UpdateItemVisibility(Node3D itemNode, bool isVisibleInView)
    {
        if (itemNode == null) return;
        var caption = itemNode.GetNodeOrNull<Label3D>("ItemCaption");
        if (caption != null)
        {
            caption.Visible = isVisibleInView;
        }
    }

    private static Node3D CreateVisual(char glyph, Color color, string itemName = null)
    {
        var isTorch = (glyph == '~' || (!string.IsNullOrEmpty(itemName) && itemName.ToLowerInvariant().Contains("torch")));
        if (isTorch && (string.IsNullOrEmpty(itemName) || !itemName.ToLowerInvariant().Contains("lantern")))
        {
            var torch = ViewModel.CreateHandheldTorchNode();
            torch.Scale = Vector3.One * 0.75f;
            return torch;
        }

        if (TryCreateAtlasBillboard(itemName, glyph, out var billboardNode))
        {
            return billboardNode;
        }

        var modelConfig = ResolveSpecificItemModel(glyph, itemName);
        if (modelConfig.ModelPath != null)
        {
            var scene = GetModel(modelConfig.ModelPath);
            if (scene != null)
            {
                var inst = scene.Instantiate<Node3D>();
                inst.Scale = new Vector3(modelConfig.Scale, modelConfig.Scale, modelConfig.Scale);
                UpgradeItemMaterials(inst, glyph, color, itemName);
                return inst;
            }
        }

        // Procedural stylized 3D pickups fallback
        var mesh = GetPickupMesh(glyph);
        var mat = GetPickupMaterial(glyph, color);

        return new MeshInstance3D
        {
            Mesh = mesh,
            MaterialOverride = mat,
        };
    }

    private static void UpgradeItemMaterials(Node node, char glyph, Color color, string itemName)
    {
        if (node is MeshInstance3D mi)
        {
            var count = mi.Mesh != null ? mi.Mesh.GetSurfaceCount() : 1;
            for (int i = 0; i < count; i++)
            {
                if (mi.GetActiveMaterial(i) is BaseMaterial3D orig)
                {
                    var mat = (BaseMaterial3D)orig.Duplicate();
                    mat.TextureFilter = BaseMaterial3D.TextureFilterEnum.LinearWithMipmapsAnisotropic;
                    mat.Roughness = Mathf.Clamp(mat.Roughness, 0.25f, 0.85f);

                    if (color != Colors.White && color.A > 0)
                    {
                        mat.RimEnabled = true;
                        mat.Rim = 0.40f;
                        mat.RimTint = 0.40f;
                    }
                    mi.SetSurfaceOverrideMaterial(i, mat);
                }
            }
        }

        foreach (var child in node.GetChildren())
        {
            UpgradeItemMaterials(child, glyph, color, itemName);
        }
    }

    private static (string ModelPath, float Scale) ResolveSpecificItemModel(char glyph, string itemName)
    {
        if (!string.IsNullOrEmpty(itemName))
        {
            var lower = itemName.ToLowerInvariant();

            // Daggers & Knives
            if (lower.Contains("dagger") || lower.Contains("knife") || lower.Contains("rapier") || lower.Contains("stiletto") || lower.Contains("main gauche") || lower.Contains("misericorde") || lower.Contains("baselard") || lower.Contains("bodkin") || lower.Contains("falcon") || lower.Contains("athame"))
            {
                return ("res://assets/models/weapons/Dagger.fbx", 0.18f);
            }
            // 2H Swords & Greatswords
            if (lower.Contains("two-handed") || lower.Contains("great sword") || lower.Contains("claymore") || lower.Contains("zweihander") || lower.Contains("executioner") || lower.Contains("flamberge") || lower.Contains("no-dachi"))
            {
                return ("res://assets/models/items/great_sword.glb", 0.35f);
            }
            // Rune / Artifact blades
            if (lower.Contains("rune") || lower.Contains("runic") || lower.Contains("artifact") || lower.Contains("holy") || lower.Contains("radiant") || lower.Contains("blessed") || lower.Contains("westernesse") || lower.Contains("gondolin") || lower.Contains("anduril") || lower.Contains("glamdring") || lower.Contains("ringil") || lower.Contains("sting"))
            {
                return ("res://assets/models/items/rune_blade.glb", 0.35f);
            }
            // Goblin / Orc / Scimitar / Cutlass
            if (lower.Contains("goblin") || lower.Contains("orc") || lower.Contains("scimitar") || lower.Contains("cutlass") || lower.Contains("tulwar") || lower.Contains("falchion"))
            {
                return ("res://assets/models/items/goblin_sword.glb", 0.45f);
            }
            // Default Swords
            if (lower.Contains("sword") || lower.Contains("blade") || lower.Contains("katana") || lower.Contains("foil") || lower.Contains("sabre") || lower.Contains("broadsword") || lower.Contains("broad sword") || lower.Contains("bastard") || lower.Contains("short sword") || lower.Contains("wakizashi") || lower.Contains("ninjato") || lower.Contains("longsword"))
            {
                return ("res://assets/models/items/steel_longsword.glb", 0.40f);
            }
            // 2H Battle Axes & Polearms
            if (lower.Contains("battle axe") || lower.Contains("great axe") || lower.Contains("broad axe") || lower.Contains("halberd") || lower.Contains("poleaxe"))
            {
                return ("res://assets/models/weapons/Axe_Double.fbx", 0.22f);
            }
            // 1H Axes
            if (lower.Contains("axe") || lower.Contains("cleaver") || lower.Contains("hatchet"))
            {
                return ("res://assets/models/weapons/Axe.fbx", 0.20f);
            }
            // Digging tools: Shovels & Spades
            if (lower.Contains("shovel") || lower.Contains("spade") || lower.Contains("trowel"))
            {
                return ("res://assets/polyhaven/models/rusted_spade_01/rusted_spade_01.gltf", 0.45f);
            }
            // Digging tools: Picks & Mattocks
            if (lower.Contains("pick") || lower.Contains("mattock") || lower.Contains("digger"))
            {
                return ("res://assets/polyhaven/models/picke_dirty_01/picke_dirty_01.gltf", 0.45f);
            }
            // War Hammers
            if (lower.Contains("war hammer") || lower.Contains("great hammer"))
            {
                return ("res://assets/models/weapons/Hammer_Double.fbx", 0.20f);
            }
            // Whips, Bullwhips, Scourges
            if (lower.Contains("whip") || lower.Contains("bullwhip") || lower.Contains("scourge") || lower.Contains("cat-o"))
            {
                return ("res://assets/models/weapons/Sword_2.fbx", 0.18f);
            }
            // Morning stars / Flails
            if (lower.Contains("morning") || lower.Contains("morningstar") || lower.Contains("morning star") || lower.Contains("flail") || lower.Contains("ball-and-chain"))
            {
                return ("res://assets/models/items/morningstar.glb", 0.42f);
            }
            // Clubs / Cudgels
            if (lower.Contains("club") || lower.Contains("cudgel") || lower.Contains("greatclub") || lower.Contains("mace"))
            {
                return ("res://assets/models/items/greatclub.glb", 0.38f);
            }
            // Remaining hammers
            if (lower.Contains("hammer"))
            {
                return ("res://assets/models/weapons/Hammer_Small.fbx", 0.20f);
            }
            // Spears / Polearms
            if (lower.Contains("spear") || lower.Contains("pike") || lower.Contains("lance") || lower.Contains("trident") || lower.Contains("polearm"))
            {
                return ("res://assets/models/items/spear.glb", 0.32f);
            }
            // Scythes
            if (lower.Contains("scythe"))
            {
                return ("res://assets/models/weapons/Scythe.fbx", 0.22f);
            }
            // Bows / Crossbows
            if (lower.Contains("crossbow") || lower.Contains("arbalest") || lower.Contains("bow") || lower.Contains("sling"))
            {
                return ("res://assets/models/items/bow.glb", 0.42f);
            }
            // Stones, Pebbles & Rocks (Ammo for Slings)
            if (lower.Contains("pebble") || lower.Contains("stone") || lower.Contains("rock"))
            {
                return ("res://assets/models/items/Mineral.fbx", 0.16f);
            }
            // Darts
            if (lower.Contains("dart"))
            {
                return ("res://assets/models/items/Dart.fbx", 0.18f);
            }
            // Shots & Bullets (Iron shot, sling bullet)
            if (lower.Contains("shot") || lower.Contains("bullet"))
            {
                return ("res://assets/models/items/Mineral.fbx", 0.14f);
            }
            // Arrows & Bolts
            if (lower.Contains("arrow") || lower.Contains("bolt") || lower.Contains("quiver"))
            {
                return ("res://assets/models/items/steel_arrow.glb", 0.40f);
            }
            // Wands, Rods & Staves
            if (glyph == '-' || glyph == '_' || lower.Contains("wand") || lower.Contains("rod") || lower.Contains("staff") || lower.Contains("stave"))
            {
                if (lower.Contains("wand")) return ("res://assets/models/items/wand.glb", 0.42f);
                if (lower.Contains("rod")) return ("res://assets/models/items/rod.glb", 0.42f);
                if (lower.Contains("staff") || lower.Contains("stave") || glyph == '_') return ("res://assets/models/items/staff.glb", 0.42f);
                return ("res://assets/models/items/wand.glb", 0.42f);
            }
            // Shields -> wicker: ("res://assets/polyhaven/models/carved_wooden_plate/carved_wooden_plate.gltf", 0.48f), round/buckler/targe/wooden: ("res://assets/models/items/shield_wooden.glb", 0.48f), heraldic/knight/dragon/mithril: ("res://assets/models/items/shield_raven.glb", 0.48f)
            if (lower.Contains("shield") || lower.Contains("buckler") || lower.Contains("targe"))
            {
                if (lower.Contains("wicker") || lower.Contains("reed") || lower.Contains("straw") || lower.Contains("woven"))
                {
                    return ("res://assets/polyhaven/models/carved_wooden_plate/carved_wooden_plate.gltf", 0.48f);
                }
                if (lower.Contains("heraldic") || lower.Contains("knight") || lower.Contains("dragon") || lower.Contains("mithril") || lower.Contains("raven") || lower.Contains("golden") || lower.Contains("celtic") || lower.Contains("large") || lower.Contains("heater"))
                {
                    return ("res://assets/models/items/shield_raven.glb", 0.48f);
                }
                return ("res://assets/models/items/shield_wooden.glb", 0.48f);
            }
            // Cloaks & Capes -> ("res://assets/models/items/wool_cape.glb", 0.45f)
            if (lower.Contains("cloak") || lower.Contains("cape") || lower.Contains("mantle") || lower.Contains("shadow"))
            {
                return ("res://assets/models/items/wool_cape.glb", 0.45f);
            }
            // Body Armor -> leather/robe/soft: ("res://assets/models/items/leather_armor.glb", 0.45f), chain/mail/hauberk/scale: ("res://assets/models/items/chain_mail.glb", 0.45f), plate/mithril: ("res://assets/models/items/plate_armor.glb", 0.45f)
            if (lower.Contains("plate") || lower.Contains("chain") || lower.Contains("mail") || lower.Contains("armor") || lower.Contains("cuirass") || lower.Contains("corselet") || lower.Contains("robe") || lower.Contains("leather") || lower.Contains("jacket") || lower.Contains("hauberk") || lower.Contains("scale"))
            {
                if (lower.Contains("leather") || lower.Contains("robe") || lower.Contains("soft") || lower.Contains("padded") || lower.Contains("jacket"))
                {
                    return ("res://assets/models/items/leather_armor.glb", 0.45f);
                }
                if (lower.Contains("chain") || lower.Contains("scale") || lower.Contains("hauberk") || lower.Contains("ring mail") || lower.Contains("splint"))
                {
                    return ("res://assets/models/items/chain_mail.glb", 0.45f);
                }
                return ("res://assets/models/items/plate_armor.glb", 0.45f);
            }
            // Helmets & Crowns
            if (lower.Contains("crown") || lower.Contains("coronet") || lower.Contains("diadem") || lower.Contains("brilliance"))
            {
                return ("res://assets/models/items/helm_of_brilliance.glb", 0.48f);
            }
            if (lower.Contains("helm") || lower.Contains("helmet") || lower.Contains("cap") || lower.Contains("hat"))
            {
                return ("res://assets/models/items/iron_helmet.glb", 0.48f);
            }
            // Gloves & Gauntlets -> ("res://assets/models/items/iron_gauntlets.glb", 0.48f)
            if (lower.Contains("glove") || lower.Contains("gauntlet") || lower.Contains("cesta") || lower.Contains("bracer"))
            {
                return ("res://assets/models/items/iron_gauntlets.glb", 0.48f);
            }
            // Boots & Greaves -> ("res://assets/models/items/iron_boots.glb", 0.48f)
            if (lower.Contains("boot") || lower.Contains("greave") || lower.Contains("shoe") || lower.Contains("sandal"))
            {
                return ("res://assets/models/items/iron_boots.glb", 0.48f);
            }
            // Potions -> greater/critical/mana/restore: ("res://assets/models/items/greater_healing_potion.glb", 0.55f), supreme/life/star: ("res://assets/models/items/supreme_healing_potion.glb", 0.55f), default: ("res://assets/models/items/healing_potion.glb", 0.50f)
            if (lower.Contains("potion") || lower.Contains("draught") || lower.Contains("flask") || lower.Contains("elixir"))
            {
                if (lower.Contains("supreme") || lower.Contains("life") || lower.Contains("star"))
                {
                    return ("res://assets/models/items/supreme_healing_potion.glb", 0.55f);
                }
                if (lower.Contains("greater") || lower.Contains("critical") || lower.Contains("mana") || lower.Contains("restore"))
                {
                    return ("res://assets/models/items/greater_healing_potion.glb", 0.55f);
                }
                return ("res://assets/models/items/healing_potion.glb", 0.50f);
            }
            // Books & Spellbooks
            if (lower.Contains("book") || lower.Contains("tome") || lower.Contains("grimoire") || lower.Contains("incantations") || lower.Contains("prayers") || lower.Contains("sorcery") || lower.Contains("magic"))
            {
                return ("res://assets/models/items/Book1_Closed.fbx", 0.18f);
            }
            // Scrolls -> enchant/acquirement/artifact: ("res://assets/models/items/scroll_enchant.glb", 0.50f), default: ("res://assets/models/items/scroll.glb", 0.50f)
            if (lower.Contains("scroll") || lower.Contains("parchment") || lower.Contains("paper"))
            {
                if (lower.Contains("enchant") || lower.Contains("acquirement") || lower.Contains("artifact"))
                {
                    return ("res://assets/models/items/scroll_enchant.glb", 0.50f);
                }
                return ("res://assets/models/items/scroll.glb", 0.50f);
            }
            // Rings
            if (lower.Contains("ring") || lower.Contains("band"))
            {
                return ("res://assets/models/items/Ring1.fbx", 0.16f);
            }
            // Amulets & Necklaces & Talismans
            if (lower.Contains("amulet") || lower.Contains("necklace") || lower.Contains("pendant") || lower.Contains("medallion") || lower.Contains("periapt") || lower.Contains("talisman"))
            {
                return ("res://assets/models/items/phoenix_talisman.glb", 0.40f);
            }
            // Gems & Crystals
            if (lower.Contains("gem") || lower.Contains("crystal") || lower.Contains("diamond") || lower.Contains("ruby") || lower.Contains("emerald") || lower.Contains("sapphire") || lower.Contains("mineral") || lower.Contains("opal") || lower.Contains("garnet"))
            {
                return ("res://assets/models/items/Crystal1.fbx", 0.16f);
            }
            // Chests & Gold
            if (lower.Contains("chest") || lower.Contains("coffer") || lower.Contains("box"))
            {
                return ("res://assets/models/items/Chest_Closed.fbx", 0.20f);
            }
            // Gold & Coins -> ("res://assets/models/items/coin_pile_spill.glb", 0.55f)
            if (lower.Contains("gold") || lower.Contains("coin") || lower.Contains("copper") || lower.Contains("silver") || lower.Contains("mithril coin") || lower.Contains("money") || lower.Contains("treasure"))
            {
                return ("res://assets/models/items/coin_pile_spill.glb", 0.55f);
            }
            // Food & Rations -> lembas/waybread/wafer: ("res://assets/models/items/lembas_wafer.glb", 0.55f), default: ("res://assets/models/items/bread.glb", 0.55f)
            if (lower.Contains("ration") || lower.Contains("food") || lower.Contains("meat") || lower.Contains("bread") || lower.Contains("mushroom") || lower.Contains("apple") || lower.Contains("slime mold") || lower.Contains("lembas") || lower.Contains("wafer") || lower.Contains("waybread"))
            {
                if (lower.Contains("lembas") || lower.Contains("waybread") || lower.Contains("wafer"))
                {
                    return ("res://assets/models/items/lembas_wafer.glb", 0.55f);
                }
                return ("res://assets/models/items/bread.glb", 0.55f);
            }
            // Remains & Skulls
            if (lower.Contains("skull") || lower.Contains("bone") || lower.Contains("skeleton"))
            {
                return ("res://assets/models/items/Skull.fbx", 0.18f);
            }
            // Torches -> ("res://assets/models/items/torch.glb", 0.48f)
            if (lower.Contains("torch"))
            {
                return ("res://assets/models/items/torch.glb", 0.48f);
            }
            if (lower.Contains("lantern") || lower.Contains("lamp"))
            {
                return ("res://assets/models/props/lantern_standing.gltf", 0.28f);
            }
            if (lower.Contains("phial") || lower.Contains("star of") || lower.Contains("arkenstone"))
            {
                return ("res://assets/models/items/Crystal1.fbx", 0.22f);
            }
            // Bags & Backpacks
            if (lower.Contains("bag") || lower.Contains("pouch") || lower.Contains("pack") || lower.Contains("sack"))
            {
                return ("res://assets/models/items/Backpack.fbx", 0.20f);
            }
            // Keys & Lockpicks -> ("res://assets/models/items/dungeon_key_gold.glb", 0.50f)
            if (lower.Contains("key") || lower.Contains("lockpick") || lower.Contains("padlock"))
            {
                return ("res://assets/models/items/dungeon_key_gold.glb", 0.50f);
            }
        }

        if (ModelMappings.TryGetValue(glyph, out var config))
        {
            return config;
        }

        return (null, 0.50f);
    }

    private static StandardMaterial3D GetPickupMaterial(char glyph, Color color)
    {
        var key = (glyph, color);
        if (_materialCache.TryGetValue(key, out var mat))
        {
            return mat;
        }

        mat = new StandardMaterial3D
        {
            AlbedoColor = color,
            Roughness = glyph is ')' or '[' or ']' or '(' or '=' ? 0.28f : 0.45f,
            Metallic = glyph is ')' or '[' or ']' or '(' or '=' ? 0.92f : 0.05f,
            EmissionEnabled = true,
            Emission = color,
            EmissionEnergyMultiplier = 0.85f,
            RimEnabled = true,
            Rim = 0.5f,
            RimTint = 0.5f,
        };
        _materialCache[key] = mat;
        return mat;
    }

    private static Mesh GetPickupMesh(char glyph)
    {
        if (_meshCache.TryGetValue(glyph, out var cached))
        {
            return cached;
        }

        Mesh mesh = glyph switch
        {
            '!' => new CylinderMesh { TopRadius = 0.10f, BottomRadius = 0.18f, Height = 0.38f, RadialSegments = 12 }, // Potion
            '?' => new CylinderMesh { TopRadius = 0.08f, BottomRadius = 0.08f, Height = 0.45f, RadialSegments = 8 },  // Scroll
            '=' => new TorusMesh { InnerRadius = 0.10f, OuterRadius = 0.18f, Rings = 12, RingSegments = 8 },       // Ring
            '"' => new SphereMesh { Radius = 0.15f, Height = 0.30f, RadialSegments = 12, Rings = 6 },              // Amulet
            ')' => new BoxMesh { Size = new Vector3(0.08f, 0.55f, 0.14f) },                                        // Weapon
            '[' or ']' or '(' => new BoxMesh { Size = new Vector3(0.35f, 0.42f, 0.12f) },                          // Armor / Shield
            '-' or '/' or '_' or '|' => new CylinderMesh { TopRadius = 0.035f, BottomRadius = 0.035f, Height = 0.55f }, // Wand / Staff / Rod
            _ => new BoxMesh { Size = new Vector3(0.24f, 0.24f, 0.24f) },                                          // Default
        };

        _meshCache[glyph] = mesh;
        return mesh;
    }

    private static Label3D CreateCaption(string text, Vector3 pos, Color colour, int size = 48)
    {
        return new Label3D
        {
            Text = text,
            Modulate = colour,
            OutlineModulate = new Color(0, 0, 0, 0.95f),
            OutlineSize = 14,
            FontSize = size,
            PixelSize = 0.0055f,
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
            Shaded = false,
            NoDepthTest = false,
            VisibilityRangeEnd = 20.0f,
            VisibilityRangeEndMargin = 3.0f,
            VisibilityRangeFadeMode = GeometryInstance3D.VisibilityRangeFadeModeEnum.Self,
            Position = pos,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
    }

    private static PackedScene GetModel(string path)
    {
        if (string.IsNullOrEmpty(path)) return null;

        if (_modelCache.TryGetValue(path, out var scene))
        {
            return scene;
        }

        try
        {
            if (ResourceLoader.Exists(path))
            {
                scene = GD.Load<PackedScene>(path);
                if (scene != null)
                {
                    _modelCache[path] = scene;
                    return scene;
                }
            }
        }
        catch (Exception ex)
        {
            GD.PrintErr($"[ItemModelResolver] Failed to load model '{path}': {ex.Message}");
        }

        return null;
    }
}

/// <summary>
/// Continuous gentle hover and rotation for 3D item pickups on the floor.
/// </summary>
public partial class ItemRotator : Node3D
{
    private double _time;
    private float _baseY;

    public override void _Ready()
    {
        _baseY = Position.Y;
        _time = GD.Randf() * 10.0;
    }

    public override void _Process(double delta)
    {
        _time += delta;
        Rotation = new Vector3(0, (float)(_time * 1.8), 0);
        Position = new Vector3(Position.X, _baseY + Mathf.Sin((float)_time * 3.2f) * 0.06f, Position.Z);
    }
}
