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
import { colorTolerances } from "../../../packages/shared/src/index";
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
  captureKeyboard = true,
  placeholder = "Scegli una bandiera",
}: {
  countries: Country[];
  value: string;
  onChange: (code: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  captureKeyboard?: boolean;
  placeholder?: string;
}) {
  // null indica una scelta definitiva; una stringa è il testo ancora da completare.
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const selected = countries.find((c) => c.code === value);
  const text = draft ?? selected?.name ?? "";
  const definitive = !!selected && draft === null;
  const options = useMemo(() => {
    const q = text.trim().toLocaleLowerCase();
    if (!q) return countries;
    const rank = (c: Country) => {
      const names = [c.name, c.en, c.code].map((s) => s.toLocaleLowerCase());
      return names.includes(q) ? 0 : names.some((s) => s.startsWith(q)) ? 1 : 2;
    };
    return countries
      .filter((c) =>
        `${c.name} ${c.en} ${c.code}`.toLocaleLowerCase().includes(q),
      )
      .sort((a, b) => rank(a) - rank(b));
  }, [countries, text]);
  function choose(c: Country) {
    setDraft(null);
    onChange(c.code);
    setOpen(false);
  }
  function edit(next: string) {
    setHighlighted(-1);
    setDraft(next);
    setOpen(true);
    if (value) onChange("");
  }
  function enter() {
    if (disabled || !text.trim()) return;
    if (definitive) onSubmit?.();
    else {
      const option = options[open && highlighted >= 0 ? highlighted : 0];
      if (option) choose(option);
    }
  }
  function navigate(key: string) {
    if (!options.length) return;
    setOpen(true);
    setHighlighted((current) => {
      if (!open || current < 0)
        return key === "ArrowDown" ? 0 : options.length - 1;
      return (
        (current + (key === "ArrowDown" ? 1 : -1) + options.length) %
        options.length
      );
    });
  }
  useEffect(() => {
    if (open && highlighted >= 0)
      root.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);
  useEffect(() => {
    function close(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (disabled) {
      setOpen(false);
      setDraft(null);
    }
  }, [disabled]);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if (
        !captureKeyboard ||
        disabled ||
        e.defaultPrevented ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]',
        )
      )
        return;
      // Invio e Spazio continuano ad attivare i controlli esplicitamente a fuoco.
      if (
        (e.key === "Enter" || e.key === " ") &&
        target?.closest('button,a,[role="button"],[role="option"]')
      )
        return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        navigate(e.key);
        root.current?.querySelector("input")?.focus({ preventScroll: true });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) enter();
        return;
      }
      if (e.key.length === 1 || (e.key === "Backspace" && text)) {
        e.preventDefault();
        const next =
          e.key === "Backspace"
            ? Array.from(text).slice(0, -1).join("")
            : text + e.key;
        root.current?.querySelector("input")?.focus({ preventScroll: true });
        edit(next);
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [
    captureKeyboard,
    open,
    highlighted,
    disabled,
    text,
    definitive,
    options,
    onChange,
    onSubmit,
    value,
  ]);
  return (
    <div className="picker" ref={root}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="country-options"
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlighted >= 0
            ? `country-option-${options[highlighted]?.code}`
            : undefined
        }
        autoComplete="off"
        enterKeyHint={definitive ? "send" : "next"}
        autoCorrect="off"
        spellCheck={false}
        aria-label={placeholder}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onFocus={() => {
          if (!definitive) setOpen(true);
        }}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            navigate(e.key);
            return;
          }
          if (e.key === "Escape") setOpen(false);
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (!e.repeat) enter();
        }}
      />
      {open && (
        <div className="picker-options" role="listbox" id="country-options">
          {options.map((c, index) => (
            <button
              type="button"
              role="option"
              id={`country-option-${c.code}`}
              aria-selected={index === highlighted}
              key={c.code}
              onClick={() => {
                choose(c);
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
  const solo = snap?.mode === "solo";
  const [dialog, setDialog] = useState<"create" | "join" | null>(() =>
    new URLSearchParams(location.search).has("room") ? "join" : null,
  );
  const [nickname, setNickname] = useState(
    () => localStorage.getItem("flag-duel-nickname") || "",
  );
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
  );
  const [entering, setEntering] = useState(false);
  const entryPending = useRef(false);
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
  }, [
    snap?.round,
    snap?.active,
    snap?.subphase,
    snap?.phase,
    snap?.history.length,
  ]);
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    function resize() {
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        focused.matches(
          'input:not([readonly]):not([disabled]),textarea,[contenteditable="true"]',
        );
      // Il viewport visuale può conservare l'altezza della tastiera dopo il blur.
      // Senza un campo attivo torniamo alle unità dinamiche native del browser.
      if (editing && viewport)
        document.documentElement.style.setProperty(
          "--viewport-height",
          `${viewport.height}px`,
        );
      else document.documentElement.style.removeProperty("--viewport-height");
    }
    function focusChanged() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    }
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    window.addEventListener("pageshow", resize);
    document.addEventListener("focusin", focusChanged);
    document.addEventListener("focusout", focusChanged);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pageshow", resize);
      document.removeEventListener("focusin", focusChanged);
      document.removeEventListener("focusout", focusChanged);
    };
  }, [snap?.code, snap?.phase]);
  useEffect(() => {
    function shortcut(e: KeyboardEvent) {
      if (
        e.key !== "Enter" ||
        e.defaultPrevented ||
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        menu ||
        lab ||
        !game.connected ||
        game.busy
      )
        return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'input,textarea,select,[contenteditable]:not([contenteditable="false"]),button,a,[role="button"],[role="option"]',
        )
      )
        return;
      if (snap?.phase === "between_rounds" && me && !me.ready) {
        e.preventDefault();
        void game.command("ready");
      } else if (
        snap?.phase === "playing" &&
        !solo &&
        snap.subphase === "choose_action" &&
        canAct &&
        !solving
      ) {
        e.preventDefault();
        void game.command("pass");
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [
    snap,
    me,
    solo,
    menu,
    lab,
    solving,
    canAct,
    game.connected,
    game.busy,
    game.command,
  ]);
  function leave() {
    game.leave();
    setDialog(null);
    setMenu(false);
    setLab(false);
    history.replaceState({}, "", location.pathname);
  }
  async function enter(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog || entryPending.current) return;
    entryPending.current = true;
    setEntering(true);
    try {
      localStorage.setItem("flag-duel-nickname", nickname.trim());
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      const ack = await game.enter(
        dialog,
        nickname.trim(),
        dialog === "join" ? code : undefined,
      );
      if (ack.ok) {
        requestAnimationFrame(() => window.scrollTo(0, 0));
        setDialog(null);
        history.replaceState({}, "", location.pathname);
      }
    } finally {
      entryPending.current = false;
      setEntering(false);
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
        <section className="entry-content" hidden={!!dialog && !game.session}>
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
          {error && !dialog && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        {dialog && !game.session && (
          <div className="entry-form-shell">
            <form className="dialog" onSubmit={enter}>
              <button
                type="button"
                className="icon close"
                aria-label="Chiudi"
                disabled={entering}
                onClick={() => setDialog(null)}
              >
                <X size={19} />
              </button>
              <h1>{dialog === "create" ? "Crea stanza" : "Entra"}</h1>
              <label htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                readOnly={entering}
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
                    readOnly={entering}
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
              <button
                type="submit"
                disabled={!game.connected || game.busy || entering}
              >
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
          <div
            className="mode-selector"
            role="radiogroup"
            aria-label="Modalità di gioco"
          >
            {(
              [
                ["pvp", "PvP"],
                ["solo", "Giocatore singolo"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                role="radio"
                aria-checked={snap.mode === mode}
                className="secondary mode-choice"
                disabled={
                  snap.hostId !== me?.id ||
                  game.busy ||
                  !game.connected ||
                  (mode === "solo" && snap.players.length > 1)
                }
                title={
                  mode === "solo" && snap.players.length > 1
                    ? "La modalità singolo richiede una stanza senza ospiti"
                    : undefined
                }
                onClick={() => {
                  if (snap.mode !== mode)
                    void game.command("set_mode", { mode });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {solo ? (
            <>
              <h1 className="solo-title">Gioca da solo</h1>
              <p className="waiting-host">
                {snap.maxProbes} tentativi per indovinare.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">STANZA</span>
              <h1 className="room-code" data-testid="room-code">
                {snap.code}
              </h1>
              <div className="copy-row">
                <button
                  className="secondary"
                  onClick={() => void copy(snap.code)}
                >
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
            </>
          )}
          {snap.hostId !== me?.id && (
            <p
              className="lobby-settings-summary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="lobby-settings-summary"
            >
              {solo ? "Singolo" : "PvP"} · Tolleranza{" "}
              {
                { precise: "Precisa", standard: "Standard", broad: "Ampia" }[
                  snap.tolerance
                ]
              }
            </p>
          )}
          <details className="advanced-settings">
            <summary>Impostazioni avanzate</summary>
            <p>Tolleranza dei colori</p>
            <div
              className="tolerance-selector"
              role="radiogroup"
              aria-label="Tolleranza dei colori"
            >
              {(
                [
                  ["precise", "Precisa"],
                  ["standard", "Standard"],
                  ["broad", "Ampia"],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  role="radio"
                  aria-checked={snap.tolerance === preset}
                  className="secondary mode-choice tolerance-choice"
                  disabled={
                    snap.hostId !== me?.id || game.busy || !game.connected
                  }
                  onClick={() => {
                    if (snap.tolerance !== preset)
                      void game.command("set_tolerance", { tolerance: preset });
                  }}
                >
                  {label}
                  <small>
                    ΔE {colorTolerances[preset].toFixed(2).replace(".", ",")}
                  </small>
                </button>
              ))}
            </div>
          </details>
          <div className={`lobby-players ${solo ? "solo-player" : ""}`}>
            <span>
              {me?.nickname}
              <small>Tu</small>
            </span>
            {!solo && (
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
            )}
          </div>
          {snap.hostId === me?.id ? (
            <button
              disabled={
                (!solo && !opponent?.connected) || !game.connected || game.busy
              }
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
          {solo ? (
            <>
              <strong data-testid="solo-attempts">
                {snap.maxProbes - snap.history.length}
              </strong>
              <span>tentativi</span>
            </>
          ) : (
            <>
              <strong>{opponent?.score ?? 0}</strong>
              <span title={opponent?.nickname}>{opponent?.nickname}</span>
            </>
          )}
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
                ? `${solution?.name ?? ""} · ${solo ? (latest?.winner ? "Indovinata" : "Tentativi esauriti") : latest?.winner ? `${snap.players.find((p) => p.id === latest.winner)?.nickname} vince` : "Pareggio"}`
                : mine
                  ? solving
                    ? "Risposta finale"
                    : snap.subphase === "choose_probe"
                      ? solo
                        ? "Indovina la bandiera"
                        : "Il tuo turno"
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
        ) : solo || snap.subphase === "choose_probe" ? (
          <div className="input-row">
            <CountryPicker
              countries={available}
              value={selected}
              onChange={setSelected}
              placeholder={
                solo ? "Indovina la bandiera" : "Scegli una bandiera"
              }
              onSubmit={() => {
                if (canAct && selected)
                  void game.command("probe", { country: selected });
              }}
              disabled={!canAct}
              captureKeyboard={!menu}
            />
            <button
              aria-label={solo ? "Invia tentativo" : "Sonda"}
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
              captureKeyboard={!menu}
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
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={solo ? "Menu giocatore singolo" : "Menu PvP"}
          >
            <button
              className="icon close"
              aria-label="Chiudi menu"
              onClick={() => setMenu(false)}
            >
              <X size={19} />
            </button>
            {!solo && (
              <>
                <span className="eyebrow">STANZA {snap.code}</span>
                <p>Mano {snap.round}</p>
              </>
            )}
            <button className="secondary" onClick={leave}>
              <LogOut size={16} /> Esci dalla stanza
            </button>
            {!solo && import.meta.env.DEV && (
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
