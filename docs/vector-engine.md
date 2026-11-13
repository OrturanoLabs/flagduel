# Motore vettoriale e corpus ONU

## Implementazione corrente

Il POC iniziale di Paper.js ha verificato strisce, intersezioni/unioni e paint order. L'estensione a tutti i Paesi richiede anche contorni, clip e riferimenti. Il motore corrente affianca **Skia PathOps tramite CanvasKit WASM** a Paper.js: Skia converte stroke in superfici e calcola booleane; Paper.js costruisce forme semplici, applica matrici, misura aree e offre un fallback vettoriale se una booleana Skia non restituisce un risultato. Non vengono creati canvas o immagini nel calcolo di gioco; il modulo WASM è locale, installato da npm, e funziona senza rete anche su Linux.

Ogni SVG viene analizzato con jsdom senza caricare risorse esterne. Si risolvono `defs`/`use` locali, riferimenti ciclici, ereditarietà dei paint, trasformazioni annidate (`matrix`, `translate`, `scale`, `rotate`, `skewX/Y`), clipPath in coordinate utente, fill rule, rettangoli anche arrotondati, cerchi, ellissi, linee e poligoni. Lo stroke diventa un contorno nella geometria locale **prima** della trasformazione non uniforme: cap, join e miter sono conservati. Il viewBox viene stirato a 300×200. I clip ignorano correttamente il fill-opacity dei loro elementi, come richiesto dalla semantica SVG.

Il paint order viene risolto dal davanti verso il fondo: si sottrae la copertura delle forme successive e si uniscono le superfici visibili dello stesso colore. Le regioni canoniche usano esplicitamente **evenodd** nel motore e nel browser, preservando i fori degli stemmi senza una conversione di winding instabile. L'area viene calcolata sui contorni e sui loro annidamenti, senza griglie di campionamento. Le primitive curve hanno la precisione numerica delle librerie, non precisione simbolica; Skia usa coordinate float32. Le fixture semplici verificano scarti d'area entro 0,01 unità quadrate; per i corpus complessi si usa un massimo di 0,2 su un canvas da 60.000. Questa tolleranza geometrica è separata dalla soglia colore 0,04.

Conversione sRGB con gamma corretta → OKLab. I valori sono precalcolati per ogni colore originale; ΔEOK è inclusiva e non transitiva. Nessun clustering o quantizzazione: si rende il colore del file sorgente scelto per la segreta. Il reveal resta l'unione delle intersezioni ammesse. Le risorse Path WASM temporanee vengono liberate dopo ogni preprocessing/confronto.

## Copertura e varianti

Manifest: `assets/metadata/un-states.json`, 193 Stati membri ONU e due Stati osservatori (Santa Sede/Vaticano e Palestina). È una definizione operativa del catalogo, non una valutazione politica del riconoscimento bilaterale. Fonti: [ONU, membri](https://www.un.org/en/about-us/member-states), [ONU, osservatori](https://research.un.org/en/unmembers/observers).

Gli originali MIT `flag-icons` restano in `assets/flags/`. Per gli asset con gradienti, marker o casi geometrici non validati si usano originali alternativi MIT di `country-flag-icons` in `assets/flags-flat/`. **Queste varianti hanno stemmi semplificati**: non equivalgono a riproduzioni araldiche integrali. Non si approssimano silenziosamente i gradienti: il file effettivamente adottato e il motivo sono registrati in `assets/generated/report.json` (`assetPath`, `variant`, `originalLimitation`). Le licenze complete sono vendorizzate in entrambe le directory.

Il Nepal reale mantiene trasparente l'esterno della sagoma. Le bandiere indistinguibili rimangono nel catalogo; la vittoria automatica dipende dal codice Paese.

## Sicurezza e riproducibilità

Script, eventi, entità XML, foreignObject, immagini, testo, CSS esterno, URL di rete/filesystem e riferimenti esterni sono rifiutati. I riferimenti locali sono controllati per cicli e limiti. Gradienti, maschere, marker, clip objectBoundingBox e compositing semitrasparente non sono dichiarati supportati: il corpus adottato evita tali elementi tramite varianti piatte. L'output è composto solo da path, fill-rule e colori esadecimali.

`npm run preprocess` legge solo asset locali, verifica che tutti i 195 Paesi siano inclusi e fallisce se il catalogo è incompleto. La cache usa l'hash della sorgente e del codice del renderer; una modifica al motore forza il ricalcolo. Nessun asset viene scaricato a runtime. Il client carica solo metadati nel catalogo e le immagini pubbliche delle sonde/soluzioni quando servono. Non viene richiesta un'immagine specifica della segreta durante la mano.

## Test

Fixture geometriche con area nota, paint order, fori, path auto-intersecanti, stroke/cap, clipping con use, blocco di riferimenti attivi/ciclici, OKLab e colore originale. Il corpus verifica tutti i 195 codici, self-match, roundtrip SVG, monotonia con sonde rappresentative e diverse bandiere reali complesse.

Un test Playwright separato confronta il rendering browser della **sorgente scelta** con quello delle superfici preprocessate, per tutti i 195 asset. I pixel servono esclusivamente per questa verifica visiva: non entrano nel confronto di gioco, nel reveal o nella scelta del vincitore. Il test esclude un pixel attorno ai bordi della sorgente per tollerare l'antialias e produce `test-results/svg-visual-audit.json`. Non confronta le varianti semplificate con stemmi dettagliati che esse non pretendono di riprodurre.
