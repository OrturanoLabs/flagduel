import { it, expect } from "vitest";
import { io as client, type Socket } from "socket.io-client";
import { createApp } from "../apps/server/src/index";
import type { Ack, Command, Snapshot } from "../packages/shared/src/index";
let n = 0;
const send = (s: Socket, c: Partial<Command>) =>
  new Promise<Ack>((resolve) =>
    s.emit("command", { actionId: "socket-action-" + ++n, ...c }, resolve),
  );
it("due client, terzo escluso, snapshot coerenti, ripristino identità e creatore", async () => {
  const { http, io, rooms } = createApp();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const addr = http.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;
  const connect = async () => {
    const s = client(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    await new Promise<void>((r) => s.on("connect", r));
    return s;
  };
  const sockets: Socket[] = [];
  try {
    const a = await connect(),
      b = await connect(),
      c = await connect();
    sockets.push(a, b, c);
    const created = await send(a, { type: "create", nickname: "Ada" });
    expect(created.ok).toBe(true);
    expect(created.state!.code).toMatch(/^[A-Z0-9]{3}$/);
    const joined = await send(b, {
      type: "join",
      nickname: "Bruno",
      code: created.state!.code,
    });
    expect(joined.ok).toBe(true);
    expect(
      (
        await send(c, {
          type: "join",
          nickname: "Terzo",
          code: created.state!.code,
        })
      ).ok,
    ).toBe(false);
    let g = rooms.get(created.state!.code)!;
    expect(
      (await send(b, { type: "start", version: g.version })).error,
    ).toContain("Solo il creatore");
    const start = await send(a, { type: "start", version: g.version });
    expect(start.ok).toBe(true);
    const active = g.active === created.playerId ? a : b;
    const inactive = active === a ? b : a;
    expect(
      (
        await send(inactive, {
          type: "probe",
          country: g.catalog.find((f) => f.code !== g.secret)!.code,
          version: g.version,
        })
      ).ok,
    ).toBe(false);
    const snapshots: Snapshot[] = [];
    a.on("state", (s) => (snapshots[0] = s));
    b.on("state", (s) => (snapshots[1] = s));
    const probe = await send(active, {
      type: "probe",
      country: g.catalog.find((f) => f.code !== g.secret)!.code,
      version: g.version,
    });
    expect(probe.state!.solution).toBeUndefined();
    await new Promise((r) => setTimeout(r, 40));
    expect(snapshots[0]).toEqual(snapshots[1]);
    const hostId = g.hostId;
    a.disconnect();
    await new Promise((r) => setTimeout(r, 30));
    const restored = await connect();
    sockets.push(restored);
    const resume = await send(restored, {
      type: "resume",
      token: created.token,
    });
    expect(resume.playerId).toBe(created.playerId);
    expect(resume.state!.hostId).toBe(hostId);
    expect(resume.state).not.toHaveProperty("deadline");
    expect(resume.state!.players).toHaveLength(2);
    expect((await fetch(url + "/health")).status).toBe(200);
    for (let i = 0; i < 120; i++)
      await send(restored, { type: "pass", version: 0 });
    restored.disconnect();
    const again = await connect();
    sockets.push(again);
    expect(
      (await send(again, { type: "resume", token: created.token })).ok,
    ).toBe(true);
    expect((await send(again, { type: "pass", version: 0 })).error).toContain(
      "Troppi comandi",
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((r) => io.close(() => r()));
  }
}, 15000);
it("singolo via Socket.IO: lobby, blocco ingressi, tentativo e rientro senza reset", async () => {
  const { http, io, rooms } = createApp();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const sockets: Socket[] = [];
  async function connect() {
    const s = client(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    sockets.push(s);
    await new Promise<void>((r) => s.on("connect", r));
    return s;
  }
  try {
    const a = await connect(),
      b = await connect();
    const created = await send(a, { type: "create", nickname: "Solo" });
    const mode = await send(a, {
      type: "set_mode",
      mode: "solo",
      version: created.state!.version,
    });
    expect(mode.state!.mode).toBe("solo");
    expect(
      (
        await send(b, {
          type: "join",
          nickname: "Ospite",
          code: created.state!.code,
        })
      ).error,
    ).toContain("singolo");
    const started = await send(a, {
      type: "start",
      version: mode.state!.version,
    });
    expect(started.ok).toBe(true);
    const g = rooms.get(created.state!.code)!;
    const wrong = g.catalog.find((f) => f.code !== g.secret)!.code;
    const probe = await send(a, {
      type: "probe",
      country: wrong,
      version: started.state!.version,
    });
    expect(probe.state!.subphase).toBe("choose_probe");
    expect(probe.state!.history).toHaveLength(1);
    expect(probe.state!.solution).toBeUndefined();
    a.disconnect();
    await new Promise((r) => setTimeout(r, 20));
    const restored = await connect();
    const resumed = await send(restored, {
      type: "resume",
      token: created.token,
    });
    expect(resumed.playerId).toBe(created.playerId);
    expect(resumed.state!.mode).toBe("solo");
    expect(resumed.state!.history).toEqual(probe.state!.history);
    expect(resumed.state!.players).toHaveLength(1);
    const solved = await send(restored, {
      type: "probe",
      country: g.secret,
      version: resumed.state!.version,
    });
    expect(solved.state!.phase).toBe("between_rounds");
    expect(solved.state!.players[0].score).toBe(1);
    const next = await send(restored, {
      type: "ready",
      version: solved.state!.version,
    });
    expect(next.state!.phase).toBe("playing");
    expect(next.state!.round).toBe(2);
    expect(next.state!.history).toHaveLength(0);
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((r) => io.close(() => r()));
  }
}, 15000);

it("esperimenti via Socket.IO: toggle sincronizzati, permessi e colori conservati al rientro", async () => {
  const { http, io, rooms } = createApp();
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const sockets: Socket[] = [];
  async function connect() {
    const socket = client(url, {
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    sockets.push(socket);
    await new Promise<void>((r) => socket.on("connect", r));
    return socket;
  }
  try {
    const a = await connect(),
      b = await connect();
    const created = await send(a, { type: "create", nickname: "Ada" });
    await send(b, {
      type: "join",
      nickname: "Bruno",
      code: created.state!.code,
    });
    const g = rooms.get(created.state!.code)!;
    let guestState: Snapshot | undefined;
    b.on("state", (state) => {
      guestState = state;
    });
    for (const experiments of [
      { colorShift: true, noMemory: false },
      { colorShift: false, noMemory: true },
      { colorShift: false, noMemory: false },
      { colorShift: true, noMemory: true },
    ]) {
      const updated = await send(a, {
        type: "set_experiments",
        experiments,
        version: g.version,
      });
      expect(updated.ok).toBe(true);
      await expect.poll(() => guestState?.experiments).toEqual(experiments);
      expect(
        (
          await send(b, {
            type: "set_experiments",
            experiments,
            version: g.version,
          })
        ).error,
      ).toContain("Solo il creatore");
    }
    expect(
      (
        await send(a, {
          type: "set_experiments",
          experiments: { colorShift: "true", noMemory: true } as never,
          version: g.version,
        })
      ).error,
    ).toBe("Richiesta non valida");
    await send(a, { type: "start", version: g.version });
    const active = g.active === created.playerId ? a : b;
    const probe = await send(active, {
      type: "probe",
      country: g.catalog.find((f) => f.code !== g.secret)!.code,
      version: g.version,
    });
    expect(probe.state!.maxProbes).toBeNull();
    expect(probe.state!.history[0].reveal).toEqual([]);
    await expect.poll(() => guestState?.reveal).toEqual(probe.state!.reveal);
    const shift = { ...g.roundColorShift! };
    a.disconnect();
    const restored = await connect();
    const resumed = await send(restored, {
      type: "resume",
      token: created.token,
    });
    expect(resumed.state!.experiments).toEqual({
      colorShift: true,
      noMemory: true,
    });
    expect(resumed.state!.history).toEqual(probe.state!.history);
    expect(resumed.state!.reveal).toEqual(probe.state!.reveal);
    expect(g.roundColorShift).toEqual(shift);
    expect(
      (
        await send(restored, {
          type: "set_experiments",
          experiments: { colorShift: false, noMemory: false },
          version: g.version,
        })
      ).error,
    ).toContain("lobby");
  } finally {
    sockets.forEach((s) => s.disconnect());
    await new Promise<void>((r) => io.close(() => r()));
  }
}, 15000);
