import { readFileSync } from "node:fs";
import { Statistics } from "../apps/server/src/statistics";
import type { Flag } from "../apps/server/src/game";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
const statistics = new Statistics(
  process.env.STATS_DB_PATH ?? "data/flagduel.sqlite",
  catalog,
  process.env.STATS_KEY,
);
console.log("Database: " + statistics.filename);
console.log(
  "Pagina: http://localhost:" +
    (process.env.PORT ?? 8080) +
    statistics.accessPath,
);
statistics.close();
