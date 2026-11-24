# BIGALESSO GAMES – cabinato arcade 3D

Scena 3D realistica in **Three.js** con il cabinato *BIGALESSO GAMES* ricostruito dalla foto, un uomo che entra,
si avvicina e gioca, il barboncino che lo guarda, e uno **sparatutto pixel-art** completamente giocabile sullo schermo CRT.

## Cosa c'è
- **Intro cinematica** (saltabile): stanza al buio, marquee che sfarfalla, CRT che si accende, luci, camminata fino al cabinato.
- **Il gioco** (320×240, sullo schermo del cabinato con shader CRT): 3 stage (Roma, Via Appia, Apocalisse), boss, power-up, mega bomba, record salvato nel browser.
- **Ambiente vivo**: insegna al neon "BIGALESSO GAMES" sul muro, orologio con l'ora reale, polvere nel fascio di luce, CRT con banda di refresh e alone, marquee con ronzio del neon, gettoniera che pulsa, modalità notte.
- **Effetti 3D** (`src/fx3d.js`): coriandoli, cuori, nuvola dell'estintore, scintille, gettone che vola nella fessura, lampi di luce colorata dallo schermo.
- Comandi tastiera, gamepad e touch.

### v7: sparatutto, loot, RPG e calcetto nel mondo aperto
- **Combattimento** (`src/combat/`): prima/terza persona (V), armi comiche (pistola ad acqua, lanciatortellini, nerf,
  spritz-bazooka, ombrello), zombie, piccioni mutanti e il boss "Vigile Urbano Zombie" in Via Petroni. Niente sangue.
- **Loot e RPG** (`src/rpg/`): rarità da comune a leggendario, casse nel quartiere, Euro e munizioni, Zaino (I),
  livelli 1–50 con punti e perk (Teppista, Cuoco, Festaiolo), missioni dagli amici (opzione 6 nel dialogo, app Missioni
  sul telefono, J), Banco dei pegni.
- **Calcetto** (`src/sport/`): gabbia a Teletubbylandia, partita 3 contro 3 con gli amici, rigori e tiri liberi.
- **Prestazioni**: tutto si carica e si prepara prima dell'intro; shader precompilati con numero di luci costante
  (`src/lightpad.js`: niente ricompilazioni quando si accendono lampioni o si fa notte); F3 contatore FPS, F4 copia il
  report degli scatti.

| Gioco libero | Tasti |
|---|---|
| Arma fuori / dentro | H (0 rinfodera) |
| Visuale prima/terza persona | V |
| Spara / mira | Clic sinistro / destro |
| Cambia arma / ricarica | 1–4 o rotella / R |
| Zaino / missioni | I / J |
| Calcetto: tiro (tieni premuto) / pallonetto / passaggio | E o clic / R / Q |
| FPS / report scatti | F3 / F4 |

## Comandi del cabinato
| Azione | Tasti |
|---|---|
| Muovi | Frecce / WASD |
| Spara | Z / Spazio / J |
| Mega bomba | X / K |
| Start | Invio |
| Pausa | P |
| Camera | C |
| Audio | M |

## Avvio in locale
Serve **Node.js 18+**.
```bash
npm install
npm run dev          # http://localhost:5173 con ricarica automatica
```
Per provare la build di produzione:
```bash
npm run build        # crea dist/
npm run preview      # http://localhost:4173
```
**Senza server:** `npm run build:single` crea `dist/BIGALESSO-gioca.html`, un unico file con dentro tutto
(codice, modello, texture): si apre con doppio clic. Aprire `dist/index.html` con doppio clic invece **non funziona**
(il browser blocca texture e modello da `file://`).

## Script
| Script | Risultato |
|---|---|
| `npm run dev` | server di sviluppo con watch e live reload (cartella `.dev/`) |
| `npm run build` | `dist/` pronta per qualsiasi hosting statico (`index.html`, `app.js`, `man.glb`, texture) |
| `npm run build:prod` | come `build` + file `.br`/`.gz` già compressi (per Docker e il server Node) |
| `npm run build:single` | come `build` + `dist/BIGALESSO-gioca.html` tutto-in-uno |
| `npm run build:artifact` | `build-artifact/` con il modello in base64 (`man.txt`) per host che non servono `.glb` |
| `npm run preview` | serve `dist/` in locale |
| `npm run server` | server multiplayer (statici di `dist/` + WebSocket `/ws`) sulla porta `PORT` (default 8080) |
| `npm start` | `build` + `server` |
| `npm run docker` | `docker compose up --build` |
| `npm run docker:prebuilt` | `build:prod` e immagine leggera da `Dockerfile.prebuilt` |
| `npm run desktop` / `desktop:dist` | app desktop Electron / installer (`desktop/release`) |

Cartella di output personalizzata: `OUT=cartella npm run build`.

