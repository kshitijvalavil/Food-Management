"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Screen } from "@/components/Screen";

const KEY = "shelflife.notify.v1";

interface Prefs {
  expiry: boolean;
  lead: 0 | 1 | 2;
  low: boolean;
  digest: boolean;
  digestAt: string;
  quiet: boolean;
  quietFrom: string;
  quietTo: string;
  share: boolean;
}

const DEFAULTS: Prefs = { expiry: true, lead: 1, low: true, digest: true, digestAt: "08:00", quiet: true, quietFrom: "22:30", quietTo: "07:00", share: true };

function Toggle({ on, onChange, label, testId }: { on: boolean; onChange: (v: boolean) => void; label: string; testId: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="tg" onClick={() => onChange(!on)} data-testid={testId} />;
}

function Row({ icon, title, sub, children }: { icon: IconName; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="sr">
      <span className="oi" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="tx">
        <b className="nm">{title}</b>
        {sub && <span className="mt">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

/** Notification settings (mockup 3.4). Saved on this phone; the push sender reads them from Sprint 2. */
export default function NotificationSettings() {
  const [p, setP] = useState<Prefs>(DEFAULTS);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setP({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
    } catch {
      /* defaults */
    }
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    const next = { ...p, [k]: v };
    setP(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <Screen testId="screen-notifications">
      <nav className="nav" aria-label="Back">
        <Link href="/me">
          <Icon name="i-chl" />
          Me
        </Link>
      </nav>
      <h1 className="h-title">Notifications</h1>

      {perm !== "granted" && (
        <div className="tip">
          <Icon name="i-bell" />
          <p className="m-0">
            {perm === "unsupported"
              ? "On iPhone, add ShelfLife to your Home Screen first. Alerts need iOS 16.4 or later."
              : "Alerts start in the next update. Your choices here are kept until then."}
          </p>
        </div>
      )}

      <h2 className="lb m-0">What to tell you</h2>
      <div className="set">
        <Row icon="i-clock" title="Expiry alerts">
          <Toggle on={p.expiry} onChange={(v) => set("expiry", v)} label="Expiry alerts" testId="notify-expiry" />
        </Row>
        {p.expiry && (
          <div className="pb-3">
            <div className="seg" role="radiogroup" aria-label="When to alert">
              {(
                [
                  [0, "Same day"],
                  [1, "1 day before"],
                  [2, "2 days"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={p.lead === v} onClick={() => set("lead", v)} data-testid={`notify-lead-${v}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Row icon="i-cart" title="Running low" sub="Below your usual amount">
          <Toggle on={p.low} onChange={(v) => set("low", v)} label="Running low alerts" testId="notify-low" />
        </Row>
      </div>

      <h2 className="lb m-0">When</h2>
      <div className="set">
        <Row icon="i-bell" title="Digest" sub="Every day">
          <input type="time" className="pill" aria-label="Digest time" value={p.digestAt} onChange={(e) => set("digestAt", e.target.value)} data-testid="notify-digest-time" />
          <Toggle on={p.digest} onChange={(v) => set("digest", v)} label="Daily digest" testId="notify-digest" />
        </Row>
        <Row icon="i-moon" title="Quiet hours" sub={`${p.quietFrom} to ${p.quietTo}`}>
          <Toggle on={p.quiet} onChange={(v) => set("quiet", v)} label="Quiet hours" testId="notify-quiet" />
        </Row>
      </div>

      <h2 className="lb m-0">Household</h2>
      <div className="set">
        <Row icon="i-users" title="Share alerts" sub="Notify everyone in the home">
          <Toggle on={p.share} onChange={(v) => set("share", v)} label="Share alerts with the household" testId="notify-share" />
        </Row>
        <p className="mt wrap pb-3 pl-[51px]">Whoever acts first clears it for everyone.</p>
      </div>
    </Screen>
  );
}
