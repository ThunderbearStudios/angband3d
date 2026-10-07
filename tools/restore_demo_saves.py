import os
import shutil

src_dir = 'tools/demo_saves_backup'
dst_dirs = [
    'engine/lib/user/save',
    'engine/lib/save',
    'engine/build/game/lib/user/save',
    'engine/build/game/lib/save'
]

for item in os.listdir(src_dir):
    src_file = os.path.join(src_dir, item)
    if os.path.isfile(src_file):
        for dst_dir in dst_dirs:
            if os.path.exists(dst_dir):
                shutil.copy2(src_file, os.path.join(dst_dir, item))
                if not item.endswith('.sav'):
                    shutil.copy2(src_file, os.path.join(dst_dir, item + '.sav'))

print("Golden demo saves restored successfully from backup!")
