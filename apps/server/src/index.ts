import express from "express";
import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Server } from "socket.io";
import { z } from "zod";
import { commandSchema, type Ack } from "../../../packages/shared/src/index";
import { Game, defaults, type Flag } from "./game";
import { reveal, area } from "../../../packages/flag-engine/src/index";
const envInt = (n: string, d: number) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(3600000)
    .parse(process.env[n] ?? d);
const config = {
  maxProbes: envInt("MAX_PROBES", defaults.maxProbes),
  tolerance: z.coerce
    .number()
    .min(0)
    .max(1)
    .parse(process.env.TOLERANCE ?? 0.04),
};
export function createApp(
  catalog: Flag[] = JSON.parse(
    readFileSync("assets/generated/catalog.json", "utf8"),
  ),
  makeGame: (code: string) => Game = (code) => new Game(code, catalog, config),
) {
  const app = express(),
    http = createServer(app),
    io = new Server(http, { maxHttpBufferSize: 8192 });
  const rooms = new Map<string, Game>();
  const sessions = new Map<
    string,
    { code: string; id: string; socket: string }
  >();
  const bindings = new Map<string, string>();
  const rates = new Map<string, { n: number; until: number }>();
  function allowed(key: string, limit: number) {
    const now = Date.now();
    let r = rates.get(key);
    if (!r || now > r.until) {
      r = { n: 0, until: now + 60000 };
      rates.set(key, r);
    }
    return ++r.n <= limit;
  }
  app.use(express.json({ limit: "4kb" }));
  app.get("/health", (_, res) => res.json({ ok: true }));
  app.get("/api/catalog", (_, res) =>
    res.json(
      catalog.map(({ code, name, en }) => ({
        code,
        name,
        en,
        svg: `/api/flags/${code}.svg`,
      })),
    ),
  );
  app.get("/api/flags/:code.svg", (req, res) => {
    const flag = catalog.find((f) => f.code === req.params.code);
    if (!flag) {
      res.sendStatus(404);
      return;
    }
    res.type("image/svg+xml").send(flag.svg);
  });
  if (process.env.NODE_ENV !== "production") {
    app.get("/api/report", (_, res) =>
      res.json(
        JSON.parse(readFileSync("assets/generated/report.json", "utf8")),
      ),
    );
    app.post("/api/lab", (req, res) => {
      const parsed = z
        .object({
          a: z.string(),
          b: z.string(),
          tolerance: z.number().min(0).max(1),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Input non valido" });
        return;
      }
      const a = catalog.find((f) => f.code === parsed.data.a),
        b = catalog.find((f) => f.code === parsed.data.b);
      if (!a || !b) {
        res.sendStatus(400);
        return;
      }
      const regions = reveal(a.regions, b.regions, [], parsed.data.tolerance);
      res.json({
        regions,
        area: area(regions),
        report:
          "Solo regioni vettoriali a colore piatto; elementi non supportati esclusi.",
      });
    });
  }
  app.use(express.static(path.resolve("apps/web/dist")));
  app.get("/", (_, res) =>
    res.sendFile(path.resolve("apps/web/dist/index.html")),
  );
  const broadcast = (g: Game) => {
    const state = g.snapshot();
    for (const s of sessions.values())
      if (s.code === g.code)
        io.sockets.sockets.get(s.socket)?.emit("state", state);
  };
  io.on("connection", (socket) => {
    socket.on("command", (raw: unknown, ack: (a: Ack) => void) => {
      if (typeof ack !== "function") return;
      try {
        const boundToken = bindings.get(socket.id);
        if (
          !allowed("cmd-ip:" + socket.handshake.address, 600) ||
          !allowed("cmd:" + socket.id, 120) ||
          (boundToken && !allowed("cmd-session:" + boundToken, 120))
        )
          throw Error("Troppi comandi: attendi");
        const c = commandSchema.parse(raw);
        let token = bindings.get(socket.id),
          session = token ? sessions.get(token) : undefined;
        let game: Game | undefined;
        if (["create", "join", "resume"].includes(c.type)) {
          if (session) throw Error("Sessione già associata");
          if (c.type === "resume") {
            session = c.token ? sessions.get(c.token) : undefined;
            if (!session) throw Error("Sessione scaduta");
            game = rooms.get(session.code);
            if (!game) throw Error("Stanza scaduta");
            if (session.socket && session.socket !== socket.id) {
              const old = io.sockets.sockets.get(session.socket);
              bindings.delete(session.socket);
              old?.disconnect(true);
            }
            session.socket = socket.id;
            token = c.token;
            const p = game.players.find((p) => p.id === session!.id)!;
            p.connected = true;
            game.version++;
          } else {
            if (!c.nickname) throw Error("Nickname obbligatorio");
            if (c.type === "create") {
              if (
                !allowed("create:" + socket.handshake.address, 12) ||
                rooms.size >= 500
              )
                throw Error("Limite creazione stanze");
              let code: string;
              do {
                const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                code = Array.from(
                  { length: 3 },
                  () => alphabet[randomInt(alphabet.length)],
                ).join("");
              } while (rooms.has(code));
              game = makeGame(code);
              rooms.set(code, game);
            } else {
              game = c.code ? rooms.get(c.code) : undefined;
              if (!game) throw Error("Stanza inesistente");
            }
            const p = game.add(c.nickname);
            token = randomBytes(32).toString("hex");
            session = { code: game.code, id: p.id, socket: socket.id };
            sessions.set(token, session);
          }
          bindings.set(socket.id, token!);
          ack({
            ok: true,
            token,
            playerId: session.id,
            state: game.snapshot(),
          });
          broadcast(game);
        } else {
          if (!session) throw Error("Sessione non autorizzata");
          game = rooms.get(session.code)!;
          game.command(session.id, c);
          ack({ ok: true, state: game.snapshot() });
          broadcast(game);
        }
      } catch (e) {
        ack({
          ok: false,
          error:
            e instanceof z.ZodError
              ? "Richiesta non valida"
              : (e as Error).message,
        });
        const token = bindings.get(socket.id),
          s = token ? sessions.get(token) : undefined;
        if (s) {
          const g = rooms.get(s.code);
          if (g) broadcast(g);
        }
      }
    });
    socket.on("disconnect", () => {
      const token = bindings.get(socket.id);
      bindings.delete(socket.id);
      const s = token ? sessions.get(token) : undefined;
      if (s && s.socket === socket.id) {
        s.socket = "";
        const g = rooms.get(s.code);
        if (g) {
          g.players.find((p) => p.id === s.id)!.connected = false;
          g.version++;
          g.touched = Date.now();
          broadcast(g);
        }
      }
    });
  });
  const cleanup = setInterval(() => {
    for (const [code, g] of rooms) {
      if (
        g.players.every((p) => !p.connected) &&
        Date.now() - g.touched > 3600000
      ) {
        rooms.delete(code);
        for (const [t, s] of sessions) if (s.code === code) sessions.delete(t);
      }
    }
    for (const [key, r] of rates) if (Date.now() > r.until) rates.delete(key);
  }, 30000);
  cleanup.unref();
  http.on("close", () => clearInterval(cleanup));
  return { app, http, io, rooms };
}
if (process.env.NODE_ENV !== "test") {
  const { http } = createApp();
  http.listen(
    Number(process.env.PORT ?? 8080),
    process.env.HOST ?? "0.0.0.0",
    () =>
      console.log(
        "Flag Duel HTTP pronto sulla porta " + (process.env.PORT ?? 8080),
      ),
  );
}
