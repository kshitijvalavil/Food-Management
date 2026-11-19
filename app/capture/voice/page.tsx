"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FoodTile } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { friendlyError, parseText } from "@/lib/api";
import { dayDate, todayISO } from "@/lib/dates";
import { draft } from "@/lib/draft";
import type { EnrichedItem } from "@/shared/schema";
import { LOCATION_ICON, LOCATION_LABEL, displayName } from "@/lib/types";

// Minimal typing for the Web Speech API (Safari and Chrome ship it prefixed or unprefixed).
interface SpeechResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechResultLike> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const WAVE = [8, 14, 22, 12, 30, 18, 36, 24, 14, 28, 38, 20, 10, 26, 32, 16, 22, 12, 18, 8, 14, 6];

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VoicePage() {
  const router = useRouter();
  const recRef = useRef<RecognitionLike | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [typed, setTyped] = useState("");
  const [heard, setHeard] = useState<EnrichedItem[]>([]);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ok = !!getRecognition();
    setSupported(ok);
    if (!ok) setTyping(true);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [listening]);

  // Parse finished sentences while you talk (debounced), so "Heard so far" fills in live.
  const scheduleParse = useCallback((text: string) => {
    if (parseTimer.current) clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(async () => {
      if (!text.trim()) return;
      try {
        setHeard((await parseText(text)).items);
      } catch {
        /* the final parse on Done reports errors */
      }
    }, 1200);
  }, []);

  const start = () => {
    const Ctor = getRecognition();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = navigator.language || "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      setFinalText(fin);
      setInterim(mid);
      scheduleParse(fin);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone is off for ShelfLife. Type instead, or use your keyboard's mic.");
        setTyping(true);
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError("Didn't catch that. Try again or type it.");
      }
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  useEffect(() => () => recRef.current?.abort(), []);

  const transcript = typing ? typed : `${finalText}${interim ? ` ${interim}` : ""}`.trim();

  const done = async () => {
    stop();
    const text = typing ? typed : `${finalText} ${interim}`.trim();
    if (!text) {
      setError("Say or type what you bought first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { items } = await parseText(text);
      if (!items.length) {
        setError("We didn't hear any food in that. Try naming each item.");
        return;
      }
      draft.add(items, "voice", draft.get().sourceLabel ?? `From a voice note, ${dayDate(todayISO())}`);
      router.push("/capture/review");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="vc mx-auto flex min-h-dvh w-full max-w-[480px] flex-col" style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(var(--safe-bottom) + 18px)" }} data-testid="screen-voice">
      <div className="cbar">
        <Link href="/" className="cbtn" aria-label="Close voice note" data-testid="voice-close">
          <Icon name="i-x" />
        </Link>
        <span className="cpill" aria-live="off">
          <i aria-hidden="true" style={{ background: listening ? "var(--today)" : "var(--vc-dim)" }} />
          {listening ? fmt(secs) : typing ? "Typing" : "Voice note"}
        </span>
        <button
          type="button"
          className="cbtn"
          aria-pressed={typing}
          aria-label={typing ? "Speak instead" : "Type instead"}
          onClick={() => {
            stop();
            setTyping(!typing);
            if (!typing) setTyped(transcript);
          }}
          disabled={supported === false}
          data-testid="voice-keyboard"
        >
          <Icon name={typing ? "i-mic" : "i-kbd"} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4">
        <p className="eyebrow">{listening ? "Listening" : typing ? "Type what you bought" : "Tap to talk"}</p>
        {typing ? (
          <textarea
            className="field min-h-36 !border-transparent !bg-[var(--vc-2)] p-3 !text-[20px] !text-white"
            placeholder="A dozen eggs, half a kilo of paneer, five kilos of basmati…"
            aria-label="What you bought"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={2000}
            autoFocus
            data-testid="voice-text"
          />
        ) : (
          <p className="tr" aria-live="polite" data-testid="voice-transcript">
            {transcript ? (
              <>
                {finalText}
                {interim && <span className="dim"> {interim}</span>}
              </>
            ) : (
              <span className="dim">Say what you bought, like &ldquo;a dozen eggs and two packs of milk. Put the paneer in the freezer.&rdquo;</span>
            )}
            {listening && <i className="caret" aria-hidden="true" />}
          </p>
        )}

        {heard.length > 0 && (
          <section className="vp" aria-label="Heard so far" data-testid="voice-heard">
            <div className="lb">
              Heard so far <b style={{ color: "#fff" }}>{heard.length}</b>
            </div>
            {heard.map((h, i) => (
              <div className="li" key={`${h.name}-${i}`} style={{ minHeight: 52 }}>
                <FoodTile name={h.name} />
                <span className="tx">
                  <b className="nm">{displayName(h.name, h.quantity, h.unit)}</b>
                </span>
                <span className="ml" style={{ color: "#fff", opacity: 0.85 }}>
                  <Icon name={LOCATION_ICON[h.location]} />
                  {LOCATION_LABEL[h.location]}
                </span>
              </div>
            ))}
          </section>
        )}

        {error && (
          <p className="m-0 rounded-xl bg-[var(--vc-2)] px-3 py-2 text-[15px]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-auto grid gap-4">
          {!typing && (
            <div className="wave" aria-hidden="true" style={{ opacity: listening ? 1 : 0.35 }}>
              {WAVE.map((h, i) => (
                <i key={i} style={{ height: listening ? h : 4, transition: "height .3s" }} />
              ))}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 text-[16px] font-semibold">
            <Link href="/" className="inline-flex min-h-11 items-center" data-testid="voice-cancel">
              Cancel
            </Link>
            {typing ? (
              <span />
            ) : (
              <button
                type="button"
                className={`stop ${listening ? "" : "idle"}`}
                onClick={listening ? stop : start}
                aria-label={listening ? "Stop listening" : "Start listening"}
                aria-pressed={listening}
                data-testid="voice-record"
              />
            )}
            <button type="button" className="inline-flex min-h-11 items-center justify-self-end disabled:opacity-50" onClick={done} disabled={busy} data-testid="voice-done">
              {busy ? "Listing…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
