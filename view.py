import json, sys
sec = sys.argv[1]; a = int(sys.argv[2]) if len(sys.argv) > 2 else 0; b = int(sys.argv[3]) if len(sys.argv) > 3 else 10**6
en = json.load(open('en_units.json', encoding='utf8'))[sec]
ne = open(f'ne/{sec}.txt', encoding='utf8').read().split('\n')
for i, u in enumerate(en):
    if a <= i < b:
        print(f"{i:3d} {u['tag'][:3]:3s} {u['en'][:48]!r:52s} || {ne[i][:52]}  ({len(u['en'])}/{len(ne[i])})")