## Deploy
Il sito è statico: basta pubblicare la cartella `dist/`. Tutti i percorsi sono relativi, quindi funziona anche in una sottocartella.

### Netlify
1. Carica il progetto su GitHub (o GitLab/Bitbucket).
2. Su Netlify: *Add new site → Import an existing project* e scegli il repository.
3. Build command e cartella sono già in `netlify.toml` (`npm ci && npm run build`, publish `dist`): conferma e *Deploy*.
4. In alternativa, senza Git: `npm run build` e trascina la cartella `dist/` su https://app.netlify.com/drop

### Vercel
1. Su Vercel: *Add New → Project* e importa il repository.
2. Le impostazioni sono in `vercel.json` (build `npm run build`, output `dist`): *Deploy*.
3. Da terminale: `npx vercel --prod`.

### GitHub Pages
1. Carica il progetto in un repository GitHub, branch `main`.
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. Ogni push su `main` esegue `.github/workflows/deploy.yml` (build + pubblicazione). Il sito sarà su
   `https://<utente>.github.io/<repository>/`.

### Qualsiasi altro hosting (Apache, Nginx, S3, Cloudflare Pages…)
`npm run build` e carica il contenuto di `dist/`. Se il server non conosce il tipo `.glb`, aggiungi
`model/gltf-binary` (oppure usa `npm run build:artifact`, che non usa file `.glb`).

## Multiplayer online con Docker
Il gioco online passa da un piccolo server Node (`server/server.mjs`, libreria `ws`, niente database) che serve anche il sito.

**Avvio con Docker** (consigliato):
```
docker compose up -d --build
```
Ci sono due Dockerfile:

| File | Quando usarlo | Build sul server | RAM a runtime |
|---|---|---|---|
| `Dockerfile` | il server compila tutto da solo (Easypanel, VPS) | sì (~1 min, ~400 MB di picco) | ~60 MB a riposo, ~100 MB sotto carico |
| `Dockerfile.prebuilt` | server con poca RAM: compili sul tuo PC (`npm run build:prod`) e il server copia solo `dist/` | no | uguale |

Entrambi servono i file già compressi (`.br`/`.gz` creati da `npm run build:prod`), con cache lunga su `app.js?v=…`
e `ETag` sul resto: il server non comprime niente al volo e non tiene file in memoria. Node parte con
`--max-old-space-size=96` e `docker-compose.yml` mette un tetto di 192 MB (`mem_limit`).
Apri `http://localhost:8080` (o `http://IP-del-server:8080`). Porta diversa: `PORT=3000 docker compose up -d --build`.
Stato del server: `http://localhost:8080/healthz`.

**Senza Docker:** `npm install && npm start` (oppure `npm run build` e poi `PORT=8080 npm run server`).

