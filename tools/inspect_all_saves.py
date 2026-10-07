from bridge import Bridge
import sys

for s in ['demo_town', 'demo_crypt', 'demo_vault', 'demo_caverns', 'demo_mage', 'demo_combat']:
    try:
        b = Bridge(savefile=s, new_character=False)
        for _ in range(15):
            if b.frame and b.frame.get('phase') == 'play':
                break
            b.key('space')
        f = b.frame
        p = f.get('player', {})
        print(f"=== {s} ===: {p.get('name')} ({p.get('race')} {p.get('class')}), Depth {p.get('depth')} ({p.get('depth',0)*50}ft), Pos ({p.get('x')}, {p.get('y')})")
        monsters = f.get('monsters', [])
        print(f"  Monsters ({len(monsters)}):")
        for m in monsters:
            dx = m.get('x') - p.get('x')
            dy = m.get('y') - p.get('y')
            print(f"   - {m.get('name') or m.get('race')} [{m.get('glyph')}] at ({m.get('x')}, {m.get('y')}) -> offset ({dx:+d}, {dy:+d})")
        b.quit()
    except Exception as e:
        print(f"Error on {s}: {e}")
