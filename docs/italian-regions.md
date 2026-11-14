# Extra: Regioni italiane

Branch `feat/italian-regions`, creato da `feat/experimental-modes` al commit `1c6940f`.

## Uso

Il creatore apre **Impostazioni avanzate → Extra → Regioni italiane** nella lobby. Spento: 195 Stati ONU/Osservatori. Acceso: soltanto le 20 regioni italiane. La scelta è indipendente da singolo/PvP, tolleranza, Color Shift e No Memory. L'ospite la legge nel riepilogo della lobby; soltanto il creatore può cambiarla e soltanto prima dell'avvio. Il server mantiene catalogo e opzioni dopo refresh/riconnessione e nelle mani successive.

Le regole restano le stesse: sei tentativi senza esperimenti, tentativi senza tetto se almeno un esperimento è attivo, divieto di ripetizione, punteggio cumulativo, risposta finale e passaggio in PvP, patta concordata soltanto durante mani sperimentali. Province, comuni e province autonome come voci autonome non sono aggiunti.

## Architettura

Il protocollo aggiunge `catalogSet: world | italian_regions` allo snapshot e il comando `set_catalog`. Gli identificatori dei Paesi rimangono di due lettere; quelli regionali usano `it-XX`. Il campo wire `country` è mantenuto per compatibilità, con validazione estesa esclusivamente a quel formato. Il server respinge una bandiera appartenente a un altro catalogo, anche se il client la invia manualmente.

`Game.catalog` restituisce il catalogo attivo della stanza. La selezione casuale pesca da questo insieme, non dal totale degli asset. Gli esperimenti continuano a usare le stesse regole e lo stesso motore geometrico. `/api/catalog` mantiene il catalogo mondiale come default; `/api/catalog?set=italian_regions` restituisce le 20 regioni senza geometrie interne. Gli SVG rimangono disponibili su `/api/flags/it-XX.svg`. Il frontend ricarica l'elenco al cambio di catalogo e scarta le risposte di richieste ormai obsolete.

La fixture E2E usa Lombardia come soluzione regionale e Bangladesh come soluzione mondiale. Solo nella fixture il limite di creazione stanze è 64/minuto per permettere l'intera suite; la produzione conserva 12/minuto.

## Asset e adattamenti

Originali, hash SHA-1, autori, licenze e URL di provenienza sono in [assets/regions](../assets/regions/README.md). Le fonti sono Wikimedia Commons; per Emilia-Romagna è scelta la variante de facto, per Umbria quella de jure. Gli originali sono conservati byte per byte e non vengono scaricati a runtime o durante la build.

I file a colori piatti e il catalogo generato derivano dagli stessi tracciati SVG. La normalizzazione applica le classi CSS, conserva i riferimenti locali e rimuove metadati editor. In Campania e Veneto le sfumature sono sostituite con uno stop centrale; nel Veneto le semitrasparenze diventano opache e gli otto microtesti SVG sono rimossi. Le altre scritte già convertite in tracciati restano presenti. Le superfici finali sono convertite in segmenti vettoriali con tolleranza 0,03 pixel nel formato 300×200. Non vengono rasterizzate per il confronto di gioco.

Il report `assets/generated/regions-report.json` elenca gli adattamenti per ciascuna bandiera. La copertura è stimata con test geometrici sui centri delle 60.000 celle del riquadro; i bounds dei tracciati sono controllati separatamente. Questo indicatore non viene usato dal gioco e non è presentato come area analitica esatta degli stemmi complessi. Il confronto delle bandiere resta basato su operazioni booleane vettoriali e OKLab.

Il preprocessamento usa cache verificate rispetto a sorgente normalizzata, versione del motore e versione di compattazione. Aggiornamenti incompleti falliscono senza sostituire il catalogo precedente; il catalogo completo viene promosso con rinomina atomica. Una ricostruzione integrale di alcuni stemmi può richiedere minuti; le normali build usano i risultati verificati inclusi nel repository. La cache grezza `.cache/regions/` è esclusa sia da Git sia dal contesto Docker.

Alcune sorgenti sono in pubblico dominio, altre CC BY-SA 3.0/4.0. Le versioni derivate conservano la licenza del singolo asset; il codice resta MIT. `npm run licenses` include attribuzioni e testi integrali negli avvisi distribuiti nel frontend e in Docker.

## Verifiche eseguite

- 67 test unitari/integrati: corpus completo e hash, self-match geometrico, cataloghi isolati, permessi host, passaggio reversibile in lobby, persistenza, vittoria, punteggi, patta e tutte le combinazioni singolo/PvP/esperimenti. API e riconnessione verificate con Socket.IO reale.
- 14 scenari Playwright passati sia su Chromium sia su Firefox, incluse partite regionali in singolo e PvP combinato con entrambi gli esperimenti, toggle reversibile, riepilogo ospite, refresh, filtro delle risposte e passaggio al round successivo.
- Audit visivo: per tutti i 195 Stati e tutte le 20 regioni il disaccordo sui pixel interni fra SVG di riferimento e geometria generata rimane sotto lo 0,5%. Sulle regioni il caso massimo misurato è il Lazio, circa 0,41% dei pixel interni.
- Confronto aggiuntivo originali/normalizzati: sulle sorgenti prive di adattamenti cromatici si mantiene la soglia 0,5% dei pixel interni. Per Campania e Veneto, che cambiano intenzionalmente sfumature/opacità, la variazione ammessa è sotto il 5% dell'intero riquadro. Misurato: Campania 0%, Veneto 4,86% del riquadro; le sagome rimangono riconoscibili. Queste soglie e le immagini di confronto sono esplicite nel test, non un'esenzione silenziosa.
- Benchmark locale su cinque coppie di stemmi complessi: circa 0,36–0,65 secondi per una sonda sul Mac usato durante lo sviluppo. Non è una garanzia prestazionale per altri server.
- Build, TypeScript strict e confezionamento delle 154 attribuzioni riusciti. Docker/Linux e tastiera nativa Android non sono stati rieseguiti/verificati fisicamente per questa estensione.

Per provare: `npm run build`, quindi riavviare `npm start` e ricaricare i browser. Il server mantiene le stanze in memoria: dopo un riavvio occorre crearne una nuova. Avvio Docker invariato: `docker compose up --build -d`.
