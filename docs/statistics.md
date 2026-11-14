# Statistiche persistenti di Flag Duel

Branch `feat/game-statistics`, basato su `feat/experimental-modes` (`1c6940f`). Non include il catalogo italiano. Il gioco mantiene regole e schermate del branch sperimentale.

## Avvio e pagina dedicata

```sh
npm ci
npm run build
npm run stats:url
npm start
```

`npm run stats:url` stampa l'indirizzo della pagina e il percorso del DB. Il server stampa gli stessi dati all'avvio. La pagina è su `http://localhost:8080/insights/<chiave>`: da un altro dispositivo sostituire localhost con l'IP del server. Non è collegata dalla home né dai menu di partita. Non richiede login: chiunque conosca l'indirizzo può leggere tutte le statistiche e la cronologia.

La chiave casuale viene creata una volta e conservata nel database, quindi l'URL non cambia ai riavvii. Il comando per leggere l'indirizzo non conclude o interrompe le mani eventualmente in corso. Le variabili opzionali sono:

```sh
STATS_DB_PATH=data/flagduel.sqlite STATS_KEY=un-indirizzo-a-mia-scelta npm start
```

`STATS_KEY` accetta da 1 a 100 caratteri alfanumerici, trattini o underscore; lasciandola vuota si usa la chiave salvata, oppure se ne genera una nuova. Una modifica della chiave richiede il riavvio del server. Senza Docker, Node non carica automaticamente `.env`: esportare le variabili nella shell. `PORT` e `HOST` mantengono il funzionamento esistente.

Il DB di default è `data/flagduel.sqlite`, escluso da Git, dal contesto Docker e dalla cartella pubblica. Non vengono inserite partite dimostrative nel database reale: la raccolta comincia dalle nuove mani giocate con questo branch.

## Dati raccolti

SQLite usa il modulo incorporato `node:sqlite`, senza dipendenze native npm aggiuntive. Il server apre una sola connessione per processo, con WAL, foreign key e transazioni. Una mossa accettata viene registrata prima di confermarla al client; lo stato della partita non viene modificato dalla raccolta statistica.

| Tabella | Contenuto |
| --- | --- |
| `rounds` | Identità univoca della mano e della stanza logica, numero mano, bandiera estratta, gioco singolo/PvP, Color Shift, No Memory, tolleranza effettiva, limite sonde o NULL, versione/dimensione del catalogo, partecipante che comincia, vincitore e giocatore che ha risposto, stato e risultato, conteggi, date. |
| `moves` | Sequenza delle mosse accettate: sonda, definitiva, passaggio, proposta/accordo di patta, rifiuto/ritiro; bandiera scelta, posizione G1/G2, corrispondenza con la segreta e data. |
| `flags` | Codice e nome leggibile delle bandiere. |
| `catalog_entries` | Bandiera disponibile in ogni versione del catalogo, per calcolare le occorrenze attese. |
| `metadata` | Chiave dell'indirizzo e metadati interni. |

Le posizioni G1/G2 sono relative alla **mano**, non all'ordine di ingresso nella stanza: G1 è chi gioca per primo quella volta. Il vincitore e l'autore di una definitiva possono essere diversi. In caso di definitiva sbagliata, l'autore perde, l'avversario vince e la bandiera rimane **non indovinata**.

La flag `found` indica 1 quando la bandiera è stata trovata e 0 nelle conclusioni senza soluzione. `outcome` precisa il metodo:

| `outcome` | Significato | `found` | Vincitore |
| --- | --- | --- | --- |
| `probe_correct` | Sonda esatta | 1 | Autore della sonda |
| `solve_correct` | Definitiva corretta | 1 | Autore della risposta |
| `solve_wrong` | Definitiva sbagliata | 0 | Avversario |
| `probe_limit` | Sonde esaurite | 0 | Nessuno |
| `draw` | Patta | 0 | Nessuno |

Sonde e definitive sono entrambe tentativi di indovinare: `guesses_count = probes_count + definitive_count`. La pagina mostra anche la media delle sole sonde, così la scelta della convenzione rimane esplicita. In PvP una mano può consumare sei sonde e una settima scelta come definitiva.

