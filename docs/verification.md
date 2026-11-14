# Verifiche eseguite

Sessione del 13 novembre 2026, macOS ARM64, Node v26.13.0, npm 11.20.0.

| Verifica                         | Esito effettivo                                                                                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` da installazione pulita | OK; audit npm: 0 vulnerabilità                                                                                                                                                                                                                                                                              |
| `npm run typecheck`              | OK, TypeScript strict                                                                                                                                                                                                                                                                                       |
| `npm run build`                  | OK, frontend Vite e backend compilato                                                                                                                                                                                                                                                                       |
| `npm test`                       | 23 test passati, 4 file                                                                                                                                                                                                                                                                                     |
| POC Paper.js                     | Strisce incrociate con area nota, bordi coincidenti, unione, paint order, viewBox/transform, foro evenodd, path auto-intersecante                                                                                                                                                                           |
| Corpus                           | 195 inclusioni e nessuna esclusione; self-match e roundtrip per tutte le bandiere; monotonia su 780 confronti (195×4), varianti e fonti registrate                                                                                                                                                          |
| Socket.IO reale                  | Due client WebSocket, snapshot uguali, terzo respinto, riconnessione con stessa identità e ruolo creatore, ospite non autorizzato all’avvio, rate limit persistente                                                                                                                                         |
| `npm run test:e2e`               | 2 scenari passati in Chromium: due smartphone isolati, 390×844 e 375×667; codice a tre caratteri, avvio riservato al creatore, sei sonde, sette mani e punteggio cumulativo, refresh e uscita                                                                                                               |
| Produzione                       | Build normale avviata con `PORT=8082 npm start`: health/home OK, codice di tre caratteri, avvio ospite negato via WebSocket, avvio host OK, nessuna deadline; endpoint debug 404. E2E usa factory deterministica solo nel runner test, con configurazione produzione.                                       |
| `npm run dev`                    | Vite su localhost:5173 e backend su 8080 avviati correttamente                                                                                                                                                                                                                                              |
| Laboratorio nella UI di sviluppo | Chromium: Francia/Russia a 0,04 → 22,2% del canvas rivelato, entrambe le immagini SVG caricate; report aperto correttamente                                                                                                                                                                                 |
| Ispezione visiva                 | Schermate desktop e mobile controllate; corretti selettore delle icone SVG e focus outline; selettore privo di immagini e invio risposta senza dialogo; nessuno scroll pagina con sei tentativi a 390×844, 375×667 e 320×568; nessun elemento importante fuori viewport anche a 375×350 (tastiera simulata) |
| Docker/Compose su Linux          | NON eseguito: Docker non è installato nell'ambiente disponibile                                                                                                                                                                                                                                             |
| Due computer fisici in VPN       | NON eseguito: non sono disponibili due peer VPN; checklist nel README                                                                                                                                                                                                                                       |

Le schermate locali sono in `test-results/`, directory ignorata dal versionamento. I server temporanei usati per le verifiche sono stati arrestati. Il successo dei test locali non costituisce una verifica della configurazione VPN/firewall del server di destinazione.

## Revisione obsidian / smartphone

Le regole correnti sostituiscono i requisiti iniziali di cinque mani e timer: non esistono più deadline, timeout o stato finished. I test arrivano a 13 mani nella macchina a stati e a 7 nel browser, senza reset del punteggio. Rimangono sei sonde per mano e la conferma di entrambi per iniziare quella successiva.

Ogni riga della cronologia contiene bandiera originale e regioni effettivamente trovate con quella sonda; nuovi tentativi aggiunti in fondo. Ispezionate le schermate `obsidian-home.png`, `obsidian-small-phone.png` e `obsidian-320.png`. Con la tastiera simulata il target si riduce per lasciare visibili tentativi e comandi; non è una prova su tastiera nativa iOS/Android. Il selettore paesi può scorrere internamente, la pagina di gioco no. Nessuna garanzia di leggibilità di tutte le miniature se si aumenta MAX_PROBES oltre sei o si usa zoom elevato.

Anche il laboratorio della nuova UI è stato provato in Chromium: risultato Francia/Russia 22,2% e apertura report riuscita. Metadati del browser aggiornati alla palette obsidian. Nessuna nuova dipendenza introdotta.

## Corpus completo e invio diretto

Il catalogo corrente contiene 193 membri ONU più Vaticano/Santa Sede e Palestina: 195 codici esatti, nessun territorio aggiuntivo. Le sorgenti sono 176 SVG dettagliati `flag-icons` e 19 illustrazioni piatte `country-flag-icons`; le seconde hanno stemmi semplificati e sono dichiarate nel report. Il Nepal usa la sorgente dettagliata con sagoma trasparente.

Risolto un difetto concreto scoperto dall'audit visivo: il PathBuilder non conservava il fill rule del path durante la trasformazione. Il motore ora lo conserva e il test regressivo verifica un foro evenodd con traslazione e scala. Non sono state allargate le tolleranze per far passare gli asset problematici: per questi si è scelta una sorgente piatta diversa e dichiarata.

`npm test`: 23 test passati. `npm run build`: riuscita, con TypeScript strict. `npm run test:e2e`: 2 test passati, scenario multiplayer mobile e audit dei 195 SVG. L'audit confronta solo gli interni, escludendo un pixel attorno ai bordi; soglia di differenza colore per canale 24/255, massimo 0,5% di pixel interni differenti. Il raster è usato solo nel test, mai nella logica di confronto o scoring.

Il test UI verifica esplicitamente zero elementi img/svg nei suggerimenti e la conclusione della mano dopo un solo invio della risposta finale. Le miniature restano nella cronologia dei tentativi, dove sono indizi già pubblici. Il catalogo API fornisce nomi e URL relativi; ogni SVG viene caricato solo quando mostrato come tentativo o soluzione.

La build compilata corrente è stata avviata dopo un nuovo `npm ci` (audit: zero vulnerabilità). Smoke HTTP/WebSocket: `/health` OK, 195 metadati in 14.643 caratteri senza SVG inline, endpoint SVG del Nepal 200, sonda reale accettata in 6 ms nella partita campione. I server temporanei sono stati arrestati.

Conteggio finale: **176 SVG dettagliati, 19 varianti piatte semplificate, 195 inclusi e zero esclusi**. Questo sostituisce i conteggi preliminari della fase di migrazione. La documentazione delle licenze e delle varianti è in `assets/flags/` e `assets/flags-flat/`.

## Modalità giocatore singolo — 14 novembre 2026

Scelta Solo/PvP nella lobby, autoritativa sul server e riservata al creatore. PvP resta la modalità predefinita; il singolo si avvia con un solo giocatore e non accetta ospiti. Il cambio è consentito solo prima dell'avvio e non si può scegliere Solo se una seconda identità è già presente.

In singolo ogni `probe` è un tentativo diretto: se errato produce l'indizio e resta nella sottofase choose_probe; nessun Risolvi o Passa. Al limite MAX_PROBES (default 6), l'ultimo tentativo corretto vince; quello errato conclude automaticamente con Tentativi esauriti. Il punteggio conta le mani vinte e la successiva parte con il Pronto del solo giocatore. Refresh e rientro conservano modalità, indizi, budget residuo e punteggio.

Verifiche effettive: `npm test` → 29 test passati; `npm run build` e TypeScript strict → OK; `npm run test:e2e` → 3 scenari passati (PvP, singolo e audit visivo dei 195 SVG). Lo scenario singolo a 375×667 verifica invio da tastiera, nessuna scelta Passa/Risolvi, sei errori con conclusione automatica, vittoria, turno successivo, refresh e rifiuto dell'ospite. Schermata `test-results/solo-six-attempts.png` ispezionata: nessuno scroll e tutti i tentativi/comandi visibili.

Durante la prova è stata corretta anche la priorità del selettore: una corrispondenza esatta precede prefissi e sottostringhe, quindi digitare Russia e premere Invio seleziona Russia, senza scegliere prima Bielorussia. Il test verifica il nome effettivamente selezionato prima dell'invio. Nessuna nuova dipendenza.

## Titolo, menu e tastiera senza focus — 14 novembre 2026

Ripristinato il sottotitolo esatto «Due giocatori una bandiera». Il menu singolo contiene solo Esci dalla stanza e il controllo di chiusura; non mostra codice, numero mano, inviti o strumenti di sviluppo. Il menu PvP conserva il riepilogo ma non propone più l'invito durante la partita.

La barra Paese conserva separatamente bozza e selezione definitiva, anche dopo blur o clic fuori dal selettore. Digitazione e Backspace senza focus vengono indirizzati al campo quando è abilitato. Invio: campo vuoto → nessuna azione; bozza con un risultato → completamento; selezione definitiva → invio. Non sono intercettate composizioni IME, scorciatoie con modificatori, digitazione in altri campi o tasti mentre è aperto il menu. Invio/Spazio su pulsanti a fuoco mantengono l'attivazione nativa.

Verifiche effettive: `npm run build` e TypeScript strict OK; `FLAG_DUEL_TEST_PORT=8083 npm run test:e2e` → 3 scenari passati. Verificati titolo, menu di entrambe le modalità, campo vuoto con/senza focus, testo conservato a menu suggerimenti chiuso, completamento e invio senza focus, correzione con Backspace, invio di una risposta finale e attivazione di Sonda con Spazio. Nessuna cattura dei tasti nel turno avversario o mentre il menu singolo è aperto.

La porta 8080 era occupata dal server locale: i test hanno usato la 8083 senza interromperlo. `FLAG_DUEL_TEST_PORT` configura solo il runner E2E e non cambia la porta dell'app normale.


## Tolleranza dei colori nella lobby — 14 novembre 2026

Rimosso dal menu PvP il motivo dell'ultima mano. Il sottotitolo è ora «Scopri la bandiera. Sfida te stesso o un amico.»; quello della prima titlescreen minimal era «Una bandiera. Due giocatori.».

Le impostazioni avanzate della lobby offrono Precisa (ΔE OKLab 0,02), Standard (0,04, precedente valore) e Ampia (0,06). Solo il creatore può modificarle, esclusivamente prima dell'avvio. La selezione è autorevole sul server, condivisa con l'ospite e mantenuta dopo refresh e nelle mani successive, sia PvP sia singolo. Le stanze non modificano la configurazione condivisa. `TOLERANCE` continua a definire il preset iniziale del server ma ora accetta soltanto 0.02, 0.04 e 0.06; valori personalizzati precedenti devono essere sostituiti con un preset.

Verifiche eseguite: `npm test` → 31 test passati; `npm run build` → preprocessamento 195/195, TypeScript e build riusciti; `FLAG_DUEL_TEST_PORT=8083 npm run test:e2e` → 3 scenari passati. I test geometrici utilizzano rettangoli SVG e rossi con distanze reali OKLab fra le soglie: verificano le aree rivelate da tutti i preset in entrambe le modalità. Coperti inoltre rifiuto dell'ospite, cambio durante la partita e fra mani, isolamento tra stanze, mantenimento della scelta, sincronizzazione nell'interfaccia e refresh in singolo. Il server locale sulla porta 8080 non è stato interrotto: va riavviato per caricare il nuovo protocollo.


## Tastiera e tolleranza Ampia — 14 novembre 2026

Sottotitolo esatto «Una bandiera. Due giocatori.». Ampia passa da 0,06 a 0,1; rimossa la descrizione testuale delle tolleranze. Aggiornate anche validazione server e documentazione dei valori TOLERANCE.

Freccia giù/su evidenziano i suggerimenti con scorrimento automatico e attributi ARIA; Invio conferma il suggerimento evidenziato, il successivo invia il Paese. Digitare modifica la ricerca e azzera l'evidenziazione. Invio senza altri controlli a fuoco attiva Passa nella fase appropriata o Prossima mano a fine round; menu, input, turno avversario, attesa, ripetizione del tasto e scorciatoie con modificatori sono esclusi. I pulsanti esplicitamente a fuoco conservano la propria attivazione nativa.

Verifiche finali: build e TypeScript riusciti; 31 test unitari/integrati passati; 3 scenari Playwright passati sulla porta 8083. Test geometrici estesi con un rosso la cui distanza OKLab supera 0,06 e resta sotto 0,1, riconosciuto soltanto da Ampia in PvP e singolo. I test browser verificano navigazione giù/su, conferma senza invio anticipato, Passa e Prossima mano via Invio, oltre alle precedenti verifiche di gioco.


## Lobby mobile dopo la tastiera — 14 novembre 2026

La lobby non ha più un'altezza fissa legata a visualViewport.height: usa min-height:100dvh e può crescere con il contenuto. Il viewport visuale resta usato per i controlli mentre è attivo un campo modificabile; al blur la proprietà CSS viene rimossa per tornare alle unità dinamiche native. Aggiornamenti anche su focus, scroll del viewport, pageshow e cambio schermata. L'invio del form chiude esplicitamente la tastiera e l'ingresso riuscito ripristina lo scroll in cima.

Build e TypeScript passati; 3 scenari browser passati sulla porta 8083. La regressione simula nell'ospite mobile (375×667) un visualViewport.height bloccato a 280 dopo l'ingresso: verifica, senza refresh e prima di ripristinarlo, lobby estesa a tutta l'altezza, rimozione della misura obsoleta e pulsante Esci entro lo schermo. Restano passati il gioco con viewport ridotto e i test tastiera. La tastiera nativa e l'eventuale banda del browser su telefono fisico non sono riproducibili direttamente nel runner desktop: serve il riscontro sul dispositivo per confermare che fosse la stessa causa osservata.


## Ingresso tramite tocco con tastiera aperta — 14 novembre 2026

Il primo intervento sul CSS non ha risolto il caso segnalato sul telefono. L'ingresso ora sfoca il campo e conserva il modulo durante la chiusura della tastiera prima di inviare create/join. Sui dispositivi touch o con viewport ridotto campiona altezza e offset anche in assenza di eventi resize: attende almeno 450 ms e 150 ms di stabilità con viewport ripristinato, con limite massimo 1200 ms per evitare blocchi permanenti. Campi, chiusura e invio vengono protetti durante la transizione; un blocco sincrono evita ingressi duplicati. Desktop senza tastiera virtuale non aggiunge attesa.

Build e TypeScript passati; tre scenari Playwright passati. Il browser ospite usa emulazione mobile touch: tocca Entra in stanza con campo attivo e viewport ridotto/spostato, ripristinato 550 ms dopo il blur senza evento resize. Il test verifica che il campo sia ancora montato al momento del ripristino, quindi che compaia la lobby e rimangano validi i controlli sul layout. Questa simulazione verifica l'ordine della transizione; non equivale alla verifica della tastiera nativa sul telefono dell'utente.


## Modulo nel flusso della pagina e verifica Firefox — 14 novembre 2026

Riscontro dell'utente: il difetto persisteva su Firefox Android con tastiera aperta, sia al tocco sia con Invio; l'attesa del precedente intervento non era risolutiva. Rimossi helper e ritardo artificiale. Il modulo crea/entra ora è una schermata nel normale flusso del documento: titolo iniziale nascosto durante l'inserimento, nessun overlay fixed/backdrop-filter e nessuno scroll interno al form. Restano blur esplicito, prevenzione dei doppi invii e ripristino dello scroll.

Build/TypeScript passati; quattro scenari passati su Chromium e quattro su Firefox desktop con viewport ridotto e input touch. Nuovo scenario verifica creazione con Invio e ingresso manuale tramite codice con Invio. La prova al tocco verifica l'assenza di antenati fixed/sfocati e la corretta lobby dopo ripristino ritardato di altezza/offset, anche senza resize. Installato il browser Firefox di Playwright; runner selezionabile con `FLAG_DUEL_TEST_BROWSER=firefox FLAG_DUEL_TEST_PORT=8083 npm run test:e2e` (default Chromium). Firefox non usa l'emulazione isMobile di Chromium, ma viewport ridotto e touch. Queste prove non riproducono la tastiera nativa GeckoView su Android: la risoluzione del difetto segnalato deve essere confermata sul dispositivo dell'utente.