**Come si gioca online**
1. Menu → *Online* (o il pulsante Online): scegli il nome e premi **Crea stanza**: ti viene dato un codice di 4 lettere.
2. Gli amici aprono lo stesso indirizzo, inseriscono il codice e premono **Entra** (oppure usano il link d'invito `…/?room=ABCD`).
3. Vi vedete nella stanza (nome sopra la testa, colori diversi), con camminata, gesti, balletto, coccole al cane e chat (**T**).
4. **Cabinato in due:** il primo che si siede è il 1P, il secondo il 2P; premete START. La partita gira sul PC dell'host
   (il primo che ha creato la stanza): gli altri inviano i comandi e vedono lo schermo aggiornato in tempo reale.
   Se l'host esce, la stanza passa automaticamente al giocatore successivo.

**Pubblicarlo su internet:** il container ascolta in HTTP sulla porta 8080. Mettilo dietro un reverse proxy con HTTPS
(Caddy, Nginx, Traefik, il proxy del tuo hosting): il client usa automaticamente `wss://` quando la pagina è in HTTPS.
Esempio Caddy: `gioco.tuodominio.it { reverse_proxy localhost:8080 }`. Va bene qualunque host che esegue container
(VPS, Render, Fly.io, Railway, Google Cloud Run con WebSocket attivi). Netlify/Vercel/GitHub Pages servono solo il sito
statico: lì il gioco funziona in singolo e in 2 giocatori sullo stesso PC, ma non online.

Limiti del server (variabili d'ambiente): `PORT` (8080), `MAX_ROOMS` (500), 8 giocatori per stanza, messaggi max 128 KB,
stato dei giocatori inoltrato 15 volte al secondo, connessioni inattive chiuse dopo ~25 s.
Server diverso da quello che serve la pagina: aggiungi `?server=wss://host/ws` all'indirizzo.

**Protocollo (JSON su `/ws`)**: `create`/`join {code,name}` → `welcome {id, code, host, players}`; `state {s}` (posizione,
direzione, animazione, gesti, mani) inoltrato a 15 Hz come `states`; `ev` eventi brevi (cane, posti al cabinato);
`to {id,d}` messaggi diretti (comandi del giocatore verso l'host); `game {d}` istantanee della partita dall'host (~20 Hz);
`chat {text}`; `joined`/`left`/`host` per ingressi, uscite e passaggio di host.

### Easypanel
1. *Create Project* → *+ Service* → **App**.
2. *Source*: **GitHub** (repository e branch) oppure *Docker Image* se la costruisci tu.
3. *Build*: **Dockerfile**, percorso `Dockerfile` (oppure `Dockerfile.prebuilt` se hai fatto il commit di `dist/` dopo `npm run build:prod`).
4. *Environment* (facoltativo): `ANTHROPIC_API_KEY=sk-ant-…` per i minigiochi e i personaggi con Claude. Senza chiave il gioco usa le battute offline.
5. *Domains*: aggiungi il dominio e punta alla **porta 8080** (HTTPS lo fa Easypanel; WebSocket su `/ws` funziona da solo).
6. *Advanced → Resources*: bastano 256 MB di memoria (il server ne usa ~60-100 MB). Health check: `/healthz`.
7. *Deploy*. Nei log deve comparire `BIGALESSO server su http://localhost:8080`. Un `stop (SIGTERM)` vuol dire solo che Easypanel ha sostituito il container durante un deploy.

## Scaricarlo e giocarlo offline
- **App installabile (PWA):** aprendo il sito da `https://` Chrome/Edge mostrano *Installa app* nella barra degli indirizzi.
  Dopo la prima visita il gioco funziona anche offline (service worker `sw.js`, cache versionata: ogni nuova build si aggiorna da sola).
- **File unico:** `npm run build:single` crea `dist/BIGALESSO-gioca.html` (doppio clic, niente server).
- **Versione desktop (Electron, usa sempre la GPU dedicata):**
  ```bash
  npm ci
  npm run desktop          # prova in finestra
  npm run desktop:dist     # crea l'installer per il sistema su cui sei (cartella desktop/release)
  ```
  **Windows, già pronto:** a ogni push su `main` il workflow `.github/workflows/desktop.yml` crea l'installer e la
  versione portable e li mette nella release `desktop-latest` (link fissi, sempre l'ultima build):
  `releases/download/desktop-latest/BIGALESSO-GAMES-Setup.exe` e `…/BIGALESSO-GAMES-Portable.exe`.
  Con un tag (`git tag v7.0.0 && git push --tags`) crea anche la release della versione; macOS (`.dmg`) e Linux
  (`.AppImage`) con i tag o da *Actions → Run workflow* spuntando "anche macOS e Linux".
  Le build non sono firmate: Windows mostra "App non riconosciuta" → *Ulteriori informazioni* → *Esegui comunque*;
  su macOS clic destro → *Apri*.
  **Online e Claude nell'app:** in GitHub *Settings → Secrets and variables → Actions → Variables* crea
  `BIGALESSO_SERVER` = indirizzo del server Easypanel (es. `https://gioco.tuodominio.it`): le build successive lo
  hanno dentro. In locale: variabile `BIGALESSO_SERVER` quando lanci `npm run desktop:dist`, oppure `"server"` in `desktop/config.json`.
  **Prestazioni:** l'app chiede a Windows la scheda video dedicata (portatili Intel + NVIDIA/AMD), non rallenta in
  secondo piano e ha più memoria per JavaScript. In *Impostazioni*: "Mostra FPS" (anche F3, per tutti), "FPS illimitati"
  (toglie il vsync, al riavvio), "Schermo intero all'avvio" e la scheda video in uso. F11 o Alt+Invio: schermo intero.

## Intro, menu e salvataggi
- **Intro stile GTA** (`src/opening.js`): parte all'avvio sopra il caricamento, con le tavole tratte dal Corriere
  (`assets/opening`, rigenerabili con `python3 scripts/opening_assets.py`) e musica sintetizzata. Un tasto la salta.
  Si riguarda dal menu (*Rivedi intro*) e si disattiva in *Impostazioni → Intro all'avvio*.
- **Menu** (Esc): voci grandi a sinistra, schede in alto con **Q/E**: Mappa, Obiettivi, Personaggi, Galleria, Segreti, Online,
  Impostazioni, Comandi, Crediti.
- **Salvataggio locale** (`src/save.js`, `localStorage` `bigalesso_save_v1`): obiettivi, statistiche, record, luoghi scoperti.
  *Impostazioni → Salvataggio*: **Esporta** scarica un file `.json` con tutti i progressi (anche segreti e record dei cabinati),
  **Importa** lo ricarica su un altro computer.
- API per gli altri moduli: `window.__save.unlock(id, {title, desc, icon, cat})`, `define()`, `stat(k, +1)`,
  `record(k, valore)`, `visit(luogo)`, `get/set`, `on('unlock', cb)`.
- Font dei titoli: Anton (SIL Open Font License, `assets/fonts/OFL-Anton.txt`). Icone: `npm run icons`.

## Il Corriere delle Due Torri e il murales
- **Il giornale:** una copia piegata sul tavolino di vetro (accanto alla macchina da scrivere) e una sul tavolino del salotto.
  `E · Leggi il Corriere`: l'uomo lo prende, lo apre tra le mani e si apre il lettore a doppia pagina
  (← → / A D sfoglia, rotella o clic per ingrandire, trascina per spostare, `V` guarda la scena, `E`/`Esc` lo richiude e lo rimette a posto).
  L'ultima pagina letta viene ricordata.
- **Il murales** *Cappelletti Man vs Tortellino Man* sul muro in fondo al giardino (luci accese di notte):
  `E · Guarda il murales` fa partire una carrellata con i sottotitoli dal pezzo di pagina 5.
- **Stampe incorniciate** dal giornale sulle pareti del salotto.
- Gli asset (`assets/news/`: pagine, copertina, murales, stampe) si rigenerano dal PDF con
  `python3 scripts/news_assets.py` (servono `pdftoppm`, Pillow e numpy). La build li copia in `dist/news/`.

## Struttura
```
src/
  main.js       ingresso: caricamento, intro, camere, input, collegamento gioco ↔ cabinato
  index.html    pagina (overlay, pulsanti, comandi touch)
  scene.js      renderer, luci, post-processing (bloom, vignetta, grana, letterbox)
  room.js       stanza: muro in pietra, pavimento lucido con riflessi, tavolino, macchina da scrivere, conchiglia, estintore, orologio
  cabinet.js    cabinato: fianchi, grafiche, plancia, joystick e pulsanti, gettoniera, CRT (shader), alone e ronzio del marquee
  fx3d.js       effetti 3D: particelle, neon, modalità notte, gettone, polvere e fascio di luce
  neonfont.js   sottoinsieme del font helvetiker per i tubi al neon
  man.js        uomo: animazioni retargetizzate, IK di braccia, mani e dita sui comandi
  dog.js        barboncino nero (pelo a riccioli istanziato)
  game.js       il gioco arcade (stati, nemici, boss, power-up, punteggi)
  sprites.js    pixel art e fondali
  font.js       font bitmap 5×7
  audio.js      sintetizzatore WebAudio: musica chiptune, effetti, rumori della stanza
  net.js        multiplayer online: stanze, sincronizzazione giocatori, partita in co-op (host)
  avatars.js    gli altri giocatori (cloni dell'uomo con colore e nome) e il 2° giocatore locale
  newspaper.js  il Corriere delle Due Torri: copie piegate, giornale aperto tra le mani, stampe in salotto
  reader.js     lettore del giornale (overlay con sfogliata 3D, zoom e trascinamento)
  mural.js      muro del giardino con il murales, barattoli, scala, luci notturne e carrellata
  opening.js    intro stile GTA (tavole, split screen, mosaico, logo) con la sua musica
  save.js       obiettivi, statistiche, record e luoghi scoperti (salvataggio locale, esporta/importa)
  sw.js         service worker (PWA offline), completato da build.mjs
desktop/        app Electron (main.cjs, preload.cjs, config.json) e configurazione degli installer
server/         server multiplayer Node + ws (serve anche dist/)
assets/         modello (man.glb), animazioni (anims.json), texture del cabinato ricavate dalla foto, news/ (giornale e murales)
scripts/        build.mjs, dev.mjs, serve.mjs
```

### API effetti (`src/fx3d.js`)
```js
const fx = createFX(scene, camera, { lights, cab, renderer, low });
fx.update(dt);                       // ogni frame, dopo aver impostato le luci
fx.confetti(pos, n = 200); fx.hearts(pos); fx.sparkles(pos, n = 40);
fx.spray(origin, dir, seconds);      // nuvola dell'estintore
fx.coin(from, to, onDone);           // ritorna anche una Promise
fx.dust(on); fx.setNight(on); fx.pulse(color, strength = 1);
fx.neon.userData.setOn(on);          // insegna al neon (accesa di default)
```

## Crediti
- [three.js](https://threejs.org) r170 (MIT), font helvetiker dagli esempi three.js.
- Modello uomo: avatar Ready Player Me dagli esempi three.js; animazioni Idle/Walk dal modello Soldier e gesti dal modello Xbot
  (Mixamo, dagli esempi three.js), retargetizzate sullo scheletro dell'avatar.
- Grafiche del cabinato: dalla foto originale BIGALESSO GAMES.
- Musica ed effetti sonori sintetizzati in tempo reale (WebAudio), nessun file audio.
