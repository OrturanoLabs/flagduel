# Flag Duel

Indovina le bandiere in singolo o sfida un amico in PvP. Ogni tentativo rivela le zone geometriche con colori simili alla bandiera segreta.

**Singolo e PvP · 195 Paesi + 20 regioni italiane · stanze private · nessun account · nessun timer · mani illimitate**

<img src="docs/screenshots/game.png" width="300" alt="Flag Duel su smartphone: punteggi, bandiera misteriosa, sei tentativi e azioni nella stessa schermata" />

## Avvio rapido su Mac o Linux

Richiede **Node.js 24 LTS o successivo** e npm.

```sh
git clone https://github.com/OrturanoLabs/flagduel.git
cd flagduel
npm ci
npm run build
npm start
```

Apri **http://localhost:8080**. Il server ascolta su `0.0.0.0:8080`: da un altro dispositivo in LAN/VPN apri `http://IP_DEL_SERVER:8080`. Per due giocatori sullo stesso Mac usa browser/profili distinti oppure una finestra privata.

Per limitare l’accesso al solo computer locale:

```sh
HOST=127.0.0.1 npm start
```

La prima build elabora gli asset locali; le successive riusano la cache se sorgenti e motore non sono cambiati. Non vengono scaricate bandiere durante il gioco.

## Giocatore singolo

1. Crea una stanza, scegli **Giocatore singolo** nella lobby e avvia senza aspettare un ospite.
2. Ogni Paese inviato è un tentativo diretto. Se è sbagliato, ricevi l'indizio e puoi provare subito un altro Paese: non ci sono Risolvi o Passa.
3. Hai **6 tentativi distinti** per bandiera (configurabili con `MAX_PROBES`). La risposta corretta vince anche all'ultimo tentativo; esaurendoli senza soluzione, la mano termina e mostra la bandiera.
4. Il punteggio conta le bandiere indovinate. **Prossima mano** riparte subito, mantenendo il punteggio. Refresh e riconnessione non azzerano indizi o tentativi.

La modalità si sceglie solo nella lobby, dal creatore. Una stanza singola non accetta ospiti; se un avversario è già entrato in PvP, non si può passare a singolo.

## PvP

1. Crea una stanza e condividi il codice di tre caratteri o il link.
2. L’avversario entra; **solo il creatore può avviare**.
3. A turno scegli una sonda: entrambi vedete le intersezioni delle zone geometriche con colori abbastanza simili. Gli indizi si accumulano.
4. Dopo la sonda scegli **Risolvi** oppure **Passa**. La risposta definitiva parte subito, senza un secondo dialogo: se è errata, il punto va all’avversario. Una sonda con il codice Paese esatto vince immediatamente.
5. Dopo la mano entrambi scelgono **Prossima mano**. Il primo giocatore si alterna e il punteggio continua finché volete giocare.

Ci sono sei sonde distinte per mano; dopo la sesta si può ancora risolvere, mentre Passa termina la mano in pareggio. Nessun timeout. Il menu centrale permette di uscire dalla stanza. In singolo contiene solo l’uscita (oltre alla chiusura del menu); il menu PvP non propone inviti durante la partita.

Durante il gioco la digitazione va nella barra Paese anche senza focus, quando il campo è abilitato. **Invio a campo vuoto non fa nulla; con testo da completare seleziona il risultato migliore; con un nome già selezionato lo invia.** I menu aperti, gli altri campi di testo e le scorciatoie del browser mantengono i propri comandi. Il selettore mostra solo i nomi; la cronologia mostra le sonde già giocate e le regioni trovate. L’interfaccia obsidian è pensata per smartphone, senza scroll della pagina di gioco.

## Regioni italiane (extra)

Nella lobby, **Impostazioni avanzate → Extra → Regioni italiane** attiva il catalogo delle **20 regioni italiane** al posto dei 195 Stati. Solo il creatore può cambiarlo prima dell'avvio; l'ospite vede la selezione aggiornata nel riepilogo. Il catalogo resta lo stesso dopo refresh e nelle mani successive.

