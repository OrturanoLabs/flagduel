// Fixture deterministica solo per test: nessun endpoint o seed esposto ai browser.
import { readFileSync } from "node:fs";
import { createApp } from "../apps/server/src/index";
import { Game, defaults, type Flag } from "../apps/server/src/game";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
process.env.NODE_ENV = "production";
const regionalCatalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/regions-catalog.json", "utf8"),
);
const { http } = createApp(
  catalog,
  (code) => {
    let game: Game;
    game = new Game(
      code,
      catalog,
      defaults,
      () =>
        game.catalog.findIndex(
          (f) =>
            f.code === (game.catalogSet === "italian_regions" ? "it-25" : "bd"),
        ),
      () => 0,
      undefined,
      { italian_regions: regionalCatalog },
    );
    return game;
  },
  { maxCreatesPerMinute: 64 },
);
http.listen(Number(process.env.FLAG_DUEL_TEST_PORT ?? 8080), "127.0.0.1");
