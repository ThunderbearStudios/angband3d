import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

saves = ['demo_town', 'demo_crypt', 'demo_vault', 'demo_stealth', 'demo_combat']

for s in saves:
    print(f"\n=================== MAP INSPECTION: {s} ===================")
    b = Bridge(savefile=s, new_character=False)
    frame = b.frame
    for _ in range(10):
        if frame.get("phase") == "play" and frame.get("map") and frame.get("player"):
            break
        frame = b.key("enter")

    p = frame["player"]
    m = frame["map"]
    px, py = p["x"], p["y"]
    print(f"Player: {p['name']} ({p['race']} {p['class']}) at ({px}, {py}), Depth: {p['depth']} ({p['depth']*50}ft)")

    # Print 7x7 grid around player
    print("Local 7x7 Map (g=glyph, f=feat):")
    for dy in range(-3, 4):
        y = py + dy
        if 0 <= y < m["h"]:
            row_g = m["rows"][y]["g"]
            row_f = m["rows"][y]["f"]
            glyphs = [row_g[x] if 0 <= x < m["w"] else ' ' for x in range(px - 3, px + 4)]
            feats = [row_f[x*2:x*2+2] if 0 <= x < m["w"] else '  ' for x in range(px - 3, px + 4)]
            print(f" y={y:2d} (dy={dy:+2d}) | {''.join(glyphs)} | {' '.join(feats)}")

    # Find stairs and shops in the entire map
    stairs_down = []
    stairs_up = []
    shops = []
    for y in range(m["h"]):
        row_f = m["rows"][y]["f"]
        for x in range(m["w"]):
            feat = int(row_f[x*2:x*2+2], 16)
            if feat == 6: stairs_down.append((x, y))
            elif feat == 5: stairs_up.append((x, y))
            elif 7 <= feat <= 14: shops.append((x, y, feat - 6))

    print(f"Stairs Down (>): {stairs_down}")
    print(f"Stairs Up (<): {stairs_up}")
    print(f"Shops (1-8): {shops[:8]}")

    mons = frame.get("monsters", [])
    print(f"Monsters in LOS ({len(mons)}):")
    for mon in mons:
        print(f" - [{mon.get('glyph')}] {mon.get('name') or mon.get('race')} at ({mon.get('x')}, {mon.get('y')}) HP:{mon.get('hp')}/{mon.get('hp_max')}")

    b.close()
