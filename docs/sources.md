# Fonti e attribuzioni

## Asset bandiere

| Fonte                                                                                     | Versione importata | Uso                                                          | Licenza conservata                  |
| ----------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------ | ----------------------------------- |
| [lipis/flag-icons](https://github.com/lipis/flag-icons)                                   | 7.6.0, `flags/4x3` | Originali vendorizzati, 176 usati nella variante dettagliata | [MIT](../assets/flags/LICENSE)      |
| [catamphetamine/country-flag-icons](https://github.com/catamphetamine/country-flag-icons) | 1.6.20, `3x2`      | 19 varianti a colori piatti con stemmi semplificati          | [MIT](../assets/flags-flat/LICENSE) |

Gli asset sono presenti in `assets/flags/` e `assets/flags-flat/`; i colori della sorgente scelta sono conservati dal motore. Il [report](../assets/generated/report.json) indica per ogni Paese la sorgente effettiva e il motivo della variante. Il catalogo generato deriva da tali asset e ne conserva le condizioni di licenza, non viene attribuito interamente all’autore dell’app.

## Catalogo Stati

Il criterio operativo è l’appartenenza ai [193 Stati membri ONU](https://www.un.org/en/about-us/member-states), con i [due Stati osservatori](https://research.un.org/en/unmembers/observers), Santa Sede/Vaticano e Palestina. Il manifest locale è [un-states.json](../assets/metadata/un-states.json). I nomi per la ricerca sono prodotti da `Intl.DisplayNames`, con la denominazione italiana Palestina impostata esplicitamente.

## Metodo e strumenti

- [Paper.js — PathItem e operazioni booleane](https://paperjs.org/reference/pathitem/): geometria, trasformazioni e POC iniziale.
- [Skia / CanvasKit](https://skia.org/docs/user/modules/canvaskit/): PathOps e conversione dello stroke in contorni vettoriali. Versione npm `canvaskit-wasm` 0.42.0, BSD-3-Clause.
- [OKLab, Björn Ottosson](https://bottosson.github.io/posts/oklab/): spazio colore e conversione standard da sRGB lineare; confronto con distanza euclidea, senza cluster.
- [Lucide](https://lucide.dev/license): icone UI ISC, con avvisi MIT delle parti Feather conservati.
- Ispirazione del meccanismo di indizi: [Flagle Unlimited](https://flagle-game.com/unlimited).

Le versioni esatte delle dipendenze sono bloccate nel [package-lock](../package-lock.json). [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) elenca le licenze delle dipendenze di produzione e degli asset; [THIRD_PARTY_LICENSES.txt](../third_party/THIRD_PARTY_LICENSES.txt) conserva integralmente i testi originali, compresi copyright e disclaimer.

## Licenza del progetto e distribuzione

Il codice originale dell’app usa [MIT](../LICENSE). Questa scelta non sostituisce le licenze dei componenti esterni. Gli asset MIT ridistribuiti richiedono la conservazione degli avvisi; i componenti BSD/ISC/Apache conservano le condizioni dei testi inclusi.

I link sono forniti per tracciabilità; una mera citazione non sostituisce gli avvisi richiesti. La build include una copia degli avvisi nel frontend e nel container. `npm run licenses` rigenera gli avvisi dai pacchetti installati, senza scaricare testi a runtime.
