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
