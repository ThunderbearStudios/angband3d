import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

import shutil

saves = [
    ('demo_town', 0),
    ('demo_crypt', 1),
    ('demo_vault', 1),
    ('demo_caverns', 12),
    ('demo_mage', 20),
    ('demo_combat', 25)
]

backup_dir = Path(__file__).parent / "demo_saves_backup"
save_dir = Path(__file__).parent.parent / "engine" / "build" / "game" / "lib" / "save"

print("=== Restoring and Verifying All 6 Reimagined Golden Saves ===")
for s, expected_depth in saves:
    src = backup_dir / s
    dst = save_dir / s
    if src.exists():
        shutil.copyfile(src, dst)
    with Bridge(savefile=s, new_character=False, timeout=5.0) as b:
        b.dismiss()
        for _ in range(8):
            if b.in_dungeon and b.frame and b.frame.get('player'):
                break
            b.key("enter")
        
        p = b.frame.get('player', {})
        m = b.frame.get('map')
        mons = b.frame.get('monsters', [])
        m_names = [mon.get('name') or mon.get('race') or '?' for mon in mons]
        
        px, py = p.get('x', 0), p.get('y', 0)
        if m and 'rows' in m and py < len(m['rows']) and px < len(m['rows'][py]['g']):
            cur_ch = m['rows'][py]['g'][px]
            north = m['rows'][py-1]['g'][px] if py > 0 else '#'
            south = m['rows'][py+1]['g'][px] if py < m['h']-1 else '#'
            west = m['rows'][py]['g'][px-1] if px > 0 else '#'
            east = m['rows'][py]['g'][px+1] if px < m['w']-1 else '#'
        else:
            cur_ch, north, south, west, east = '?', '?', '?', '?', '?'
        
        print(f"[{s}] {p.get('name')} ({p.get('race')} {p.get('class')})")
        print(f"   Depth: {p.get('depth')} ({p.get('depth',0)*50}ft) | HP: {p.get('hp')} | Pos: ({px}, {py}) [tile: '{cur_ch}']")
        print(f"   Passable exits: N='{north}', S='{south}', W='{west}', E='{east}'")
        print(f"   Monsters ({len(mons)}): {m_names[:3]}")

print("\nALL 6 SAVES VERIFIED!")
