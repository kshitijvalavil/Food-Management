"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FoodTile, SourceStamp } from "@/components/Freshness";
import { Icon } from "@/components/Icon";
import { analyzePhoto, friendlyError, lookupBarcode, type LookupBarcodeResult } from "@/lib/api";
import { dayDate, shortDate, todayISO } from "@/lib/dates";
import { draft, useDraft } from "@/lib/draft";
import { daysLeftFor, freshClass } from "@/lib/freshness";
import { captureVideoFrame, fileToJpeg } from "@/lib/image";
import { LOCATIONS, LOCATION_ICON, LOCATION_LABEL, type Location } from "@/lib/types";

type Mode = "photo" | "barcode";
type CamState = "starting" | "live" | "denied" | "unsupported";

const BARCODE_RE = /^\d{8,14}$/;

function nextLocation(l: Location): Location {
  return LOCATIONS[(LOCATIONS.indexOf(l) + 1) % LOCATIONS.length] ?? "fridge";
}

function CameraBody() {
  const router = useRouter();
  const params = useSearchParams();
  const mode: Mode = params.get("mode") === "barcode" ? "barcode" : "photo";
  const { items } = useDraft();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<CamState>("starting");
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [loc, setLoc] = useState<Location>("fridge");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  // photo state
  const [busy, setBusy] = useState(false);
  const [shot, setShot] = useState<{ url: string; found: number; flagged: number } | null>(null);

  // barcode state
  const [result, setResult] = useState<(LookupBarcodeResult & { code: string }) | null>(null);
  const [resultLoc, setResultLoc] = useState<Location>("fridge");
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const lastCode = useRef<{ code: string; at: number } | null>(null);

  // ---------- camera lifecycle ----------
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCam("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch({ supported: !!caps.torch, on: false });
        setCam("live");
      } catch (e) {
        const name = (e as DOMException)?.name;
        setCam(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torch.supported) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  // ---------- barcode ----------
  const handleCode = useCallback(async (raw: string) => {
    const c = raw.replace(/\D/g, "");
    if (!BARCODE_RE.test(c)) {
      setError("Barcodes are 8 to 14 digits.");
      return;
    }
    const now = Date.now();
    if (lastCode.current && lastCode.current.code === c && now - lastCode.current.at < 3000) return;
    lastCode.current = { code: c, at: now };
    navigator.vibrate?.(60);
    setError(null);
    setStatus(`Barcode ${c} found. Looking it up.`);
    try {
      const r = await lookupBarcode(c);
      setResult({ ...r, code: c });
      setResultLoc(r.item?.location ?? "fridge");
      setStatus(r.found ? `${r.product_name ?? r.item?.name} found.` : `No product for ${c}.`);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    if (mode !== "barcode" || cam !== "live" || result || manual) return;
    const video = videoRef.current;
    if (!video) return;
    let controls: { stop: () => void } | null = null;
    let stopped = false;
    (async () => {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      const c = await reader.decodeFromVideoElement(video, (res) => {
        if (res && !stopped) {
          stopped = true;
          c.stop();
          handleCode(res.getText());
        }
      });
      if (stopped) c.stop();
      controls = c;
    })().catch(() => setError("The scanner couldn't start. Type the number instead."));
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [mode, cam, result, manual, handleCode]);

  const decodeFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const res = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      await handleCode(res.getText());
    } catch {
      setError("No barcode in that photo. Try closer, or type the number.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const addBarcodeItem = () => {
    if (!result?.item) return;
    draft.add([{ ...result.item, location: resultLoc }], "barcode", draft.get().sourceLabel ?? `From a barcode scan, ${dayDate(todayISO())}`);
    setStatus(`${result.item.name} added to Review.`);
    setResult(null);
    lastCode.current = null;
  };

  // ---------- photo ----------
  const analyze = async (jpeg: { blob: Blob; url: string }) => {
    setBusy(true);
    setError(null);
    setShot({ url: jpeg.url, found: 0, flagged: 0 });
    setStatus("Looking for food…");
    try {
      const r = await analyzePhoto(jpeg.blob, loc);
      draft.add(r.items, "photo", `From your ${LOCATION_LABEL[loc].toLowerCase()} photo, ${dayDate(todayISO())}`);
      setShot({ url: jpeg.url, found: r.items.length, flagged: r.flagged });
      setStatus(`${r.items.length} found${r.flagged ? `, ${r.flagged} ${r.flagged === 1 ? "needs" : "need"} a check` : ""}.`);
    } catch (e) {
      setShot(null);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || busy) return;
    navigator.vibrate?.(20);
    await analyze(await captureVideoFrame(video));
  };

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await analyze(await fileToJpeg(file));
    } catch {
      setError("That photo couldn't be opened. Try a JPEG or take a new one.");
    }
  };

  const setMode = (m: Mode) => {
    setError(null);
    setResult(null);
    setShot(null);
    router.replace(`/capture/camera?mode=${m}`);
  };

  const camOff = cam === "denied" || cam === "unsupported";

  return (
    <main className="cam mx-auto flex min-h-dvh w-full max-w-[480px] flex-col" style={{ paddingTop: "var(--safe-top)" }} data-testid="screen-camera" data-mode={mode} data-cam={cam}>
      <div className="cbar">
        <Link href={items.length ? "/capture/review" : "/"} className="cbtn" aria-label="Close camera" data-testid="camera-close">
          <Icon name="i-x" />
        </Link>
        {mode === "photo" ? (
          <button type="button" className="cpill" onClick={() => setLoc(nextLocation(loc))} aria-label={`Photo of the ${LOCATION_LABEL[loc].toLowerCase()}. Tap to change.`} data-testid="camera-location">
            <i aria-hidden="true" />
            {LOCATION_LABEL[loc]}
            {shot && shot.found > 0 ? ` · ${shot.found} found` : ""}
          </button>
        ) : (
          <span className="cpill">Barcode</span>
        )}
        <button type="button" className="cbtn" onClick={toggleTorch} disabled={!torch.supported} aria-pressed={torch.on} aria-label={torch.supported ? "Torch" : "Torch not available"} data-testid="camera-torch">
          <Icon name="i-flash" style={torch.on ? { fill: "var(--det-low)", color: "var(--det-low)" } : undefined} />
        </button>
      </div>

      <div className="relative min-h-[320px] flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          aria-label={mode === "photo" ? "Camera viewfinder" : "Barcode scanner viewfinder"}
          hidden={camOff}
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="The photo being checked" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {mode === "barcode" && cam === "live" && !result && !manual && (
          <span className="scanw det" aria-hidden="true">
            <i className="laser" />
          </span>
        )}
        {mode === "photo" && shot && (
          <span className="vhint" data-testid="camera-hint">
            <i aria-hidden="true" />
            {busy ? "Looking for food…" : shot.flagged ? `${shot.flagged} ${shot.flagged === 1 ? "item needs" : "items need"} a check` : `${shot.found} found`}
          </span>
        )}
        {cam === "starting" && <p className="absolute inset-0 m-0 grid place-items-center text-cam-muted">Starting the camera…</p>}

        {camOff && (
          <div className="absolute inset-0 grid content-center gap-4 p-6 text-center" data-testid="camera-fallback">
            <p className="d m-0 text-[30px]">{cam === "denied" ? "Camera is off for ShelfLife" : "No camera here"}</p>
            <p className="m-0 text-[15px] text-cam-muted">
              {cam === "denied" ? "Allow camera access in your browser settings, or use your phone's camera app instead." : "Use your phone's camera app instead."}
            </p>
            <label className="btn mx-auto cursor-pointer">
              <Icon name="i-cam" />
              {mode === "photo" ? "Take a photo" : "Photo of the barcode"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => (mode === "photo" ? onPhotoFile(e.target.files?.[0]) : e.target.files?.[0] && decodeFile(e.target.files[0]))}
                data-testid="camera-file-input"
              />
            </label>
          </div>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <p className="m-0 bg-cam-2 px-4 py-3 text-[15px]" role="alert" data-testid="camera-error">
          {error}
        </p>
      )}

      {mode === "barcode" && result ? (
        <section className="res" aria-label="Barcode result" data-testid="barcode-result">
          <i className="grab" aria-hidden="true" />
          {result.found && result.item ? (
            <>
              <div className="flex items-center gap-3">
                <FoodTile name={result.item.name} daysLeft={daysLeftFor(result.item.expires_on, todayISO())} />
                <span className="tx">
                  <b className="nm" data-testid="barcode-product">{result.product_name ?? result.item.name}</b>
                  <span className="mt">{[result.pack_size, "from Open Food Facts"].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
              <div className={`facts ${freshClass(daysLeftFor(result.item.expires_on, todayISO()))}`}>
                <span>
                  <b>{result.item.kcal_per_100g ?? "—"}</b>kcal / 100 g
                </span>
                <span>
                  <b>{shortDate(result.item.expires_on)}</b>
                  {result.item.expiry_source === "printed" ? "Best before" : "Use by"}
                </span>
                <span>
                  <b className="c">{daysLeftFor(result.item.expires_on, todayISO())}</b>Days left
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SourceStamp source={result.item.expiry_source} />
                <span className="ml flex-1">{result.item.expiry_source === "printed" ? "Read off the pack" : "Not printed: estimated"}</span>
                <button type="button" className="chip" onClick={() => setResultLoc(nextLocation(resultLoc))} aria-label={`Goes in the ${LOCATION_LABEL[resultLoc].toLowerCase()}. Tap to change.`} data-testid="barcode-location">
                  <Icon name={LOCATION_ICON[resultLoc]} />
                  {LOCATION_LABEL[resultLoc]}
                  <Icon name="i-chd" />
                </button>
              </div>
              <button type="button" className="btn" onClick={addBarcodeItem} data-testid="barcode-add">
                Add to Review<span className="count">{items.length + 1}</span>
              </button>
            </>
          ) : (
            <>
              <p className="d m-0 text-[26px]">Not in Open Food Facts yet</p>
              <p className="m-0 text-[15px] text-muted">We couldn&apos;t find barcode {result.code}. Search for it, or say it in a voice note.</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/capture/search" className="btn" data-testid="barcode-search-instead">
                  Search
                </Link>
                <button type="button" className="btn g" onClick={() => { setResult(null); lastCode.current = null; }} data-testid="barcode-scan-again">
                  Scan again
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        <div style={{ paddingBottom: "calc(var(--safe-bottom) + 16px)" }}>
          <nav className="modes" aria-label="Ways to add">
            <button type="button" aria-current={mode === "photo"} onClick={() => setMode("photo")} data-testid="mode-photo">
              Photo
            </button>
            <button type="button" aria-current={mode === "barcode"} onClick={() => setMode("barcode")} data-testid="mode-barcode">
              Barcode
            </button>
            <Link href="/capture/voice" data-testid="mode-voice">
              Voice
            </Link>
            <Link href="/capture/search" data-testid="mode-search">
              Search
            </Link>
          </nav>

          {mode === "photo" ? (
            <div className="shut">
              <label className="gal cursor-pointer" aria-label="Choose a photo from your library">
                <Icon name="i-img" />
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhotoFile(e.target.files?.[0])} data-testid="camera-library-input" />
              </label>
              <button type="button" className="shutter" onClick={takePhoto} disabled={cam !== "live" || busy} aria-label="Take photo" data-testid="camera-shutter" />
              {items.length > 0 ? (
                <Link href="/capture/review" className="done-pill" data-testid="review-cta">
                  Review {items.length}
                  <Icon name="i-chr" />
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : (
            <div className="grid gap-3 px-4">
              {manual || camOff ? (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCode(code);
                  }}
                >
                  <input
                    className="field flex-1"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="8 901262 010023"
                    aria-label="Barcode number"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    data-testid="barcode-manual-input"
                  />
                  <button type="submit" className="btn sm" data-testid="barcode-manual-submit">
                    Look up
                  </button>
                </form>
              ) : null}
              <div className="flex items-center justify-between">
                {!camOff && (
                  <button type="button" className="chip" style={{ background: "var(--cam-2)", color: "var(--cam-ink)" }} onClick={() => setManual(!manual)} data-testid="barcode-manual-toggle">
                    <Icon name="i-kbd" />
                    {manual ? "Scan instead" : "Type the number"}
                  </button>
                )}
                {items.length > 0 && (
                  <Link href="/capture/review" className="done-pill ml-auto" data-testid="review-cta">
                    Review {items.length}
                    <Icon name="i-chr" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function CameraPage() {
  return (
    <Suspense>
      <CameraBody />
    </Suspense>
  );
}
