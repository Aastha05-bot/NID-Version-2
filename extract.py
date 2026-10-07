import json, re, sys

html = open(sys.argv[1] if len(sys.argv) > 1 else 'index.html', encoding='utf8').read()
data = json.loads(re.search(r'<script id="report-data"[^>]*>(.*?)</script>', html, re.S).group(1))

BLOCK = {'p', 'li', 'h2', 'h3', 'h4', 'summary', 'figcaption', 'caption', 'th', 'td'}
BLOCK_CLASSES = {'tl-date', 'tl-title', 'tl-desc', 'attr'}


def is_unit(n):
    return n['tag'] in BLOCK or bool(BLOCK_CLASSES & set(((n.get('attributes') or {}).get('class') or '').split()))


def text(n):
    return n if isinstance(n, str) else ''.join(text(c) for c in n.get('children', []))


def has_block(n):
    return any(not isinstance(c, str) and (is_unit(c) or has_block(c)) for c in n.get('children', []))


units = {}


def walk(n, sec):
    if isinstance(n, str):
        return
    if is_unit(n) and not has_block(n) and text(n).strip():
        units[sec].append({'tag': n['tag'],
                           'cls': (n.get('attributes') or {}).get('class'),
                           'en': text(n).strip()})
        return
    for c in n.get('children', []):
        walk(c, sec)


for s in data['sections']:
    units[s['id']] = []
    for item in s['content']:
        walk(item, s['id'])

json.dump(units, open('en_units.json', 'w', encoding='utf8'), ensure_ascii=False, indent=1)
for k, v in units.items():
    with open(f'en_{k}.txt', 'w', encoding='utf8') as f:
        f.write('\n'.join(f"[{u['tag']}] {u['en']}" for u in v))
    print(k, len(v))
