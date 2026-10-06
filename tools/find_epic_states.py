import os
import sys
from pathlib import Path

# Add tools dir to path
sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

save_dir = Path(__file__).parent.parent / "engine" / "build" / "game" / "lib" / "save"
saves = [f.name for f in save_dir.iterdir() if f.is_file() and not f.name.endswith(('.new', '.sav'))]

print(f"Total saves to scan: {len(saves)}")

for s in saves:
    try:
        b = Bridge(savefile=s, new_character=False)
        frame = b.frame
        for _ in range(10):
            if frame.get("phase") == "play" and frame.get("map") and frame.get("player"):
                break
            frame = b.key("enter")

        if frame.get("phase") == "play" and frame.get("player"):
            p = frame["player"]
            monsters = frame.get("monsters", [])
            depth = p.get("depth", 0)
            hp = p.get("hp", 0)
            max_hp = p.get("mhp", 0)
            name = p.get("name", "")
            prace = p.get("race", "")
            pclass = p.get("class", "")
            
            # Print if depth > 0 or has monsters
            if depth > 0 or len(monsters) > 0 or s.startswith("demo_"):
                m_names = [m.get("race") or m.get("name") or "?" for m in monsters]
                print(f"[{s}] depth={depth} ({depth*50}ft) HP={hp}/{max_hp} {prace} {pclass} Pos=({p.get('x')},{p.get('y')}) Monsters({len(monsters)}): {m_names[:4]}")
        b.close()
    except Exception as e:
        pass
