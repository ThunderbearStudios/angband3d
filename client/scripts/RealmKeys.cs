// client/scripts/RealmKeys.cs
// Single source of truth for realm-specific command keys in Godot client.
// Mirrors server/public/js/realm-keys.js with canonical key mappings.

using System;
using System.Collections.Generic;

namespace Angband3D;

public static class RealmKeys
{
    private static readonly Dictionary<string, Dictionary<string, string>> RealmCommandMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["angband"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cast"] = "m", ["throw"] = "v", ["fire"] = "f", ["quaff"] = "q", ["read"] = "r", ["rest"] = "R",
            ["open"] = "o", ["pickup"] = "g", ["inven"] = "i", ["equip"] = "e", ["use"] = "U", ["hold"] = ",",
            ["browse"] = "b", ["study"] = null, ["power"] = null, ["skills"] = null, ["quests"] = null, ["overland"] = null
        },
        ["silq"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cast"] = "s", ["throw"] = "t", ["fire"] = "f", ["quaff"] = "q", ["read"] = null, ["rest"] = "%",
            ["open"] = "o", ["pickup"] = "g", ["inven"] = "i", ["equip"] = "e", ["use"] = "a", ["hold"] = ",",
            ["browse"] = null, ["study"] = null, ["power"] = null, ["skills"] = "tab", ["quests"] = null, ["overland"] = null
        },
        ["frogcomposband"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cast"] = "m", ["throw"] = "v", ["fire"] = "f", ["quaff"] = "q", ["read"] = "r", ["rest"] = "R",
            ["open"] = "o", ["pickup"] = "g", ["inven"] = "i", ["equip"] = "e", ["use"] = "U", ["hold"] = ",",
            ["browse"] = "b", ["study"] = null, ["power"] = "U", ["skills"] = null, ["quests"] = null, ["overland"] = null
        },
        ["hengband"] = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cast"] = "m", ["throw"] = "v", ["fire"] = "f", ["quaff"] = "q", ["read"] = "r", ["rest"] = "R",
            ["open"] = "o", ["pickup"] = "g", ["inven"] = "i", ["equip"] = "e", ["use"] = "U", ["hold"] = ",",
            ["browse"] = "b", ["study"] = "G", ["power"] = "U", ["skills"] = null, ["quests"] = null, ["overland"] = null
        }
    };

    public static string GetKey(string verb, string realm = "angband")
    {
        var r = string.IsNullOrEmpty(realm) ? "angband" : realm.ToLowerInvariant();
        if (RealmCommandMap.TryGetValue(r, out var map) && map.TryGetValue(verb, out var key))
        {
            return key;
        }
        return null;
    }

    public static string FromVanilla(string vanillaKey, string realm = "angband")
    {
        var r = string.IsNullOrEmpty(realm) ? "angband" : realm.ToLowerInvariant();
        if (r == "angband") return vanillaKey;
        if (!RealmCommandMap.TryGetValue(r, out var targetMap)) return vanillaKey;
        var angMap = RealmCommandMap["angband"];

        foreach (var (verb, key) in angMap)
        {
            if (string.Equals(key, vanillaKey, StringComparison.Ordinal))
            {
                if (targetMap.TryGetValue(verb, out var mapped) && !string.IsNullOrEmpty(mapped))
                {
                    return mapped;
                }
                break;
            }
        }
        return vanillaKey;
    }

    public static string Get(string verb, string realm = "angband") => GetKey(verb, realm);

    public static string StayKey(string realm = "angband")
    {
        return Get("hold", realm) ?? ",";
    }
}
