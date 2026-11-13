// Fixture deterministica solo per test: nessun endpoint o seed esposto ai browser.
import { readFileSync } from "node:fs";
import { createApp } from "../apps/server/src/index";
import { Game, defaults, type Flag } from "../apps/server/src/game";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
process.env.NODE_ENV = "production";
const { http } = createApp(
  catalog,
  (code) =>
    new Game(
      code,
      catalog,
      defaults,
      () => catalog.findIndex((f) => f.code === "bd"),
      () => 0,
    ),
);
http.listen(8080, "127.0.0.1");
