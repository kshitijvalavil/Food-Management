"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/Icon";
import { Screen } from "@/components/Screen";
import { A2HS_DISMISSED_KEY, isStandalone } from "@/components/InstallHint";
import { IS_DEMO } from "@/lib/env";
import { getMember, resetMemberCache } from "@/lib/household";
import { resetDemoData } from "@/lib/kitchen";
import { getSupabase } from "@/lib/supabase/client";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function LinkRow({ href, icon, title, sub, testId }: { href: string; icon: IconName; title: string; sub?: string; testId: string }) {
  return (
    <Link href={href} className="sr" data-testid={testId}>
      <span className="oi" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="tx">
        <b className="nm">{title}</b>
        {sub && <span className="mt">{sub}</span>}
      </span>
      <Icon name="i-chr" className="chv" />
    </Link>
  );
}

export default function Me() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    getMember().then((m) => setEmail(m.email)).catch(() => {});
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const install = async () => {
    if (installEvt) {
      await installEvt.prompt();
      setInstallEvt(null);
      return;
    }
    // iPhone: show the Add to Home Screen sheet again.
    try {
      localStorage.removeItem(A2HS_DISMISSED_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const signOut = async () => {
    await getSupabase().auth.signOut();
    resetMemberCache();
    qc.clear();
    router.replace("/login");
  };

  const reset = async () => {
    await resetDemoData();
    await qc.invalidateQueries();
    router.push("/");
  };

  return (
    <Screen testId="screen-me">
      <header>
        <p className="eyebrow">{IS_DEMO ? "Demo mode · data stays on this phone" : (email ?? "Signed in")}</p>
        <h1 className="h-title">Me</h1>
      </header>

      <div className="set">
        <LinkRow href="/me/notifications" icon="i-bell" title="Notifications" sub="Expiry, running low, digest" testId="me-notifications" />
        <LinkRow href="/shopping" icon="i-cart" title="Shopping list" testId="me-shopping" />
        <LinkRow href="/alerts" icon="i-clock" title="Alerts" testId="me-alerts" />
      </div>

      {!installed && (
        <div className="set">
          <button type="button" className="sr w-full text-left" onClick={install} data-testid="me-install">
            <span className="oi" aria-hidden="true">
              <Icon name="i-home" />
            </span>
            <span className="tx">
              <b className="nm">{installEvt ? "Install ShelfLife" : "Add to Home Screen"}</b>
              <span className="mt">Opens full screen, and lets alerts reach you</span>
            </span>
          </button>
        </div>
      )}

      <div className="mt-auto grid gap-2">
        {IS_DEMO ? (
          <button type="button" className="btn g" onClick={reset} data-testid="me-reset-demo">
            Reset demo kitchen
          </button>
        ) : (
          <button type="button" className="btn g" onClick={signOut} data-testid="me-sign-out">
            Sign out
          </button>
        )}
      </div>
    </Screen>
  );
}
