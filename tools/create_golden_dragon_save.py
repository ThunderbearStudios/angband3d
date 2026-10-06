import sys
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

def create_dragon_save():
    print("[Gen] Starting clean character for demo_combat...")
    b = Bridge(savefile='demo_combat', new_character=True)
    for _ in range(15):
        if b.in_dungeon: break
        if b.screen_contains("use as is"):
            b.key('y')
        elif b.screen_contains("-more-"):
            b.key('enter')
        elif b.screen_contains("[y/n]"):
            b.key('y')
        elif b.screen_contains("press any key"):
            b.key('enter')
        else:
            b.key('enter')

    b.wizard_on()

    # Enter dungeon level 1
    b.key('>')
    b.dismiss()

    # Jump to level 25 (1250ft)
    print("[Gen] Jumping to level 25 (1250ft)...")
    b.key('C-a')
    b.key('j')
    while b.screen_contains('-more-'):
        b.key('enter')
    if b.screen_contains('[y/n]') or b.screen_contains('are you sure'):
        b.key('y')
    b.dismiss()

    b.key('backspace')
    b.key('2')
    b.key('5')
    b.key('enter')
    b.key('n')  # Decline custom cave profile prompt
    b.dismiss()

    # Boost hero stats and level to 50
    print("[Gen] Advancing hero to level 50...")
    b.key('C-a')
    b.key('A')  # CMD_WIZ_ADVANCE
    b.dismiss()

    # Fully illuminate the dungeon level
    print("[Gen] Illuminating dungeon level...")
    b.key('C-a')
    b.key('w')  # CMD_WIZ_WIZARD_LIGHT
    b.dismiss()

    # Detect player position
    p = b.frame['player']
    px, py = p['x'], p['y']
    print(f"[Gen] Player placed at ({px}, {py}), Depth: {p['depth']} ({p['depth']*50}ft), HP: {p['hp']}/{p['hp_max']}")

    # Summon Young Red Dragon
    print("[Gen] Summoning Young Red Dragon...")
    b.key('C-a')
    b.key('n')
    b.keys('Young red dragon')
    b.key('enter')
    b.dismiss()

    # Verify dragon presence
    dragons = [m for m in b.frame.get('monsters', []) if 'dragon' in (m.get('name') or m.get('race') or '').lower()]
    print(f"[Gen] Summoned {len(dragons)} dragon(s):")
    for d in dragons:
        dx = d['x'] - px
        dy = d['y'] - py
        print(f" - [{d['glyph']}] {d.get('name') or d.get('race')} at ({d['x']}, {d['y']}) dx={dx} dy={dy} HP={d['hp']}/{d['hp_max']}")

    # Save game
    b.save()
    b.close()

    # Backup to tools/demo_saves_backup/demo_combat
    save_src = Path(__file__).parent.parent / 'engine' / 'build' / 'game' / 'lib' / 'save' / 'demo_combat'
    backup_dst = Path(__file__).parent / 'demo_saves_backup' / 'demo_combat'
    if save_src.exists():
        shutil.copy2(save_src, backup_dst)
        print(f"[Gen] Saved and backed up golden demo_combat save to {backup_dst} ({save_src.stat().st_size} bytes)")
    else:
        print(f"[Gen] Error: {save_src} not found!")

if __name__ == '__main__':
    create_dragon_save()