I comandi rifiutati e i reinvii dello stesso comando non generano nuove mosse o estrazioni. Refresh e riconnessione non duplicano la mano. Ogni istanza di stanza ha un'identità casuale distinta dal codice breve: riusare un codice stanza non mescola partite diverse. Non vengono salvati nickname, IP, token di sessione o identità persistenti dei giocatori.

## Mani non concluse e persistenza

Una mano entra nel DB quando viene estratta la bandiera, anche se nessuno invia una sonda. La registrazione progressiva conserva le scelte già fatte se poi la partita viene lasciata.

- `in_progress`: ancora in corso, oppure stanza disconnessa recuperabile.
- `completed`: ha un esito di gioco definito, comprese patte e limite sonde.
- `abandoned`: stanza eliminata dal cleanup dopo oltre un'ora con tutti i giocatori disconnessi. Una semplice disconnessione non basta, perché potrebbe essere un refresh.
- `interrupted`: mano rimasta aperta al precedente arresto del server; viene marcata all'avvio successivo. Le vecchie mosse rimangono consultabili.

Le sessioni e le stanze di gioco rimangono in RAM, come prima; il DB conserva le statistiche, non ripristina una partita dopo il riavvio. Usare un solo processo server attivo per questo DB: il recupero delle mani interrotte presume che l'istanza precedente non sia ancora in esecuzione.

Un errore di inizializzazione del DB impedisce l'avvio. Un errore di scrittura durante una partita viene segnalato nel log e nel pannello statistico e non blocca le mosse del gioco. In quel caso la raccolta può essere incompleta: la pagina mostra il numero di errori di scrittura dell'istanza corrente. Le transazioni impediscono registrazioni parziali della singola operazione; non viene promessa una coda di recupero dei dati che il filesystem non ha accettato.

## Configurazioni e filtri

La pagina filtra per singolo/PvP, nessun esperimento/Color Shift/No Memory/entrambi, tolleranza, limite di sonde, versione del catalogo e intervallo delle date di inizio mano. Le date dei filtri sono in UTC, entrambe incluse; le date nelle righe sono visualizzate nel fuso locale del browser.

La tabella **Configurazioni registrate** elenca i gruppi esatti; “Analizza” imposta tutti i filtri della riga, mantenendo le date. Così non si confondono, per esempio, No Memory con Color Shift o partite a limiti differenti. I filtri rimangono nell'URL e vengono ripristinati ricaricando la pagina. Scegliendo “Tutti” è possibile ottenere aggregati, ma per confrontare la difficoltà conviene usare gruppi omogenei.

## Come leggere le statistiche

| Statistica | Denominatore o campione |
| --- | --- |
| Occorrenza di una bandiera | Tutte le estrazioni filtrate, incluse quelle poi abbandonate/interrotte/in corso. |
| Occorrenza attesa | Per ciascuna estrazione si attribuisce probabilità `1 / dimensione catalogo` alle bandiere allora disponibili; si sommano le attese. |
| Non indovinata | Mani concluse con `found=0` / mani concluse della bandiera. Include errore definitivo, limite e patta. |
| Media tentativi delle risolte | Sonde + eventuale definitiva, soltanto nelle mani con `found=1`. Il relativo N è mostrato. |
| Media sonde delle risolte | Come sopra, contando soltanto le sonde. |
| Media tentativi delle concluse | Tutte le mani concluse, anche quelle non risolte; indica sforzo speso, non tentativi necessari per trovare una soluzione mai raggiunta. |
| Vince G1/G2, tutte le concluse | Vittorie della posizione / mani PvP concluse; le mani senza vincitore rimangono nel denominatore. |
| Vince G1/G2, con vincitore | Vittorie della posizione / sole mani PvP decisive. |
| Vittoria con sonda/definitiva corretta | Vittorie di quel tipo / vittorie del campione selezionato. |
| Vittoria per errore avversario | Vittorie dopo una definitiva sbagliata dell'altro giocatore / vittorie del campione. |
| Sconfitta per definitiva sbagliata | Definitive sbagliate / tutte le sconfitte PvP decisive (una sconfitta per ogni mano con vincitore). |
| Errore sulle definitive | Definitive sbagliate / tutte le definitive inviate. |

Le probabilità condizionate mostrate sono `P(metodo di vittoria | vince G1)` e `P(metodo di vittoria | vince G2)`, con conteggi e denominatori. Se vince G1 a causa di una definitiva sbagliata, a perderla è G2; viceversa se vince G2. Il singolo è escluso dalle metriche di posizione.