Funziona in singolo e PvP, anche con Color Shift e No Memory. Se gli esperimenti sono spenti restano sei tentativi, accumulo degli indizi e cronologia illustrata; i tentativi illimitati e la patta seguono le modalità sperimentali. I due cataloghi non si mescolano: nella ricerca compaiono soltanto le regioni quando l'extra è attivo.

Gli SVG sono locali e funzionano offline. Campania e Veneto hanno adattamenti a colori piatti dichiarati; i microtesti del Veneto non supportati dal motore vengono rimossi. Province, comuni e province autonome come voci separate non sono inclusi. Fonti, licenze e limiti in [docs/italian-regions.md](docs/italian-regions.md).

## Modalità sperimentali

Nella lobby apri **Impostazioni avanzate → Sperimentali**. Il creatore può attivare **Color Shift** e **No Memory** indipendentemente, anche insieme. L'ospite vede la selezione aggiornata nel riepilogo della lobby. Le opzioni sono disponibili sia in singolo sia in PvP e rimangono fisse durante la partita.

- **Color Shift**: ogni round usa una nuova rotazione casuale della tonalità e una variazione della luminosità, identiche per entrambi i giocatori e conservate dopo refresh/riconnessione. Le corrispondenze geometriche e la tolleranza continuano a usare i colori originali. A fine round la soluzione torna ai colori originali.
- **No Memory**: la bandiera principale mostra soltanto le aree riconosciute dall'ultima sonda. Un tentativo senza corrispondenze la svuota completamente.
- **Almeno un esperimento attivo**: nessun tetto di tentativi; la cronologia conserva solo i nomi, senza bandiere o anteprime degli indizi. La lista scorre al suo interno per mantenere i controlli nella schermata. In singolo il contatore mostra **∞**.

Nel menu di partita è disponibile **Patta** quando almeno un esperimento è attivo. In PvP propone la patta: l'avversario riceve un avviso discreto e può accettare o rifiutare dal menu; chi propone può ritirarla. Solo l'accordo di entrambi conclude la mano. In singolo la conclusione è immediata. La soluzione viene mostrata nei colori originali e nessun punto viene assegnato. **Prossima mano** prosegue normalmente.

Restano invariati turni, punteggi, Risolvi/Passa in PvP e divieto di ripetere un Paese già testato nello stesso round. «Senza limite» elimina quindi il tetto `MAX_PROBES`, mantenendo il catalogo selezionato di 195 Stati o 20 regioni distinte. Con entrambi gli esperimenti disattivati tornano accumulo, anteprime e limite normale. Dettagli e verifiche in [docs/experimental-modes.md](docs/experimental-modes.md).

## Sviluppo

```sh
npm ci
npm run dev
```

Apri `http://localhost:5173`. Vite è locale e inoltra API e Socket.IO al backend sulla porta 8080. In produzione Express serve frontend e realtime sulla stessa porta: non esporre Vite come server di produzione.

Il laboratorio SVG è disponibile nel menu solo in sviluppo. Gli endpoint `/api/lab` e `/api/report` non sono registrati in produzione.

## Docker su server Linux

```sh
cp .env.example .env
# In .env imposta BIND_ADDRESS all’IP VPN del server.
# Il valore predefinito 127.0.0.1 consente accesso solo locale.
docker compose up --build -d
docker compose logs -f app
```

Apri `http://IP_VPN_DEL_SERVER:8080`. Il container ascolta su `0.0.0.0:8080`; la porta host è configurabile con `PORT`. Health endpoint: `GET /health`.

```sh
docker compose down
docker compose up --build -d
```

Il prototipo usa HTTP e una VPN già configurata; non serve HTTPS. HTTP non aggiunge TLS. Non inoltrare la porta sul router e verifica la raggiungibilità effettiva e le regole Docker/firewall. I dettagli sono in [docs/deployment.md](docs/deployment.md).

Configurazione: `BIND_ADDRESS`, `PORT`, `TOLERANCE=0.04` (preset iniziale: solo `0.02`, `0.04` o `0.1`), `MAX_PROBES=6`. Senza Docker, esporta le variabili nella shell: Node non legge automaticamente `.env`.

