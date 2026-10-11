import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from bridge import Bridge

with Bridge(savefile="test_run_diag") as b:
    b.birth()
    # Go down stairs to depth 1 (corridors!)
    # Find stairs '>'
    m = b.frame["map"]
    stair_x, stair_y = None, None
    for y, row in enumerate(m["rows"]):
        for x, ch in enumerate(row["g"]):
            if ch == '>':
                stair_x, stair_y = x, y
                break
        if stair_x is not None:
            break
    print(f"Stairs at: {stair_x}, {stair_y}")
    # Wizard teleport to stairs or walk to stairs
    # Let's use ctrl+a wizard mode to jump or just pathfind
    b.command("key ctrl-a")
    # In wizard mode, let's see depth
    # Or just jump depth: b.key(">") if on stairs