Escludere le mani non risolte dalla media ha senso **se la si chiama media condizionata al successo**. Non stima però il numero medio di tentativi necessario su tutte le bandiere: nelle mani interrotte o finite senza soluzione quel numero non è osservato. La pagina affianca quindi insuccessi, N, media dello sforzo su tutte le concluse e distribuzione dei tentativi, senza imputare arbitrariamente zero o il limite alle soluzioni mancanti. Abbandoni e interruzioni non vengono classificati automaticamente come sconfitte.

Valori senza osservazioni sono mostrati come “—”, non come 0%. Le frequenze osservate non dimostrano da sole uno sbilanciamento: numerosità, abilità dei giocatori, aperture preferite e modalità influenzano i risultati. Non vengono prodotti p-value o classifiche di “bandiere sbilanciate” da piccoli campioni.

## Bandiere scelte dai giocatori

La classifica esplicita distingue totale scelte, sonde e definitive, ciascuno con conteggio e percentuale sul proprio totale filtrato. Include le scelte delle mani non concluse, altrimenti le aperture delle mani abbandonate sparirebbero dai dati. Una sonda e una definitiva sullo stesso Paese sono due scelte distinte; reinviare il medesimo comando non conta due volte.

Le **prime sonde** hanno una classifica separata: ciascuna mano con almeno una sonda contribuisce una volta. La popolarità di una bandiera non implica che sia una buona apertura; il DB permette analisi successive dell'esito condizionato alla prima sonda.

Sono inclusi anche mediana dei tentativi delle risolte, istogramma risolte/non risolte, conteggi separati per patte/limiti/definitive errate, cronologia delle mani paginata e dettaglio della sequenza delle scelte. Il CSV esporta tutte le righe per bandiera con i filtri correnti, non soltanto quelle visibili dopo la ricerca testuale.

## Docker e backup

```sh
docker compose up --build -d
docker compose exec app npm run stats:url
docker compose logs app
```

Compose monta il volume nominato `statistics-data` su `/app/data`; il file è `/app/data/flagduel.sqlite`. Il volume sopravvive al normale `docker compose down` e alla ricostruzione dell'immagine. `docker compose down -v` rimuove invece anche i dati. Gli UID della directory sono preparati nell'immagine per l'utente `node`.

Per un backup locale coerente a server acceso, con il programma `sqlite3` disponibile:

```sh
mkdir -p backups
sqlite3 data/flagduel.sqlite ".backup backups/flagduel-backup.sqlite"
```

Non copiare soltanto il file principale mentre il server sta scrivendo: WAL può contenere transazioni recenti. Fermando il server si possono conservare insieme DB e relativi sidecar; per un backup live usare l'API SQLite o `.backup`. Il CSV è utile per analizzare le metriche, ma non sostituisce il backup completo di mani e mosse.

Esempi di interrogazione del file:

```sql
SELECT secret, COUNT(*) AS estrazioni FROM rounds GROUP BY secret;
SELECT outcome, winner_order, COUNT(*) FROM rounds
WHERE status='completed' AND mode='pvp' GROUP BY outcome,winner_order;
SELECT country, kind, COUNT(*) FROM moves
WHERE kind IN ('probe','solve') GROUP BY country,kind ORDER BY COUNT(*) DESC;
```

## Verifiche

- 68 test unitari/integrati: dataset con risultati calcolati a mano, denominatori, mediane, classifiche, condizionate, tutte le otto combinazioni gioco/esperimenti, filtri, idempotenza, SQL/CSV, file persistente, ripristino della chiave e mani interrotte.
- 13 scenari browser passati su Chromium e 13 su Firefox, compresa la pagina dedicata, i filtri persistiti nell'URL, classifica delle scelte, dettagli delle mosse, export CSV, stati vuoti e layout mobile.
- Server compilato e API SQLite verificati con Node 24.22.3, oltre a Node 26.13.0 del Mac.
- Build e TypeScript strict riusciti. Docker non è disponibile nell'ambiente di sviluppo: configurazione e runtime Node 24 sono verificati, il container Linux va ancora avviato sul server.

Riferimento dell'API utilizzata: [documentazione ufficiale Node.js SQLite](https://nodejs.org/api/sqlite.html). Nessuna nuova dipendenza npm è necessaria.
