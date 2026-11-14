# Avvio, Docker e rete VPN

Per una prova sul Mac usare dalla root `npm run build` e poi `npm start`: il server ascolta su `0.0.0.0:8080` salvo configurazione esplicita di HOST/PORT. Da un altro dispositivo usare `http://IP_DEL_MAC:8080`. Per simulare due giocatori sul Mac usare profili/browser separati o una finestra privata.

## Docker su Linux e VPN

Sono necessari Docker Engine e il plugin Compose. I pacchetti e l'immagine base vengono scaricati durante la build; nessun download degli asset avviene durante la partita.

```sh
cp .env.example .env
# Impostare BIND_ADDRESS all'IP VPN del server nel file .env.
# Lasciare 127.0.0.1 per accesso solo locale.
docker compose up --build -d
docker compose ps
docker compose logs -f app
curl http://127.0.0.1:8080/health
```

Se BIND_ADDRESS è l'IP VPN, sostituire l'indirizzo anche nel comando curl. Dagli amici: `http://IP_VPN_DEL_SERVER:8080`, creare una stanza e condividere il link. La mappatura predefinita è `127.0.0.1:8080:8080`; il processo nel container ascolta `0.0.0.0:8080`. `PORT` configura la porta host in Compose, non quella interna. L'healthcheck usa la porta interna.

Verificare realmente da un secondo computer VPN che `/health` e la partita funzionino, e da una rete non autorizzata che la porta non sia raggiungibile. Controllare `docker compose config`, `docker compose ps`, le regole NAT/Docker e il firewall host: le porte Docker possono aggirare aspettative basate sul solo firewall. Non aprire né inoltrare porte sul router. HTTP non aggiunge TLS: la protezione del traffico dipende dalla VPN già configurata. Usare soltanto nickname e sessioni guest, senza password o dati personali.

```sh
docker compose down
docker compose up --build -d
```

Restart e rebuild azzerano tutte le partite. Una sola istanza Node mantiene stanze e sessioni in memoria; niente load balancing.

## Diagnostica e limiti residui

Se Socket.IO non si connette: aprire `/health` dal client, controllare IP VPN/BIND_ADDRESS e porta, verificare `/socket.io/?EIO=4&transport=polling`, controllare console browser e log Compose. Nessun redirect HTTPS né `wss` forzato. Un eventuale reverse proxy deve inoltrare anche polling e upgrade WebSocket; non è richiesto per questo prototipo.

Il rate limit è in memoria: 12 creazioni/minuto per indirizzo, 120 comandi/minuto per socket e sessione persistente, 600 per indirizzo, massimo 500 stanze. È una protezione moderata per il prototipo privato, non un servizio pubblico anti-abuso. Snapshot completi e operazioni geometriche sincrone sono adatti a un piccolo gruppo, senza garanzia di scalabilità. Non esistono persistenza, account, classifica, chat, spettatori, recupero di sessioni dopo cancellazione del localStorage o riavvio server. Il token locale è una credenziale guest: non condividerlo.

Prossimi passi: verificare il deploy Linux/VPN reale e misurare il carico prima di aumentare il numero di stanze.


## Dati statistici

Il DB SQLite predefinito è `data/flagduel.sqlite` su Mac/Linux e `/app/data/flagduel.sqlite` nel container. Compose lo conserva nel volume nominato `statistics-data`, anche ricreando il container. Dopo la build usare `npm run stats:url`, oppure `docker compose exec app npm run stats:url`, per leggere l'indirizzo privato della pagina. Nessun link viene aggiunto al gioco; chi possiede l'URL può vedere i dati senza login.

`STATS_DB_PATH` cambia il percorso locale; `STATS_KEY` sceglie la chiave dell'indirizzo. Lasciandola vuota il server genera e conserva una chiave nel DB. In Compose il percorso resta nel volume, mentre STATS_KEY può essere impostata in `.env`. Non usare `docker compose down -v` se si vogliono mantenere i dati. Per backup live usare SQLite `.backup`, non la copia isolata di un DB in WAL: [guida statistiche](statistics.md).
