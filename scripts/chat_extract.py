#!/usr/bin/env python3
"""Extract SAFE, game-ready data from the group-chat export.
Usage: python3 scripts/chat_extract.py chat_raw/_chat.txt  -> writes test/chat_candidates.json (for manual review)
The raw chat never leaves chat_raw/ (gitignored). assets/chat/*.json are hand-reviewed outputs.
"""
import re, sys, json, collections, random
src = sys.argv[1] if len(sys.argv) > 1 else 'chat_raw/_chat.txt'
pat = re.compile(r'^‎?\[(\d{1,2})/(\d{1,2})/(\d{2,4}), (\d{1,2}):(\d{2})(?::\d{2})?\] ([^:]+): (.*)$')
msgs = []; cur = None
for l in open(src, encoding='utf-8', errors='ignore').read().splitlines():
    m = pat.match(l)
    if m:
        cur = {'d': m.group(1), 'mo': m.group(2), 'y': m.group(3), 'h': int(m.group(4)), 'who': m.group(6).strip('‎ '), 't': m.group(7)}
        msgs.append(cur)
    elif cur: cur['t'] += '\n' + l
NAMES = {'Asche': 'asche', 'Ashish': 'ashish', 'Forla': 'forla', 'Seghino': 'seghino', 'Ciccio': 'ciccio', 'Zuck': 'zuck', 'Parme': 'parme',
         'Lombu': 'lombu', 'Cesco (Ma Chi É?)': 'cesco', 'ricky catta': 'ricky', 'Jacopo': 'jacopo', 'Mirco Lo Smilzo': 'mirco'}
# privacy / taste filters
BAD = re.compile(r"(https?://|www\.|@|\+39|\d{5,}|codice|password|iban|euro|€|\$|soldi|stipend|pagat|debit|malat|ospedal|medic|farmac|febbre|covid|tampon|"
                 r"sess|scop|tett|cul|caz|pene|fig[aoh]|tro[i]a|puttan|porn|nud|vergin|limon|bacio|fidanzat|ragazza|ex |"
                 r"dio|madonna|cristo|gesù|gesu|porc|ostia|"
                 r"gay|fro[ck]|negr|ritard|mongol|handicap|down|autist|zingar|terron|ebre|nazi|stupr|uccid|ammazz|suicid|morte|morto|muor|"
                 r"bambin|minorenn|scuola|liceo|droga|cann[ae]|erba|fumo|ubriac|vomit|merd|stronz|coglion|minchi|vaffan|fanculo|bastard|"
                 r"omess|eliminat|non incluso|modificato|sticker|immagine|video|audio|gif|documento|posizione|contatto|chiamata|sondaggio|"
                 r"via |viale|piazza |indirizz|casa di|abito|numero|telefon|mail|instagram|tiktok|meta ai|politic|russ|rizzoli)", re.I)
def clean(t):
    t = t.replace('‎', '').replace(' ', ' ').strip()
    return re.sub(r'\s+', ' ', t)
stats = {}
cands = collections.defaultdict(list)
for m in msgs:
    who = NAMES.get(m['who']);
    if not who: continue
    t = clean(m['t'])
    s = stats.setdefault(who, {'n': 0, 'chars': 0, 'lower': 0, 'laughs': collections.Counter(), 'short': collections.Counter(), 'hours': collections.Counter(), 'emoji': collections.Counter()})
    s['n'] += 1; s['chars'] += len(t); s['hours'][m['h']] += 1
    if t and t == t.lower(): s['lower'] += 1
    for lg in re.findall(r'\b(?:a?h[ah]{3,}|lmao+|ahah\w*|hahah\w*|ahha\w*)\b', t.lower()): s['laughs'][re.sub(r'(.)\1{2,}', r'\1\1', lg)[:8]] += 1
    for e in re.findall(r'[\U0001F300-\U0001FAFF☀-➿]', t): s['emoji'][e] += 1
    if 3 <= len(t) <= 40 and not BAD.search(t) and '\n' not in t: s['short'][t.lower().strip('!?.')] += 1
    if 12 <= len(t) <= 110 and not BAD.search(t) and '\n' not in t and len(re.findall(r'[a-zA-Zàèéìòù]', t)) > 8:
        cands[who].append(t)
out = {'stats': {}, 'cands': {}}
for who, s in stats.items():
    out['stats'][who] = {'n': s['n'], 'avg': round(s['chars'] / max(1, s['n']), 1), 'lowerRatio': round(s['lower'] / max(1, s['n']), 2),
                         'laughs': s['laughs'].most_common(5), 'emoji': s['emoji'].most_common(6), 'topShort': s['short'].most_common(40),
                         'peakHours': [h for h, _ in s['hours'].most_common(3)]}
    random.seed(7); c = list(dict.fromkeys(cands[who])); random.shuffle(c)
    out['cands'][who] = c[:120]
json.dump(out, open('test/chat_candidates.json', 'w'), ensure_ascii=False, indent=1)
print({w: (v['n'], v['avg'], v['lowerRatio']) for w, v in out['stats'].items()})
