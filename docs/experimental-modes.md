# Modalità sperimentali

Le opzioni di stanza sono `experiments: { colorShift: boolean, noMemory: boolean }`, inizialmente entrambe false. `set_experiments` richiede entrambe le proprietà booleane, una versione valida e l'identità del creatore; è ammesso solo nella lobby. Il server valida il comando tramite Zod, aggiorna la versione e trasmette lo stesso snapshot ai partecipanti. La riconnessione recupera le opzioni e il round senza rigenerare la trasformazione.

| Color Shift | No Memory | Colori mostrati nel round | Indizio principale | Cronologia | Limite tentativi |
| --- | --- | --- | --- | --- | --- |
| No | No | Originali | Unione degli indizi | Bandiere e aree trovate | MAX_PROBES |
| Sì | No | Trasformati | Unione degli indizi | Solo nomi | Nessuno |
| No | Sì | Originali | Ultimo indizio | Solo nomi | Nessuno |
| Sì | Sì | Trasformati | Ultimo indizio | Solo nomi | Nessuno |

## Colori e geometria

`Game.next()` genera una trasformazione soltanto se Color Shift è abilitato: rotazione HSL casuale fra 45° e 315° e variazione della luminosità fra −0,06 e +0,06. La luminosità di base viene compressa nell'intervallo 0,08–0,92 prima della variazione, così anche bianco e nero cambiano aspetto. La generazione usa `node:crypto.randomInt` ed è indipendente dalla selezione della bandiera e del primo giocatore.

Il catalogo, i valori OKLab e `Game.revealed` conservano sempre i colori originali. `Game.snapshot()` trasforma esclusivamente i colori delle aree principali mentre la fase è `playing`. I parametri della trasformazione restano sul server; entrambi i client ricevono gli stessi colori già trasformati. Lo snapshot non contiene informazioni aggiuntive sulla bandiera segreta. In `between_rounds` gli indizi non sono più trasformati e il frontend mostra direttamente lo SVG originale della soluzione.

No Memory assegna all'indizio principale il risultato geometrico della singola sonda, inclusa la lista vuota in assenza di corrispondenze. Non usa la precedente unione. Senza No Memory il motore conserva il consueto accumulo.

## Cronologia e numero di tentativi

Con almeno un esperimento attivo lo snapshot mantiene `country` e `playerId` di ciascun tentativo ma manda `history[].reveal: []`: non basta nascondere le anteprime nel DOM, i vecchi indizi non vengono trasmessi. Il frontend mostra soltanto i nomi e conserva tutte le voci. La lista usa uno scroll interno e porta il nuovo tentativo in vista; i nomi precedenti restano raggiungibili scorrendo verso l'alto.

`Snapshot.maxProbes` è `null` per indicare l'assenza di limite; altrimenti mantiene il numero configurato. Il server ignora il tetto in tutti e tre i punti: invio della sonda, Passa in PvP e conclusione automatica in singolo. Non cambia le altre regole: un Paese non può essere ripetuto nel round, la sonda esatta vince, Risolvi sbagliato assegna il punto all'avversario e il primo giocatore si alterna. Il numero di Paesi distinti resta finito (195); non vengono introdotti tentativi ripetuti o Paesi esterni al catalogo.

## Patta

Nelle mani sperimentali `draw` è disponibile anche al giocatore che non è di turno. In PvP il primo comando salva l'identità del proponente in `Snapshot.drawOffer`. Un comando `draw` dell'altro giocatore conclude la mano con vincitore nullo e motivo `Patta`; ripetere la proposta dal medesimo giocatore non la accetta. `decline_draw` rifiuta la proposta oppure la ritira se chiamato dal proponente. In singolo `draw` conclude immediatamente la mano.

La proposta sopravvive alla riconnessione e rimane pendente finché viene accettata, rifiutata, ritirata o termina la mano. Le mosse normali restano possibili. Il server valida versione, identità, fase ed esperimenti attivi; la deduplicazione evita che due invii identici equivalgano a un accordo. A conclusione o all'avvio del nuovo round la proposta è azzerata; il punteggio non cambia e la soluzione è resa disponibile con i colori originali. Il frontend mostra una notifica sul menu e sullo stato del turno e offre Accetta/Rifiuta/Annulla proposta nel menu.

## Verifiche

- Test geometrici con SVG reali: strisce rosse/blu e sonde che rivelano metà sinistra, metà destra oppure nessuna area; tutte e quattro le combinazioni verificano accumulo, sostituzione e svuotamento, senza mutare il catalogo.
- Matrice singolo/PvP: comportamento standard al sesto tentativo, nove tentativi distinti con ciascun esperimento e con entrambi, divieto di ripetizione e vittoria successiva.
- Patta: accordo PvP, rifiuto/ritiro, proposta fuori turno, singolo immediato, punteggi conservati, rifiuto in modalità standard e fuori fase, idempotenza e versioni obsolete. Copertura anche tramite Socket.IO reale e browser.
- Trasformazione: colori validi, bianco/nero, stabilità durante il round, nuova generazione al round successivo e ritorno agli originali alla conclusione.
- Socket.IO reale: toggle indipendenti, host autorizzato, ospite respinto, rifiuto di payload malformati e modifiche dopo l'avvio; snapshot sincronizzati e rientro senza cambiare trasformazione o cronologia.
- Playwright: quattro combinazioni in singolo e PvP, riepilogo dell'ospite in sola lettura, riepilogo aggiornato, indizi condivisi, refresh, nove tentativi, nessuna immagine nella cronologia sperimentale, scroll interno senza scroll della pagina, soluzione originale e round successivo.

Risultati: build e TypeScript riusciti; 55 test unitari/integrati passati; 12 scenari Playwright passati su Chromium e 12 su Firefox. Nessuna dipendenza aggiuntiva. I browser desktop con viewport da smartphone non sostituiscono il test della tastiera nativa su Android. La verifica Docker/Linux non è stata ripetuta per questa modifica.

Per provare il branch localmente, eseguire `npm run build` e riavviare `npm start`, quindi ricaricare entrambi i browser. Stato e sessioni restano in RAM come nel gioco precedente: il riavvio del server richiede nuove stanze.
