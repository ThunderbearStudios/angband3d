import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge

b = Bridge(savefile='demo_town', new_character=False)
for _ in range(10):
    if b.in_dungeon: break
    b.key('enter')

p = b.frame['player']
print(f"Start: ({p['x']}, {p['y']})")
b.key('left')
print('After left:', b.frame['player']['x'], b.frame['player']['y'], b.frame.get('phase'))
b.key('down')
print('After down:', b.frame['player']['x'], b.frame['player']['y'], b.frame.get('phase'))
b.key('down')
print('After down 2:', b.frame['player']['x'], b.frame['player']['y'], b.frame.get('phase'))
for l in b.term_text[:6]:
    print('  ', l)
b.key('escape')
print('After escape:', b.frame['player']['x'], b.frame['player']['y'], b.frame.get('phase'))
b.close()
