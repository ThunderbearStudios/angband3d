import sys
import shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

SAVE_DIR = Path(__file__).parent.parent / 'engine' / 'build' / 'game' / 'lib' / 'save'
BACKUP_DIR = Path(__file__).parent / 'demo_saves_backup'
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

def verify_and_backup(save_name):
    src = SAVE_DIR / save_name
    dst = BACKUP_DIR / save_name
    shutil.copy2(src, dst)
    user_save = Path(__file__).parent.parent / 'engine' / 'build' / 'game' / 'lib' / 'user' / 'save' / save_name
    if user_save.parent.exists():
        shutil.copy2(src, user_save)
    print(f"[Backup] [OK] {save_name} saved ({src.stat().st_size} bytes)")

def create_clean_caverns():
    print("\n[1] Creating demo_caverns (Ranger at 600ft)...")
    b = Bridge(savefile='Hero_EF0P', new_character=False) # Belonden, High-Elf Ranger
    for _ in range(10):
        if b.in_dungeon: break
        b.key('enter')
    b.wizard_on()
    b.key('>')
    b.dismiss()
    
    # Jump to depth 12
    b.key('C-a')
    b.key('j')
    while b.screen_contains('-more-'): b.key('enter')
    if b.screen_contains('[y/n]') or b.screen_contains('are you sure'): b.key('y')
    b.dismiss()
    b.key('backspace')
    b.key('1')
    b.key('2')
    b.key('enter')
    b.key('n')
    b.dismiss()
    
    b.key('C-a')
    b.key('A') # Advance level
    b.dismiss()
    b.key('C-a')
    b.key('w') # Light level
    b.dismiss()
    
    p = b.frame['player']
    print(f"Caverns Ranger: {p.get('name')} at ({p.get('x')}, {p.get('y')}) HP: {p.get('hp')}")
    
    # Summon an Orc archer 3 tiles away in corridor if space allows
    # Or summon orc archer via wizard command
    b.key('C-a')
    b.key('n') # CMD_WIZ_SUMMON
    while b.screen_contains('-more-'): b.key('enter')
    b.keys('Orc archer')
    b.key('enter')
    b.dismiss()
    
    b.save()
    b.close()
    
    # Rename/copy to demo_caverns
    shutil.copy2(SAVE_DIR / 'Hero_EF0P', SAVE_DIR / 'demo_caverns')
    verify_and_backup('demo_caverns')

def create_clean_mage():
    print("\n[2] Creating demo_mage (Mage at 1000ft)...")
    b = Bridge(savefile='Hero_DEMO', new_character=False) # Goros, Dunadan Mage
    for _ in range(10):
        if b.in_dungeon: break
        b.key('enter')
    b.wizard_on()
    b.key('>')
    b.dismiss()
    
    # Jump to depth 20
    b.key('C-a')
    b.key('j')
    while b.screen_contains('-more-'): b.key('enter')
    if b.screen_contains('[y/n]') or b.screen_contains('are you sure'): b.key('y')
    b.dismiss()
    b.key('backspace')
    b.key('2')
    b.key('0')
    b.key('enter')
    b.key('n')
    b.dismiss()
    
    b.key('C-a')
    b.key('A') # Advance level
    b.dismiss()
    b.key('C-a')
    b.key('w') # Light level
    b.dismiss()
    
    p = b.frame['player']
    print(f"Mage: {p.get('name')} at ({p.get('x')}, {p.get('y')}) HP: {p.get('hp')} SP: {p.get('sp')}")
    
    # Summon a Cave troll
    b.key('C-a')
    b.key('n')
    while b.screen_contains('-more-'): b.key('enter')
    b.keys('Cave troll')
    b.key('enter')
    b.dismiss()
    
    b.save()
    b.close()
    
    shutil.copy2(SAVE_DIR / 'Hero_DEMO', SAVE_DIR / 'demo_mage')
    verify_and_backup('demo_mage')

if __name__ == '__main__':
    create_clean_caverns()
    create_clean_mage()
    # Also verify existing demo saves
    for s in ['demo_town', 'demo_crypt', 'demo_vault', 'demo_combat']:
        verify_and_backup(s)
