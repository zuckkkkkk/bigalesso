#!/usr/bin/env python3
"""Extract SAFE, game-ready quotes from the group-chat export (v6.2: parolacce ammesse).
Usage: python3 scripts/chat_extract.py chat_raw/_chat.txt [--write]
  -> test/chat_candidates.json (stats + candidates, for review)
  -> with --write also rewrites assets/chat/quotes.json (~300 quotes, mixed: banter with swearing + normal lines)
The raw chat never leaves chat_raw/ (gitignored); only short filtered one-liners end up in assets/chat/quotes.json.

Kept: friendly swearing and banter (cazzo, minchia, merda, coglione, stronzo, vaffanculo, figa, che palle, soccmel...).
Dropped, always: slurs (homophobic, racist, ableist, misogynist insults), blasphemy, sex lives / sexual content,
health, politics, religion, money, drugs/alcohol abuse, violence/death, minors/school, addresses and any PII,
links/mentions/media placeholders, and lines naming people outside the group.
"""
import re, sys, json, collections, random, os, hashlib
args = [a for a in sys.argv[1:] if not a.startswith('--')]
src = args[0] if args else 'chat_raw/_chat.txt'
WRITE = '--write' in sys.argv
pat = re.compile(r'^‎?\[(\d{1,2})/(\d{1,2})/(\d{2,4}), (\d{1,2}):(\d{2})(?::\d{2})?\] ([^:]+): (.*)$')
msgs = []; cur = None
for l in open(src, encoding='utf-8', errors='ignore').read().splitlines():
    m = pat.match(l)
    if m:
        cur = {'h': int(m.group(4)), 'who': m.group(6).strip('‎ '), 't': m.group(7)}
        msgs.append(cur)
    elif cur: cur['t'] += '\n' + l
NAMES = {'Asche': 'asche', 'Ashish': 'ashish', 'Forla': 'forla', 'Seghino': 'seghino', 'Ciccio': 'ciccio', 'Zuck': 'zuck', 'Parme': 'parme',
         'Lombu': 'lombu', 'Cesco (Ma Chi É?)': 'cesco', 'ricky catta': 'ricky', 'Jacopo': 'jacopo', 'Mirco Lo Smilzo': 'mirco'}

# --- hard filters (never relaxed) ---------------------------------------------------------------------------------
PII = re.compile(r"(https?://|www\.|@|\+39|\d{4,}|codice|password|iban|indirizz|via |viale|piazza |numero|telefon|cell|mail|instagram|tiktok|"
                 r"facebook|linkedin|rizzoli|casa di|abito a|cap )", re.I)
MEDIA = re.compile(r"(omess|eliminat|non incluso|modificato|sticker|immagine|video|audio|gif|documento|posizione|contatto|chiamata|sondaggio|"
                   r"messaggio|meta ai|<|>)", re.I)
SLUR = re.compile(r"(gay|fro[ck]i|frocio|finocch|ricchion|culattone|lesbic|trans\b|negr|ritard|mongol|handicap|spastic|down\b|autist|"
                  r"zingar|terron|polenton|ebre|nazi|fasci|zoccol|puttan|bagascia|mignott|\btroi[ae]\b(?<!porca troia)|cagna|"
                  r"cesso\b|grass[oa]ne|ciccion|nan[oe]\b|cicciobomb)", re.I)
BLASPH = re.compile(r"(\bdio\b|\bdiocan|\bdio\w*can|porcodio|porco ?d|madonn|cristo|ges[uù]|\bostia|santo|santi\b|\bpapa\b|chiesa|prete|"
                     r"bestemm|\bdi[oa]\b|\bporco\b|\bporca (madonna|eva|vacca)|dio\w+)", re.I)
SEX = re.compile(r"(sess|scop|tett|pene|cazzo (in|nel|duro)|pompin|segh(e|ina)\b|sega\b|masturb|porn|nud[oai]|vergin|limon|bacio|baci|"
                 r"fidanzat|ragazza|morosa|moros|tipa|tipe|\bex\b|figa (di|della)|fighe|culo (di|della)|letto|preservativ|orgasm|eccit|arrapat|"
                 r"sborr|godere con|sedere|chiappe|mutand|reggiseno|incint|gravid)", re.I)
