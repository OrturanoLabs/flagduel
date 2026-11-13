import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowRight,
  Check,
  Copy,
  LogOut,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { Ack, Command, Region, Snapshot } from "./protocol";

type Country = { code: string; name: string; en: string; svg: string };
type Session = { token: string; code: string; playerId: string };
const SESSION_KEY = "flag-duel-session-v2";
const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const countryName = (countries: Country[], code: string) =>
  countries.find((c) => c.code === code)?.name ?? code;

function useCatalog() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/catalog")
      .then((r) => {
        if (!r.ok) throw new Error("Catalogo non disponibile");
        return r.json() as Promise<Country[]>;
      })
      .then((data) => {
        if (live) setCountries(data);
      })
      .catch(() => {
        if (live)
          setError(
            "Catalogo non raggiungibile. Verifica che il server sia avviato.",
          );
      });
    return () => {
      live = false;
    };
  }, []);
  return { countries, error };
}
function useGame() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<Session | null>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(SESSION_KEY) || "null",
      ) as Session | null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resumeChecked, setResumeChecked] = useState(false);
  const acceptSnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
  }, []);
  useEffect(() => {
    const s = io({ autoConnect: true });
    setSocket(s);
    s.on("connect", () => {
      setConnected(true);
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) {
        try {
          const x = JSON.parse(saved) as Session;
          s.timeout(8000).emit(
            "command",
            {
              type: "resume",
              code: x.code,
              token: x.token,
              actionId: makeId(),
            },
            (err: Error | null, ack: Ack) => {
              if (err) {
                setError(
                  "Il server non ha risposto al ripristino. Riprova la connessione.",
                );
              } else if (ack.ok && ack.state) {
                acceptSnapshot(ack.state);
                const resumed = {
                  code: x.code,
                  token: ack.token ?? x.token,
                  playerId: ack.playerId ?? x.playerId,
                };
                setSession(resumed);
                localStorage.setItem(SESSION_KEY, JSON.stringify(resumed));
              } else {
                localStorage.removeItem(SESSION_KEY);
                setSession(null);
                setError(
                  ack.error ||
                    "Sessione scaduta. Crea o raggiungi una nuova stanza.",
                );
              }
              setResumeChecked(true);
            },
          );
        } catch {
          localStorage.removeItem(SESSION_KEY);
          setSession(null);
          setError(
            "Sessione locale non valida. Crea o raggiungi una nuova stanza.",
          );
          setResumeChecked(true);
        }
      } else setResumeChecked(true);
    });
    s.on("disconnect", () => {
      setConnected(false);
      setBusy(false);
    });
    s.on("state", acceptSnapshot);
    return () => {
      s.disconnect();
    };
  }, [acceptSnapshot]);
  const command = useCallback(
    (
      type: Command["type"],
      args: Omit<Command, "type" | "actionId" | "version"> = {},
    ) =>
      new Promise<Ack>((resolve) => {
        if (!socket?.connected) {
          resolve({ ok: false, error: "Connessione al server assente." });
          return;
        }
        setBusy(true);
        setError("");
        const payload: Command = {
          type,
          ...args,
          actionId: makeId(),
          ...(snapshot ? { version: snapshot.version } : {}),
        } as Command;
        socket
          .timeout(8000)
          .emit("command", payload, (err: Error | null, ack: Ack) => {
            setBusy(false);
            if (err) {
              const failure = {
                ok: false,
                error:
                  "Il server non ha risposto. Controlla la connessione e riprova.",
              };
              setError(failure.error);
              resolve(failure);
              return;
            }
            if (ack.state) acceptSnapshot(ack.state);
            if (!ack.ok) setError(ack.error || "Operazione non riuscita.");
            resolve(ack);
          });
      }),
    [socket, snapshot, acceptSnapshot],
  );
  const enter = useCallback(
    async (type: "create" | "join", nickname: string, code?: string) => {
      const ack = await command(type, {
        nickname,
        ...(code ? { code: code.trim().toUpperCase() } : {}),
      });
      if (ack.ok && ack.state && ack.token && ack.playerId) {
        const next = {
          code: ack.state.code,
          token: ack.token,
          playerId: ack.playerId,
        };
        setSession(next);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        setSnapshot(ack.state);
      }
      return ack;
    },
    [command],
  );
  const leave = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setSnapshot(null);
    setError("");
    setResumeChecked(true);
    socket?.disconnect();
    window.setTimeout(() => socket?.connect(), 0);
  };
  return {
    connected,
    snapshot,
    session,
    busy,
    error,
    setError,
    command,
    enter,
    leave,
    resumeChecked,
  };
}

