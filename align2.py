"""Sentence-level alignment of the English web units to the Nepali .doc text.

For each section:
  * PINS     - units that map 1:1 onto a known doc line (headings, box titles, list items...)
  * TRACKS   - groups of remaining units aligned (Gale-Church style) with groups of doc lines
Outputs  ne/<sec>.txt          one line per English unit ('@@TODO@@' = no Nepali in the doc,
                               '@@KEEP@@' = intentionally identical, e.g. bibliography)
         ne/<sec>.report.txt   side-by-side review file with flags
"""
import json, math, re, sys

TODO, KEEP = '@@TODO@@', '@@KEEP@@'
DEV = str.maketrans('०१२३४५६७८९', '0123456789')

en_units = json.load(open('en_units.json', encoding='utf8'))
DOC = open('nepali_full.txt', encoding='utf8').read().replace('﻿', '').split('\n')


# ----------------------------------------------------------------- text helpers
def clean_ne(s, strip_num=False):
    s = s.replace('\t', ' ').replace(' ', ' ')
    s = re.sub(r'^\s*[•●▪◦\-–]\s*', '', s)                    # bullets
    if strip_num:
        s = re.sub(r'^\s*[०-९]+\)\s*', '', s)                  # "१) "
    s = re.sub(r'(?<=[।?!”"’)])\s*\d{1,3}(?=\s|$)', '', s)     # footnote markers after sentence ends
    s = re.sub(r'(?<=[।?!”"’)])(\d{1,3})(?=[\sA-Za-z“"])', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def heading(s):
    """'३ । \tसरकारको कार्यशैली' / '    1 परिचय' -> 'सरकारको कार्यशैली' / 'परिचय'."""
    s = s.replace('\t', ' ')
    s = re.sub(r'^\s*[०-९0-9]+\s*(।)?\s*', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def strip_en_marks(s):
    return re.sub(r'(?<=[.?!”"’)])\d{1,3}(?=\s|$)', '', s)


ABBR = {'sec', 'no', 'dr', 'mr', 'mrs', 'ms', 'vs', 'st', 'art', 'approx', 'fig', 'e.g', 'i.e', 'etc', 'rs', 'pvt', 'ltd', 'inc', 'corp', 'u.s', 'p', 'pp', 'ed', 'eds', 'cf', 'al'}


def en_sents(t):
    t = strip_en_marks(t)
    parts = re.split(r'(?<=[.?!])(?:["”’)\]]?)\s+(?=["“‘(\[]?[A-Z0-9])', t)
    out = []
    for p in parts:
        if out and re.search(r'(?:^|\s|\.)(' + '|'.join(re.escape(a) for a in ABBR) + r')\.$', out[-1].lower()):
            out[-1] += ' ' + p
        else:
            out.append(p)
    return [p for p in out if p.strip()]


def ne_sents(t):
    parts = re.split(r'(?<=[।?!])\s+|(?<=[।?!][”"’])\s+', t)
    return [p for p in parts if p.strip()]


def nums(s):
    return set(re.findall(r'\d{2,}', s.translate(DEV)))


# ------------------------------------------------------------- Gale-Church DP
def norm_cost(l1, l2, c):
    if l1 == 0 and l2 == 0:
        return 0.0
    delta = (l2 - l1 * c) / math.sqrt(max(l1, 8) * 6.8 * c)
    p = math.erfc(abs(delta) / math.sqrt(2))               # two-sided tail
    return -math.log(max(p, 1e-9))


PRIOR = {(1, 1): 0.1, (1, 0): 4.0, (0, 1): 4.0, (2, 1): 2.4, (1, 2): 2.4, (2, 2): 4.5, (3, 1): 5.0, (1, 3): 5.0, (3, 2): 6.0, (2, 3): 6.0}


def gc_align(A, B, c, Abd=None, Bbd=None, bpen=3.0):
    n, m = len(A), len(B)
    INF = float('inf')
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0.0
    la = [len(x) for x in A]
    lb = [len(x) for x in B]
    for i in range(n + 1):
        for j in range(m + 1):
            cur = D[i][j]
            if cur == INF:
                continue
            for (di, dj), pr in PRIOR.items():
                ni, nj = i + di, j + dj
                if ni > n or nj > m:
                    continue
                c1 = sum(la[i:ni])
                c2 = sum(lb[j:nj])
                cost = pr + (norm_cost(c1, c2, c) if (di and dj) else 0.0)
                if di and dj:
                    na, nb = nums(' '.join(A[i:ni])), nums(' '.join(B[j:nj]))
                    if na & nb:
                        cost -= 0.8
                if Abd is not None:
                    eb = (ni == n) or Abd[ni]
                    nb = (nj == m) or Bbd[nj]
                    if eb != nb:
                        cost += bpen
                if cur + cost < D[ni][nj]:
                    D[ni][nj] = cur + cost
                    back[ni][nj] = (i, j)
    beads, i, j = [], n, m
    while (i, j) != (0, 0):
        pi, pj = back[i][j]
        beads.append((pi, i, pj, j))
        i, j = pi, pj
    return beads[::-1]



def pair_cost(en, ne, ratio):
    a, b = len(strip_en_marks(en)), len(ne)
    d = abs(math.log((b + 5) / (ratio * (a + 5))))
    c = d * d * 3
    ne_n, en_n = nums(ne), nums(en)
    if en_n or ne_n:
        j = len(ne_n & en_n) / max(1, len(ne_n | en_n))
        c -= 1.2 * j
        if j == 0 and len(en_n) + len(ne_n) >= 2:
            c += 0.8
    return c


def line_align(en, ne, ratio, skip_en=3.0, skip_ne=2.0):
    """Monotone DP: each English unit <- 0..3 consecutive Nepali lines. Returns list[str|None]."""
    n, m = len(en), len(ne)
    INF = float('inf')
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    B = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            cur = D[i][j]
            if cur == INF:
                continue
            mv = []
            if i < n and j < m:
                mv.append((1, 1, pair_cost(en[i], ne[j], ratio)))
            if i < n:
                mv.append((1, 0, skip_en))
            if j < m:
                mv.append((0, 1, skip_ne))
            for k, pen in ((2, 0.8), (3, 1.8)):
                if i < n and j + k <= m:
                    mv.append((1, k, pair_cost(en[i], ' '.join(ne[j:j + k]), ratio) + pen))
            for di, dj, c in mv:
                if cur + c < D[i + di][j + dj]:
                    D[i + di][j + dj] = cur + c
                    B[i + di][j + dj] = (i, j, di, dj)
    res = [None] * n
    used = set()
    i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, di, dj = B[i][j]
        if di == 1 and dj >= 1:
            res[pi] = ' '.join(ne[pj:pj + dj])
            used.update(range(pj, pj + dj))
        i, j = pi, pj
    return res, used



def sent_align(e_idx, d_lines, en):
    """Sentence-level alignment of a *small* group of units to a few doc lines.
    Returns ({unit: text}, set(units whose boundary falls inside a doc line / is shared))."""
    A, Au, Abd = [], [], []
    for i in e_idx:
        for q, t in enumerate(en_sents(en[i])):
            A.append(t); Au.append(i); Abd.append(q == 0)
    B, Bl, Bbd = [], [], []
    for k in d_lines:
        for q, t in enumerate(ne_sents(clean_ne(DOC[k - 1]))):
            B.append(t); Bl.append(k); Bbd.append(q == 0)
    c = sum(map(len, B)) / max(1, sum(map(len, A)))
    got = {i: [] for i in e_idx}
    span = {i: [] for i in e_idx}           # (first, last) NE sentence index per unit
    shaky = set()
    for (i0, i1, j0, j1) in gc_align(A, B, c, Abd, Bbd):
        ens, nes = A[i0:i1], B[j0:j1]
        if not nes:
            continue
        if not ens:
            tgt = Au[i0 - 1] if i0 > 0 else Au[0]
            got[tgt].append(' '.join(nes)); span[tgt] += list(range(j0, j1)); shaky.add(tgt)
            continue
        units = [Au[k] for k in range(i0, i1)]
        if len(set(units)) == 1:
            got[units[0]].append(' '.join(nes)); span[units[0]] += list(range(j0, j1))
        else:
            for k, t in enumerate(nes):
                u = units[min(len(units) - 1, round(k * (len(units) - 1) / max(1, len(nes) - 1)))] if len(nes) > 1 else units[0]
                got[u].append(t); span[u].append(j0 + k)
            shaky.update(units)
    for i in e_idx:
        if span[i]:
            f, l = min(span[i]), max(span[i])
            ends_line = (l + 1 == len(B)) or Bbd[l + 1]
            if not (Bbd[f] and ends_line):
                shaky.add(i)
    return {i: ' '.join(v) for i, v in got.items() if v}, shaky



def para_align(e_idx, d_lines, en, skip_en=3.0, skip_ne=2.0):
    """Paragraph-aware DP. Moves: 1 unit<-1/2/3 lines, 2/3 units<-1 line (sentence-split), skips.
    Returns ({unit: text}, set(units sharing a doc line))."""
    E = [en[i] for i in e_idx]
    N = [clean_ne(DOC[k - 1]) for k in d_lines]
    n, m = len(E), len(N)
    ratio = sum(map(len, N)) / max(1, sum(len(strip_en_marks(x)) for x in E))
    INF = float('inf')
    D = [[INF] * (m + 1) for _ in range(n + 1)]
    B = [[None] * (m + 1) for _ in range(n + 1)]
    D[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            cur = D[i][j]
            if cur == INF:
                continue
            mv = []
            if i < n and j < m:
                mv.append((1, 1, pair_cost(E[i], N[j], ratio)))
            if i < n:
                mv.append((1, 0, skip_en))
            if j < m:
                mv.append((0, 1, skip_ne))
            for k, pen in ((2, 0.8), (3, 1.8)):
                if i < n and j + k <= m:
                    mv.append((1, k, pair_cost(E[i], ' '.join(N[j:j + k]), ratio) + pen))
                if i + k <= n and j < m:
                    mv.append((k, 1, pair_cost(' '.join(E[i:i + k]), N[j], ratio) + pen + 0.4))
            for di, dj, c in mv:
                if cur + c < D[i + di][j + dj]:
                    D[i + di][j + dj] = cur + c
                    B[i + di][j + dj] = (i, j, di, dj)
    path, i, j = [], n, m
    while (i, j) != (0, 0):
        pi, pj, di, dj = B[i][j]
        path.append((pi, pj, di, dj))
        i, j = pi, pj
    out, shared, used = {}, set(), set()
    for pi, pj, di, dj in path[::-1]:
        if di == 1 and dj >= 1:
            out[e_idx[pi]] = ' '.join(N[pj:pj + dj]); used.update(range(pj, pj + dj))
        elif di >= 2 and dj == 1:
            units = [e_idx[pi + q] for q in range(di)]
            got, _ = sent_align(units, [d_lines[pj]], en)
            for u in units:
                out[u] = got.get(u, TODO)
            shared.update(units); used.add(pj)
    unused = [(d_lines[q], N[q]) for q in range(m) if q not in used]
    return out, shared, unused


# ------------------------------------------------------------------ configuration
def L(n, **kw):
    return ('line', n, kw)


def T(s):
    return ('text', s)


def lines_of(ranges):
    out = []
    for a, b in ranges:
        out += [k for k in range(a, b + 1) if DOC[k - 1].strip()]
    return out


CHAPTER = {'ch1': 'अध्याय १', 'ch2': 'अध्याय २', 'ch3': 'अध्याय ३', 'ch4': 'अध्याय ४', 'ch5': 'अध्याय ५', 'moving-forward': 'अध्याय ६'}

CFG = {}

CFG['exec-summary'] = dict(
    pins={0: L(110, head=True), 1: T('कार्यकारी सारांश र मुख्य अनुसन्धान प्रश्नहरू'),
          4: ('pref', 113, 'प्रश्न ०१ — '), 5: TODO,
          6: ('pref', 114, 'प्रश्न ०२ — '), 7: TODO,
          8: ('pref', 115, 'प्रश्न ०३ — '), 9: TODO},
    tracks=[((2, 19), [(111, 124)])])

CFG['ch1'] = dict(
    pins={0: T(CHAPTER['ch1']), 1: L(125, head=True), 5: ('before', 129, 'नेपालको अन्तरिम संविधानमा मौलिक हक'), 6: ('join', [('after', 129, 'नेपालको अन्तरिम संविधानमा मौलिक हक'), L(130)]), 16: L(141), 22: L(148)},
    tracks=[((2, 37), [(126, 164)])])

pins2 = {0: T(CHAPTER['ch2']), 1: L(165, head=True), 3: TODO, 12: L(171),
         13: T('वेबसाइट: https://donidcr.gov.np/Home/NationalIDDetails'),
         17: L(176), 24: L(184), 25: L(185), 30: L(190), 31: L(191), 32: L(192), 33: L(193),
         34: L(194), 35: L(195), 36: L(196), 37: L(197), 38: L(199), 39: L(200), 40: L(201), 41: L(202),
         48: L(211), 49: L(212), 50: L(213), 61: L(224), 113: L(252), 123: TODO,
         51: ('before', 214, 'नागरिक दर्ता एवं व्यक्तिगत घटनाहरूको'), 52: ('after', 214, 'नागरिक दर्ता एवं व्यक्तिगत घटनाहरूको'), 53: L(215), 54: L(216), 55: L(217), 56: L(218), 57: L(219), 58: L(220), 59: L(221), 60: L(222),
         110: L(248), 111: L(249), 112: L(250), 114: L(253), 115: L(254), 116: L(255),
         117: ('before', 256, 'सरकारले डिजिटाइजेसन परियोजना पारदर्शी'), 118: ('after', 256, 'सरकारले डिजिटाइजेसन परियोजना पारदर्शी'),
         119: L(257), 120: L(258), 121: L(260), 122: L(259)}
for k, ln in zip(range(18, 21), range(177, 180)): pins2[k] = L(ln)
for k, ln in zip(range(26, 30), range(186, 190)): pins2[k] = L(ln)
for k, ln in zip(range(42, 48), range(203, 209)): pins2[k] = L(ln)
for k in range(16):                                            # timeline: date | title(web only) | desc
    pins2[62 + 3 * k] = ('tl', 225 + k, 0)
    pins2[63 + 3 * k] = TODO
    pins2[64 + 3 * k] = ('tl', 225 + k, 1)
CFG['ch2'] = dict(
    pins=pins2,
    tracks=[((2, 12), [(166, 169), (243, 247)]),
            ((14, 17), [(172, 174)]),
            ((21, 24), [(180, 182)]),
            ])

CFG['ch3'] = dict(
    pins={0: T(CHAPTER['ch3']), 1: L(263, head=True), 25: L(277), 26: L(278), 32: L(299), 38: L(301), 42: L(307), 52: L(315),
          27: L(279), 28: L(280), 29: L(281), 30: L(282), 31: L(283)},
    tracks=[((2, 25), [(264, 276), (285, 297)]),
            ((33, 38), [(300, 300), (306, 306)]),
            ((39, 42), [(302, 304)]),
            ((43, 52), [(308, 313)]),
            ((53, 58), [(316, 320)])])

pins4 = {0: T(CHAPTER['ch4']), 1: L(321, head=True), 2: L(322), 9: L(326), 18: L(336), 22: L(343), 30: L(351), 40: L(359), 48: L(370), 52: L(378)}
for k, ln in zip(range(41, 44), range(360, 363)): pins4[k] = L(ln)
for k, ln in zip(range(49, 52), range(371, 374)): pins4[k] = L(ln)
CFG['ch4'] = dict(
    pins=pins4,
    tracks=[((3, 9), [(323, 325), (333, 334)]),
            ((10, 18), [(327, 331)]),
            ((19, 22), [(337, 341)]),
            ((23, 30), [(344, 349)]),
            ((31, 38), [(352, 358), (365, 365)]),
            ((38, 40), [(366, 367)]),
            ((44, 48), [(368, 369), (375, 376)]),
            ((53, 61), [(379, 386)])])

CFG['ch5'] = dict(
    pins={0: T(CHAPTER['ch5']), 1: L(387, head=True), 6: L(392), 13: L(400), 18: L(407), 22: L(412), 30: L(437), 36: L(443)},
    tracks=[((2, 6), [(388, 391)]),
            ((7, 13), [(393, 397)]),
            ((14, 18), [(401, 404)]),
            ((19, 22), [(408, 410)]),
            ((23, 30), [(413, 418)]),
            ((31, 36), [(438, 441)]),
            ((37, 44), [(444, 450)])])

pinsm = {0: T(CHAPTER['moving-forward']), 1: L(451, head=True), 6: L(421), 10: L(424), 15: L(430), 21: L(456), 34: L(470), 40: L(476)}
for k, ln in zip(range(11, 15), range(425, 429)): pinsm[k] = L(ln)
for k, ln in zip(range(16, 21), range(431, 436)): pinsm[k] = L(ln)
for k, ln in zip(range(24, 34), range(459, 469)): pinsm[k] = L(ln, strip_num=True)
for k, ln in zip(range(37, 40), range(472, 475)): pinsm[k] = L(ln, strip_num=True)
for k, ln in zip(range(43, 48), range(479, 484)): pinsm[k] = L(ln, strip_num=True)
CFG['moving-forward'] = dict(
    pins=pinsm,
    tracks=[((2, 6), [(452, 454)]),
            ((7, 10), [(422, 423)]),
            ((22, 24), [(457, 458)]),
            ((35, 37), [(471, 471)]),
            ((41, 43), [(477, 478)])])

pinsr = {0: T('अन्तिम सामग्री'), 1: L(485), 2: TODO, 3: T('पूर्ण सन्दर्भ सूची')}
for k in range(4, 41): pinsr[k] = KEEP
CFG['references'] = dict(pins=pinsr, tracks=[])


# ------------------------------------------------------------------- engine
def resolve_pin(spec):
    """returns (text, kind, doc_lines_used)."""
    if spec in (TODO, KEEP):
        return spec, 'pin', []
    kind = spec[0]
    if kind == 'text':
        return spec[1], 'draft', []
    if kind == 'line':
        n, kw = spec[1], spec[2]
        raw = DOC[n - 1]
        txt = heading(raw) if kw.get('head') else clean_ne(raw, strip_num=kw.get('strip_num', False))
        return txt, 'pin', [n]
    if kind == 'pref':
        raw = re.sub(r'^\s*[क-ग]\)\s*', '', DOC[spec[1] - 1].replace('\t', ' '))
        return spec[2] + clean_ne(raw), 'pin', [spec[1]]
    if kind in ('before', 'after'):
        n, marker = spec[1], spec[2]
        full = clean_ne(DOC[n - 1])
        k = full.index(marker)
        return (full[:k] if kind == 'before' else full[k:]).strip(), 'pin', [n]
    if kind == 'join':
        parts = [resolve_pin(p) for p in spec[1]]
        return ' '.join(p[0] for p in parts), 'pin', [x for p in parts for x in p[2]]
    if kind == 'tl':
        parts = re.split(r'\s*[–—]\s*', clean_ne(DOC[spec[1] - 1]), maxsplit=1)
        return (parts[spec[2]] if len(parts) > spec[2] else TODO), 'pin', [spec[1]]
    raise ValueError(spec)


def run(sec):
    en = [u['en'] for u in en_units[sec]]
    tags = [u['tag'] for u in en_units[sec]]
    cfg = CFG[sec]
    out = [None] * len(en)
    info = [''] * len(en)
    used_lines = set()
    unused = []
    for idx, spec in cfg['pins'].items():
        txt, kind, used = resolve_pin(spec)
        out[idx] = txt
        info[idx] = {'draft': 'DRAFT (written by Claude, not in doc)'}.get(kind, '')
        used_lines.update(used)

    for tr in cfg['tracks']:
        (a, b), ranges = tr[0], tr[1]
        mode = tr[2] if len(tr) > 2 else 'line'
        e_idx = [i for i in range(a, min(b, len(en))) if i not in cfg['pins']]
        d_lines = [k for k in lines_of(ranges) if k not in used_lines]
        if not e_idx or not d_lines:
            continue
        if mode == 'sent':
            got, shaky = sent_align(e_idx, d_lines, en)
            used_lines.update(d_lines)
            for i in e_idx:
                out[i] = got.get(i, TODO)
                if i in shaky:
                    info[i] = 'REVIEW: paragraph boundary falls inside a doc line (guess)'
            continue
        got, shared, un = para_align(e_idx, d_lines, en)
        for i in e_idx:
            out[i] = got.get(i, TODO)
            if i in shared:
                info[i] = 'REVIEW: shares a doc line with a neighbouring unit (sentence split is a guess)'
            elif got.get(i) and len(got[i]) > 1.9 * len(strip_en_marks(en[i])) + 40:
                info[i] = 'REVIEW: doc text much longer than English (merged paragraphs?)'
        unused += un

    for i in range(len(en)):
        if out[i] is None:
            out[i] = TODO
            info[i] = 'not covered by any track'
        elif out[i] not in (TODO, KEEP):
            ra = len(out[i]) / max(1, len(strip_en_marks(en[i])))
            if tags[i] not in ('h2', 'h3', 'h4', 'summary', 'li', 'figcaption') and not info[i] and (ra > 1.8 or ra < 0.55):
                info[i] = f'REVIEW: length ratio {ra:.2f}'
            elif tags[i] in ('p',) and not info[i] and len(en[i]) > 120 and (ra > 1.6 or ra < 0.65):
                info[i] = f'REVIEW: length ratio {ra:.2f}'

    open(f'ne/{sec}.txt', 'w', encoding='utf8').write('\n'.join(x.replace('\n', ' ') for x in out) + '\n')
    rep = [f'### {sec}: {len(en)} units']
    for i in range(len(en)):
        flag = f'   <-- {info[i]}' if info[i] else ''
        rep.append(f'{i:3d} [{tags[i]}]{flag}\n    EN: {en[i][:130]}\n    NE: {out[i][:130]}')
    for k, t in unused:
        rep.append(f'UNUSED DOC LINE {k}: {t[:130]}')
    open(f'ne/{sec}.report.txt', 'w', encoding='utf8').write('\n'.join(rep) + '\n')
    todo = sum(1 for x in out if x == TODO)
    keep = sum(1 for x in out if x == KEEP)
    rev = sum(1 for x in info if x.startswith('REVIEW'))
    draft = sum(1 for x in info if x.startswith('DRAFT'))
    print(f'{sec:15s} unused_doc_lines={len(unused):2d}  units={len(en):3d}  matched={len(en)-todo-keep:3d}  todo={todo:2d}  keep={keep:2d}  draft={draft:2d}  review={rev:2d}')


if __name__ == '__main__':
    for s in (sys.argv[1:] or CFG):
        run(s)