SENSITIVE = re.compile(r"(malat|ospedal|medic|farmac|febbre|covid|tampon|vaccin|psico|depress|ansia|terapia|cancro|tumor|morto|morte|muor|"
                       r"suicid|uccid|ammazz|stupr|botte|picchi|sangue|funeral|politic|governo|elezion|meloni|salvini|renzi|draghi|putin|"
                       r"russ|ucrain|israel|palestin|guerra|religion|islam|musulman|droga|cann[ae]\b|erba|fumo|coca|ubriac|vomit|sbronz|"
                       r"bambin|minorenn|scuola|liceo|prof\b|euro|€|\$|soldi|stipend|pagat|debit|bollett|affitto|polizia|carabin|denunc|"
                       r"multa|lavoro di|capo mio|licenzi)", re.I)
# people outside the group: a capitalised word that is not the first word and not a known nick/place/game
KNOWN = set(w.lower() for w in '''Asche Asci Ashish Forla Seghino Ciccio Zuck Parme Lombu Cesco Ricky Jacopo Mirco Smilzo Bigalesso Teletubbylandia
Teletubby Celtic Millennium Petroni Bologna Discord Discors Warzone Wz CS CS2 Overwatch Valorant Fortnite Minecraft Steam Bellazzi Corriere Torri
Gulag Tortellino Cappelletti Man Polleg Sushi Zombata Compe Compettina Raga Ragazzi Signori Rega Daje Dai Soccia Ok Oke Lol Bro Bruh GG Gg
Yes No Si Sì Nope Nice Vamos Godo Palese Greve Eccerto Rip Ez Pls Bot Claude Chat GPT ChatGPT Apex PUBG LoL League Rocket Lega Serie Natale
Pasqua Capodanno Lunedì Martedì Mercoledì Giovedì Venerdì Sabato Domenica Io Tu Noi Voi Ma Che Chi Ah Oh Eh Mo Boh Ahah Ahahah AHAH Lmao'''.split())
def third_party(t):
    toks = re.findall(r"[A-Za-zÀ-ÿ']+", t)
    for i, w in enumerate(toks):
        if i == 0: continue
        if w[0].isupper() and not w.isupper() and w.lower() not in KNOWN: return True
    return False
SWEAR = re.compile(r"\b(cazz\w*|minchi\w*|vaffan\w*|fanculo|stronz\w*|coglion\w*|che palle|sti cazzi|porca troia|porca miseria|figa|fig[ao]t\w*|"
                   r"merd\w*|culo|soccmel|socmel|sucmel|burd[eè]l\w*|incazz\w*|bastard\w*|scemo|deficient\w*|rompi\w*|cagare|cagat\w*)\b", re.I)
def clean(t):
    t = re.sub(r'[\u2066-\u2069\u200e\u200f]', '', t.replace('‎', '').replace(' ', ' ')).strip()
    return re.sub(r'\s+', ' ', t)
# extra taste rules for the sweary set (reviewed by hand on the v6.2 extraction)
BLASPH2 = re.compile(r"(zioc|zio ?can|dioc|d[i1]o ?(can|porc|best)|porc[oa] ?(d|m|ge))", re.I)
FAMILY_ETC = re.compile(r"\b(madre|padre|mamma|pap[àa]|nonn\w*|zi[oa]\b|fratell\w*|sorell\w*|cugin\w*|i miei|ai miei|mattia|fede|luca|sigarra|bianco|hr|capo|collega|cliente\w*|"
                        r"alcool|alcol|bere|bevi\w*|sbronz\w*|ciucc\w*|calat\w*|calarsi|pasticc\w*|kg|chili|grosso|grass[oa]|pacca|ti rovino|menare|"
                        r"revolut|saldo|carta|giapponesin\w*|cinesin\w*|marocchin\w*|albanes\w*|rumen\w*|raffreddat\w*|negativo|positivo)\b", re.I)