function FlagImage({ country }: { country?: Country }) {
  return country ? (
    <img
      className="flag-image"
      src={
        country.svg.startsWith("<")
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(country.svg)}`
          : country.svg
      }
      alt={`Bandiera: ${country.name}`}
    />
  ) : null;
}
function Reveal({ regions, label }: { regions: Region[]; label: string }) {
  return (
    <svg className="reveal" viewBox="0 0 300 200" role="img" aria-label={label}>
      {regions.map((r, i) => (
        <path key={i} d={r.d} fill={r.color} fillRule="evenodd" />
      ))}
    </svg>
  );
}
function CountryPicker({
  countries,
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Scegli una bandiera",
}: {
  countries: Country[];
  value: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return countries.filter(
      (c) =>
        !q || `${c.name} ${c.en} ${c.code}`.toLocaleLowerCase().includes(q),
    );
  }, [countries, query]);
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div className="picker" ref={root}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="country-options"
        autoComplete="off"
        enterKeyHint={open ? "next" : "send"}
        autoCorrect="off"
        spellCheck={false}
        aria-label={placeholder}
        placeholder={placeholder}
        disabled={disabled}
        value={
          open ? query : (countries.find((c) => c.code === value)?.name ?? "")
        }
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (disabled || e.repeat) return;
          if (open) {
            if (options[0]) {
              onChange(options[0].code);
              setOpen(false);
            }
          } else if (value && countries.some((c) => c.code === value)) {
            onSubmit?.();
          }
        }}
      />
      {open && (
        <div className="picker-options" role="listbox" id="country-options">
          {options.map((c) => (
            <button
              type="button"
              role="option"
              aria-selected={c.code === value}
              key={c.code}
              onClick={() => {
                onChange(c.code);
                setOpen(false);
                root.current?.querySelector("input")?.blur();
              }}
            >
              <span>{c.name}</span>
            </button>
          ))}
          {!options.length && <p>Nessun paese trovato</p>}
        </div>
      )}
    </div>
  );
}
export default function App() {
  const { countries, error: catalogError } = useCatalog();
  const game = useGame();
  const snap = game.snapshot;
  const [dialog, setDialog] = useState<"create" | "join" | null>(() =>
    new URLSearchParams(location.search).has("room") ? "join" : null,
  );
  const [nickname, setNickname] = useState(
    () => localStorage.getItem("flag-duel-nickname") || "",
  );
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
  );
  const [selected, setSelected] = useState("");
  const [solving, setSolving] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState("");
  const [lab, setLab] = useState(false);
  const [labA, setLabA] = useState("fr");
  const [labB, setLabB] = useState("ru");
  const [tolerance, setTolerance] = useState(0.04);
  const [labResult, setLabResult] = useState<{
    regions: Region[];
    area: number;
  } | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const me = snap?.players.find((p) => p.id === game.session?.playerId),
    opponent = snap?.players.find((p) => p.id !== game.session?.playerId);
  const mine = snap?.active === me?.id;
  const playing = snap?.phase === "playing";
  const canAct = !!(playing && mine && game.connected && !game.busy);
  const available = countries.filter(
    (c) => !snap?.history.some((h) => h.country === c.code),
  );
  useEffect(() => {
    setSelected("");
    setSolving(false);
  }, [snap?.round, snap?.active, snap?.subphase, snap?.phase]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      document.documentElement.style.setProperty(
        "--viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  function leave() {
    game.leave();
    setDialog(null);
    setMenu(false);
    setLab(false);
    history.replaceState({}, "", location.pathname);
  }
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    localStorage.setItem("flag-duel-nickname", nickname.trim());
    const ack = await game.enter(
      dialog,
      nickname.trim(),
      dialog === "join" ? code : undefined,
    );
    if (ack.ok) {
      setDialog(null);
      history.replaceState({}, "", location.pathname);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copiato");
    } catch {
      setCopied("Seleziona il testo per copiarlo");
    }
  }
  const error = game.error || catalogError;
  if (!snap)
    return (
      <main className="entry-screen">
        <section className="entry-content">
          <div className="wordmark">
            flag<span>duel</span>
            <i />
          </div>
          <p>Una bandiera. Due giocatori.</p>
          {game.session ? (
            <>
              <p>Riconnessione…</p>
              <button className="secondary" onClick={leave}>
                Torna all’inizio
              </button>
            </>
          ) : (
            <div className="entry-buttons">
              <button
                onClick={() => setDialog("create")}
                disabled={!game.connected || game.busy}
              >
                Crea stanza <ArrowRight size={17} />
              </button>
              <button
                className="secondary"
                onClick={() => setDialog("join")}
                disabled={!game.connected || game.busy}
              >
                Entra
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        {dialog && !game.session && (
          <div className="overlay">
            <form className="dialog" onSubmit={enter}>
              <button
                type="button"
                className="icon close"
                aria-label="Chiudi"
                onClick={() => setDialog(null)}
              >
                <X size={19} />
              </button>
              <h1>{dialog === "create" ? "Crea stanza" : "Entra"}</h1>
              <label htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                maxLength={24}
                required
                autoFocus
                value={nickname}
                autoComplete="nickname"
                onChange={(e) => setNickname(e.target.value)}
              />
              {dialog === "join" && (
                <>
                  <label htmlFor="room-code">Codice stanza</label>
                  <input
                    id="room-code"
                    maxLength={3}
                    required
                    pattern="[A-Za-z0-9]{3}"
                    className="code-input"
                    value={code}
                    autoComplete="off"
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </>
              )}
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button type="submit" disabled={!game.connected || game.busy}>
                {dialog === "create" ? "Crea" : "Entra in stanza"}
              </button>
            </form>
          </div>
        )}
      </main>
    );
  const invite = `${location.origin}/?room=${snap.code}`;
  const latest = snap.results.at(-1);
  const solution = countries.find((c) => c.code === snap.solution);
  if (import.meta.env.DEV && lab)
    return (
      <main className="lab">
        <button className="secondary" onClick={() => setLab(false)}>
          Torna al gioco
        </button>
        <h1>Laboratorio SVG</h1>
        <div className="lab-selects">
          <label>
            Bandiera A
            <select value={labA} onChange={(e) => setLabA(e.target.value)}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bandiera B
            <select value={labB} onChange={(e) => setLabB(e.target.value)}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          ΔEOK {tolerance.toFixed(3)}
          <input
            type="range"
            min="0"
            max=".15"
            step=".001"
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
          />
        </label>
        <button
          onClick={async () => {
            try {
              const r = await fetch("/api/lab", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ a: labA, b: labB, tolerance }),
              });
              if (!r.ok) throw Error("Laboratorio non disponibile");
              setLabResult(await r.json());
            } catch (e) {
              game.setError((e as Error).message);
            }
          }}
        >
          Confronta
        </button>
        <div className="lab-flags">
          <FlagImage country={countries.find((c) => c.code === labA)} />
          <Reveal regions={labResult?.regions ?? []} label="Intersezione" />
          <FlagImage country={countries.find((c) => c.code === labB)} />
        </div>
        {labResult && (
          <p>Area rivelata: {(labResult.area / 600).toFixed(1)}%</p>
        )}
        <button
          className="secondary"
          onClick={async () => {
            const r = await fetch("/api/report");
            if (r.ok) setReport(await r.json());
          }}
        >
          Report preprocessing
        </button>
        {report != null && <pre>{JSON.stringify(report, null, 2)}</pre>}
        {error && <p className="error">{error}</p>}
      </main>
    );
  if (snap.phase === "waiting")
    return (
      <main className="entry-screen">
        <section className="lobby">
          <span className="eyebrow">STANZA</span>
          <h1 className="room-code" data-testid="room-code">
            {snap.code}
          </h1>
          <div className="copy-row">
            <button className="secondary" onClick={() => void copy(snap.code)}>
              <Copy size={14} /> Codice
            </button>
            <button className="secondary" onClick={() => void copy(invite)}>
              Copia link
            </button>
          </div>
          <input
            className="invite"
            aria-label="Link d'invito selezionabile"
            value={invite}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          {copied && <small role="status">{copied}</small>}
          <div className="lobby-players">
            <span>
              {me?.nickname}
              <small>Tu</small>
            </span>
            <span>
              {opponent?.nickname || "In attesa…"}
              <small>
                {opponent
                  ? opponent.connected
                    ? "Connesso"
                    : "Disconnesso"
                  : "Condividi il codice"}
              </small>
            </span>
          </div>
          {snap.hostId === me?.id ? (
            <button
              disabled={!opponent?.connected || !game.connected || game.busy}
              onClick={() => void game.command("start")}
            >
              Inizia la partita <ArrowRight size={17} />
            </button>
          ) : (
            <p className="waiting-host">Il creatore avvierà la partita.</p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="text-button" onClick={leave}>
            Esci
          </button>
          {import.meta.env.DEV && (
            <button className="text-button" onClick={() => setLab(true)}>
              Laboratorio SVG
            </button>
          )}
        </section>
      </main>
    );
  return (
    <main className="game-screen" data-testid="game">
      <header className="scorebar">
        <div
          className={`player own ${mine && playing ? "active" : ""}`}
          data-testid="own-player"
        >
          <span title={me?.nickname}>{me?.nickname}</span>
          <strong>{me?.score ?? 0}</strong>
        </div>
        <button
          className="icon menu-toggle"
          aria-label="Menu stanza"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <MoreHorizontal size={20} />
        </button>
        <div
          className={`player opponent ${!mine && playing ? "active" : ""}`}
          data-testid="opponent-player"
        >
          <strong>{opponent?.score ?? 0}</strong>
          <span title={opponent?.nickname}>{opponent?.nickname}</span>
        </div>
      </header>
      <div className="target">
        {snap.phase === "between_rounds" ? (
          <FlagImage country={solution} />
        ) : (
          <Reveal regions={snap.reveal} label="Bandiera da indovinare" />
        )}
      </div>
      <div
        className="attempts"
        aria-label="Tentativi precedenti"
        data-testid="attempts"
        style={
          { "--count": Math.max(1, snap.history.length) } as React.CSSProperties
        }
      >
        {snap.history.map((h, i) => (
          <div
            className="attempt"
            key={`${snap.round}-${h.country}`}
            data-testid="attempt"
          >
            <span className="attempt-number">{i + 1}</span>
            <FlagImage country={countries.find((c) => c.code === h.country)} />
            <Reveal
              regions={h.reveal}
              label={`Zone trovate con ${countryName(countries, h.country)}`}
            />
            <span className="attempt-name">
              {countryName(countries, h.country)}
            </span>
            <span
              className={`attempt-owner ${h.playerId === me?.id ? "is-mine" : ""}`}
              title={snap.players.find((p) => p.id === h.playerId)?.nickname}
            />
          </div>
        ))}
      </div>
      <section className="controls" aria-label="La tua mossa">
        <p
          className={`turn-status ${!game.connected || opponent?.connected === false ? "offline" : ""}`}
          role="status"
        >
          {!game.connected
            ? "Riconnessione…"
            : opponent?.connected === false
              ? "Avversario disconnesso"
              : snap.phase === "between_rounds"
                ? `${solution?.name ?? ""} · ${latest?.winner ? `${snap.players.find((p) => p.id === latest.winner)?.nickname} vince` : "Pareggio"}`
                : mine
                  ? solving
                    ? "Risposta finale"
                    : snap.subphase === "choose_probe"
                      ? "Il tuo turno"
                      : "Risolvi o passa"
                  : `Turno di ${opponent?.nickname}`}
        </p>
        {snap.phase === "between_rounds" ? (
          <button
            disabled={game.busy || !!me?.ready || !game.connected}
            onClick={() => void game.command("ready")}
          >
            {me?.ready ? "Aspetto l’avversario…" : "Prossima mano"}{" "}
            {!me?.ready && <ArrowRight size={17} />}
          </button>
        ) : snap.subphase === "choose_probe" ? (
          <div className="input-row">
            <CountryPicker
              countries={available}
              value={selected}
              onChange={setSelected}
              onSubmit={() => {
                if (canAct && selected)
                  void game.command("probe", { country: selected });
              }}
              disabled={!canAct}
            />
            <button
              aria-label="Sonda"
              disabled={!canAct || !selected}
              onClick={async () => {
                const ack = await game.command("probe", { country: selected });
                if (ack.ok) setSelected("");
              }}
            >
              <ArrowRight size={20} />
            </button>
          </div>
        ) : solving ? (
          <div className="input-row">
            <CountryPicker
              countries={countries}
              value={selected}
              onChange={(c) => {
                setSelected(c);
              }}
              disabled={!canAct}
              onSubmit={() => {
                if (canAct && selected)
                  void game.command("solve", { country: selected });
              }}
              placeholder="La tua risposta"
            />
            <button
              aria-label="Invia risposta"
              disabled={!canAct || !selected}
              onClick={async () => {
                await game.command("solve", { country: selected });
              }}
            >
              <Check size={20} />
            </button>
            <button
              className="secondary icon"
              aria-label="Annulla risposta"
              onClick={() => {
                setSolving(false);
                setSelected("");
              }}
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="action-row">
            <button
              disabled={!canAct}
              onClick={() => {
                setSolving(true);
                setSelected("");
              }}
            >
              Risolvi
            </button>
            <button
              className="secondary"
              disabled={!canAct}
              onClick={() => void game.command("pass")}
            >
              Passa
            </button>
          </div>
        )}
      </section>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button
            className="icon"
            aria-label="Chiudi errore"
            onClick={() => game.setError("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {menu && (
        <div className="overlay">
          <section className="dialog">
            <button
              className="icon close"
              aria-label="Chiudi menu"
              onClick={() => setMenu(false)}
            >
              <X size={19} />
            </button>
            <span className="eyebrow">STANZA {snap.code}</span>
            <p>Mano {snap.round}</p>
            <button className="secondary" onClick={() => void copy(invite)}>
              Copia invito
            </button>
            {copied && <small>{copied}</small>}
            {latest && <p className="muted">Ultima mano: {latest.reason}</p>}
            <button className="secondary" onClick={leave}>
              <LogOut size={16} /> Esci dalla stanza
            </button>
            {import.meta.env.DEV && (
              <button
                className="text-button"
                onClick={() => {
                  setMenu(false);
                  setLab(true);
                }}
              >
                Laboratorio SVG
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