## Test

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest verifica colori, geometria, corpus, regole e Socket.IO. Playwright prova due smartphone separati, tutte le azioni fino a sette mani, refresh, tastiera e layout; un secondo scenario confronta visivamente tutti i 195 SVG con il rendering delle superfici preprocessate. Gli E2E usano per default la porta 8080. Se il gioco è già avviato, esegui `FLAG_DUEL_TEST_PORT=8083 npm run test:e2e` per usare una porta separata.

Esiti e limiti delle prove: [docs/verification.md](docs/verification.md). Docker/Linux e due computer fisici in VPN devono essere verificati sull’ambiente di destinazione.

## Architettura e limiti

TypeScript strict, React/Vite/Tailwind, Express/Socket.IO e Zod. Il motore usa Skia PathOps via CanvasKit WASM e Paper.js per **intersezioni vettoriali reali**, con confronto sRGB → OKLab e soglia ΔEOK inclusiva. Nessun confronto raster nella logica di gioco.

```text
apps/web/              interfaccia e laboratorio
apps/server/           server autoritativo e macchina a stati
packages/shared/       protocollo e validazione
packages/flag-engine/  SVG, geometria e OKLab
assets/                sorgenti, licenze, catalogo e report
scripts/               preprocessamento e avvisi di licenza
tests/ e e2e/          test automatici
```

Il catalogo comprende 193 membri ONU e due osservatori, Santa Sede/Vaticano e Palestina. **176 SVG sono dettagliati e 19 sono varianti grafiche semplificate**, dichiarate nel [report](assets/generated/report.json). Il Nepal mantiene trasparente l’esterno della sagoma. Le bandiere visivamente indistinguibili restano giocabili e la vittoria dipende dal codice Paese.

Stanze e sessioni sono in memoria, in una sola istanza Node: **un riavvio azzera le partite**. Il rientro guest ripristina identità e ruolo tramite token locale; le stanze interamente disconnesse scadono dopo un’ora. Non sono implementati account, persistenza, matchmaking o classifica globale.

Dettagli del motore e precisione: [docs/vector-engine.md](docs/vector-engine.md).

## Licenza e attribuzioni

Il codice originale di Flag Duel è disponibile sotto **[licenza MIT](LICENSE)**: è consentito usarlo, modificarlo e ridistribuirlo, anche commercialmente, mantenendo gli avvisi richiesti.

Le bandiere e le librerie conservano le loro licenze. Le principali fonti degli SVG sono [flag-icons](https://github.com/lipis/flag-icons) e [country-flag-icons](https://github.com/catamphetamine/country-flag-icons), entrambe MIT. I copyright e i testi originali sono conservati nel repository, nella build web e nel container.

- [Attribuzioni e indice delle licenze](THIRD_PARTY_NOTICES.md)
- [Testi integrali di copyright e licenze](third_party/THIRD_PARTY_LICENSES.txt)
- [Fonti degli asset, del catalogo e del metodo](docs/sources.md)

Una citazione o un link aiutano a rintracciare la fonte, ma **non sostituiscono i testi di licenza e gli avvisi di copyright richiesti**. Gli avvisi distribuiti si rigenerano con `npm run licenses` e sono inclusi anche su `/THIRD_PARTY_LICENSES.txt` nell’app avviata.

Nella lobby, **Impostazioni avanzate** permette al creatore di scegliere la tolleranza dei colori: Precisa (ΔE OKLab 0,02), Standard (0,04, valore precedente) o Ampia (0,1). La scelta vale per entrambi i giocatori e tutte le mani successive, anche in singolo; non può cambiare durante la partita.

Tastiera: Freccia su/giù navigano i suggerimenti; Invio conferma quello evidenziato e, al secondo invio, invia il Paese. Quando disponibili e senza un altro controllo a fuoco, Invio attiva Passa o Prossima mano. Il menu aperto sospende queste scorciatoie.

Per eseguire i test browser anche con Firefox: `npx playwright install firefox`, poi `FLAG_DUEL_TEST_BROWSER=firefox FLAG_DUEL_TEST_PORT=8083 npm run test:e2e`. La suite desktop con viewport mobile e touch non sostituisce una prova della tastiera nativa su Android.
