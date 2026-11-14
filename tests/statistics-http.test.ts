import { it, expect, vi } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { readFileSync } from "node:fs";
import { createApp } from "../apps/server/src/index";
import { Game, type Flag } from "../apps/server/src/game";
import type { Ack, Command } from "../packages/shared/src/index";
const catalog: Flag[] = JSON.parse(
  readFileSync("assets/generated/catalog.json", "utf8"),
);
let n = 0;
const send = (s: Socket, c: Partial<Command>) =>
  new Promise<Ack>((resolve) =>
    s.emit("command", { actionId: `stats-http-${++n}`, ...c }, resolve),
  );
it("Socket.IO registra una sola volta; pagina e dati richiedono l'URL dedicato", async () => {
  const { http, io, rooms, statistics, cleanupRooms } = createApp(
    catalog,
    (code) =>
      new Game(
        code,
        catalog,
        undefined,
        () => 0,
        () => 0,
      ),
    { statsKey: "test-statistics-route" },
  );
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const sockets: Socket[] = [];
  const connect = async () => {
    const s = client(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    sockets.push(s);
    await new Promise<void>((r) => s.on("connect", r));
    return s;
  };
  try {
    const a = await connect(),
      b = await connect();
    const created = await send(a, {
      type: "create",
      nickname: "DoNotStore-Ada",
    });
    await send(b, {
      type: "join",
      nickname: "DoNotStore-Bruno",
      code: created.state!.code,
    });
    const g = rooms.get(created.state!.code)!;
    expect(statistics.summary().totals.draws).toBe(0);
    await send(a, { type: "start", version: g.version });
    const firstVersion = g.version;
    const command = {
      type: "probe" as const,
      country: catalog[1].code,
      version: firstVersion,
      actionId: "same-real-command",
    };
    expect((await send(a, command)).ok).toBe(true);
    expect((await send(a, command)).ok).toBe(true);
    expect(
      (await send(b, { type: "solve", country: g.secret, version: g.version }))
        .ok,
    ).toBe(false);
    await send(a, { type: "solve", country: g.secret, version: g.version });
    expect(statistics.summary().totals).toMatchObject({
      draws: 1,
      completed: 1,
      found: 1,
      meanGuessesFound: 2,
    });
    const prefix = statistics.accessPath;
    expect((await fetch(url + "/api/stats")).status).toBe(404);
    expect((await fetch(url + "/stats.html")).status).toBe(404);
    expect((await fetch(url + "/insights/incorrect/api/summary")).status).toBe(
      404,
    );
    expect((await fetch(url + "/data/flagduel.sqlite")).status).toBe(404);
    const page = await fetch(url + prefix);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Statistiche");
    expect(page.headers.get("cache-control")).toBe("no-store");
    const summary = await fetch(
      url + prefix + "/api/summary?mode=pvp&experiment=standard&tolerance=0.04",
    ).then((r) => r.json());
    expect(summary.totals.completed).toBe(1);
    expect(summary.selections).toHaveLength(2);
    const rounds = await fetch(url + prefix + "/api/rounds").then((r) =>
      r.json(),
    );
    expect(rounds.total).toBe(1);
    const detail = await fetch(
      url + prefix + "/api/round/" + encodeURIComponent(rounds.rows[0].id),
    ).then((r) => r.json());
    expect(detail.moves.map((m: { kind: string }) => m.kind)).toEqual([
      "probe",
      "solve",
    ]);
    expect(JSON.stringify(detail)).not.toContain("DoNotStore");
    expect(JSON.stringify(detail)).not.toContain(created.token);
    const csv = await fetch(url + prefix + "/countries.csv");
    expect(csv.headers.get("content-disposition")).toContain(".csv");
    expect(await csv.text()).toContain("meanGuessesFound");
    expect(
      (await fetch(url + prefix + "/api/summary?from=2026-02-30")).status,
    ).toBe(400);
    expect((await fetch(url + prefix + "/api/round/unknown")).status).toBe(404);
    const resumed = await connect();
    a.disconnect();
    const restored = await send(resumed, {
      type: "resume",
      token: created.token,
    });
    expect(restored.ok).toBe(true);
    expect(statistics.summary().totals.draws).toBe(1);
    await send(resumed, { type: "ready", version: g.version });
    await send(b, { type: "ready", version: g.version });
    expect(statistics.summary().totals.draws).toBe(2);
    g.players.forEach((p) => {
      p.connected = false;
    });
    g.touched = Date.now() - 3600001;
    cleanupRooms();
    expect(statistics.summary().totals.abandoned).toBe(1);
    expect(rooms.size).toBe(0);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((r) => io.close(() => r()));
  }
}, 20000);

it("un errore SQLite è segnalato e non blocca la mossa del giocatore", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const { http, io, rooms, statistics } = createApp(
    catalog,
    (code) =>
      new Game(
        code,
        catalog,
        undefined,
        () => 0,
        () => 0,
      ),
    { statsKey: "write-error-test" },
  );
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const socket = client(
    `http://127.0.0.1:${(http.address() as { port: number }).port}`,
    { forceNew: true, reconnection: false, transports: ["websocket"] },
  );
  try {
    await new Promise<void>((r) => socket.on("connect", r));
    const created = await send(socket, { type: "create", nickname: "Solo" });
    const g = rooms.get(created.state!.code)!;
    await send(socket, { type: "set_mode", mode: "solo", version: g.version });
    await send(socket, { type: "start", version: g.version });
    statistics.db.exec(
      "CREATE TRIGGER fail_move BEFORE INSERT ON moves BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END",
    );
    const accepted = await send(socket, {
      type: "probe",
      country: catalog[1].code,
      version: g.version,
    });
    expect(accepted.ok).toBe(true);
    expect(g.history).toHaveLength(1);
    expect(statistics.writeErrors).toBe(1);
    expect(errorLog).toHaveBeenCalled();
    expect(
      statistics.detail(statistics.rounds().rows[0].id)!.moves,
    ).toHaveLength(0);
    expect(statistics.rounds().rows[0].probes_count).toBe(0);
  } finally {
    socket.disconnect();
    await new Promise<void>((r) => io.close(() => r()));
    errorLog.mockRestore();
  }
}, 10000);