AREA = re.compile(r"\b0\d{2,3}\b")
CULO_OK = re.compile(r"(per il culo|in culo|che culo|col culo|il culo\b)", re.I)
CULO_BAD = re.compile(r"((male|toccare|guardare|visto|vedere|un) (il |un )?culo|culo (piccolo|grosso|di|della)|da culo)", re.I)
CAZZO_SEX = re.compile(r"(cazzo (di )?fuori|il cazzo\?|meglio il cazzo|cazzo (in|nel|duro)|il cazzo fuori)", re.I)
MORE = re.compile(r"(puppa|lavar\w* il (culo|cazzo)|lava il culo|foto del cazzo|mandare il cazzo|fosse il cazzo|appoggio solo la minchia|"
                  r"app di incontri|trisom|threesom|da dietro|solo donne|cassero|lazzaret|stampell|sbocc|quarantena|influenz|incident|"
                  r"sigaretta corretta|acidi|dorme con i pesci|bombe|non sanno l.italiano|stati uniti|forlani|casadielgo|dipendenti|"
                  r"ci ha presentato|vestit[oa] (da|cos)|signorin|succhia|trombat|amiche|devasto|le rompi|bitch|per la faccia|cod+ ?dio|quella è|hentai|"
                  r"stai bevendo|sto bevendo|piace il cazzo|quella in ufficio|aids|assunto|weed|trav|bocchin|anche altre)", re.I)
DROP_EXACT = {"compagno borsch super figo", "ragno in culo", "vibrata di culo n2", "e poi compagno borsch super figo"}
def figa_ok(t):  # "figa" only as the Bolognese interjection at the start of a line ("Figa, ..."), never about women
    return not re.search(r"\bfig(a|he)\b", t, re.I) or re.match(r"^\W*figa\b", t, re.I)
def ok(t):
    if PII.search(t) or MEDIA.search(t) or SLUR.search(t) or BLASPH.search(t) or SEX.search(t) or SENSITIVE.search(t) or third_party(t): return False
    if BLASPH2.search(t) or FAMILY_ETC.search(t) or AREA.search(t) or CAZZO_SEX.search(t) or not figa_ok(t): return False
    if re.search(r"\bculo\b", t, re.I) and (CULO_BAD.search(t) or not CULO_OK.search(t)): return False
    if MORE.search(t) or t.lower().strip(' .!?') in DROP_EXACT: return False
    return True

stats = {}; cands = collections.defaultdict(list)
for m in msgs:
    who = NAMES.get(m['who'])
    if not who: continue
    t = clean(m['t'])
    s = stats.setdefault(who, {'n': 0, 'chars': 0, 'sw': 0})
    s['n'] += 1; s['chars'] += len(t)
    if SWEAR.search(t): s['sw'] += 1
    if '\n' in m['t'].strip() or not (8 <= len(t) <= 100) or len(re.findall(r'[a-zA-Zàèéìòù]', t)) < 6: continue
    if ok(t): cands[who].append(t)

random.seed(62)
out = {'stats': {w: {'n': s['n'], 'avg': round(s['chars'] / max(1, s['n']), 1), 'swearRatio': round(s['sw'] / max(1, s['n']), 3)} for w, s in stats.items()}, 'cands': {}}
quotes = []
CAP = {'asche': 40, 'parme': 36, 'ashish': 34, 'seghino': 32, 'zuck': 30, 'lombu': 30, 'ciccio': 30, 'forla': 28, 'cesco': 18, 'ricky': 16, 'jacopo': 12, 'mirco': 12}
for who, lst in cands.items():
    uniq = list(dict.fromkeys(lst))
    sw = [t for t in uniq if SWEAR.search(t)]; rest = [t for t in uniq if not SWEAR.search(t)]
    key = lambda t: hashlib.md5(t.encode()).hexdigest()  # stable order: dropping a line only pulls in the next one
    sw.sort(key=key); rest.sort(key=key)
    cap = CAP.get(who, 12); n_sw = min(len(sw), int(cap * 0.6))
    pick = sw[:n_sw] + rest[:cap - n_sw]
    out['cands'][who] = pick
    quotes += [{'who': who, 'text': t} for t in pick]
os.makedirs('test', exist_ok=True)
json.dump(out, open('test/chat_candidates.json', 'w'), ensure_ascii=False, indent=1)
if WRITE:
    random.shuffle(quotes)
    json.dump(quotes, open('assets/chat/quotes.json', 'w'), ensure_ascii=False, indent=0)
print(len(quotes), 'quotes', {w: (v['n'], v['swearRatio']) for w, v in out['stats'].items()})
