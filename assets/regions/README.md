# Bandiere delle regioni italiane

Corpus opzionale di 20 regioni, tratto dagli SVG di Wikimedia Commons. Gli originali sono in `source/`, i file a colori piatti per il motore in `flat/`. Nessun download è necessario durante build o partita.

| Regione | Fonte | Licenza | Autore/i indicati su Commons |
| --- | --- | --- | --- |
| Abruzzo | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Abruzzo.svg) | Public domain | Booyabazooka |
| Basilicata | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Basilicata.svg) | Public domain | F l a n k e r |
| Calabria | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Calabria.svg) | Public domain | F l a n k e r / Coat of Arms taken from Image:Coat of arms of Calabria.svg |
| Campania | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Campania.svg) | Public domain | F l a n k e r |
| Emilia-Romagna | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Emilia-Romagna_(de_facto).svg) | CC BY-SA 4.0 | Gambo7 |
| Friuli-Venezia Giulia | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Friuli-Venezia_Giulia.svg) | Public domain | Unknown authorUnknown author |
| Lazio | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Lazio.svg) | Public domain | Flag_of_Lazio.png: User:Sinigagl derivative work: Serenthia |
| Liguria | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Liguria.svg) | Public domain | F l a n k e r |
| Lombardia | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Lombardy.svg) | Public domain | Pino Tovaglia, Bob Noorda, Roberto Sambonet and Bruno Munari |
| Marche | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Marche.svg) | Public domain | F l a n k e r |
| Molise | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Molise.svg) | Public domain | F l a n k e r |
| Piemonte | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Piedmont.svg) | Public domain | Orzetto |
| Puglia | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Apulia.svg) | CC BY-SA 3.0 | Angelus |
| Sardegna | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Sardinia,_Italy.svg) | CC BY-SA 3.0 | Angelus |
| Sicilia | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Sicily.svg) | Public domain | Angelo Romano |
| Toscana | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Tuscany.svg) | CC BY-SA 3.0 | Angelo Romano |
| Trentino-Alto Adige | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Trentino-South_Tyrol.svg) | Public domain | F l a n k e r |
| Umbria | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Umbria_(de_jure).svg) | CC BY-SA 4.0 | Ddurbmonnejg |
| Valle d'Aosta | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Valle_d%27Aosta.svg) | Public domain | F l a n k e r |
| Veneto | [SVG originale](https://commons.wikimedia.org/wiki/File:Flag_of_Veneto.svg) | CC BY-SA 3.0 | Derivative work: F l a n k e r |

Metadati integrali, autore, URL, licenza, timestamp e SHA-1 sono conservati in [manifest.json](manifest.json). Le versioni derivate mantengono la licenza del singolo asset, compresa CC BY-SA dove prevista. La licenza MIT del codice non sostituisce tali licenze. I testi CC BY-SA 3.0 e 4.0 sono conservati in `third_party/upstream/` e inclusi negli avvisi pubblici generati da `npm run licenses`.

## Scelte e adattamenti

- Una voce per ciascuna delle 20 regioni: non sono aggiunte le province autonome come regioni separate, né province o comuni.
- Per Emilia-Romagna è usata la variante de facto della galleria Commons; per Umbria la variante de jure. La scelta è esplicita nel nome del file sorgente.
- Rapporti normalizzati a 300×200 come il catalogo nazionale. Tracciati e stemmi rimangono vettoriali.
- Stili CSS incorporati e riferimenti SVG locali vengono risolti; i metadati editor non entrano nel gioco.
- Le sfumature della Campania e del Veneto sono sostituite con uno stop centrale a colore piatto; le semitrasparenze del Veneto sono rese opache.
- I microtesti del libro del leone veneto, inferiori a un pixel nel riquadro di gioco, sono rimossi perché il motore non gestisce testo/font. Le altre iscrizioni già convertite in tracciati sono conservate.
- Le curve delle superfici finali sono convertite in segmenti vettoriali con tolleranza 0,03 pixel e coordinate arrotondate a quattro decimali. Il confronto visivo è verificato automaticamente.
- Modifiche e copertura sono riportate per asset in `assets/generated/regions-report.json`. Nessuna regione viene esclusa in silenzio.

## Riproduzione

`python3 scripts/import-regions.py` è un importatore opzionale di manutenzione: recupera i file e verifica gli hash del manifest, rispettando i limiti di richiesta. La normale build non lo esegue.

`npx tsx scripts/preprocess-regions.ts` normalizza e verifica i 20 SVG. Riusa il catalogo generato solo se geometria sorgente, motore e versione di compattazione coincidono. La cache locale grezza in `.cache/regions/` è esclusa da Git e Docker. Una rielaborazione integrale degli stemmi complessi può richiedere diversi minuti; i risultati verificati sono vendorizzati per rendere rapide le build normali.
