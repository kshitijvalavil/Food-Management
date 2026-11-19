"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppMark } from "@/components/Icon";
import { IS_DEMO } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/client";

/** Magic-link sign in (real mode). Demo mode has no accounts, so it goes straight in. */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (IS_DEMO) router.replace("/");
  }, [router]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setState(error ? "error" : "sent");
  };

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[480px] content-center gap-6 px-5" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }} data-testid="screen-login">
      <div className="flex items-center gap-3">
        <AppMark size={52} />
        <span className="d text-[48px]">ShelfLife</span>
      </div>
      <p className="m-0 text-[20px] leading-snug font-medium">Know what&apos;s in your fridge, freezer and pantry, and hear about it a day before it turns.</p>
      {state === "sent" ? (
        <div className="pnl py-4" role="status">
          <p className="nm m-0">Check your email</p>
          <p className="mt wrap m-0">We sent a sign-in link to {email}. Open it on this phone.</p>
        </div>
      ) : (
        <form className="grid gap-3" onSubmit={send}>
          <label className="grid gap-1 text-[15px] text-muted">
            Email
            <input className="field" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" />
          </label>
          {state === "error" && (
            <p className="m-0 text-today-ink" role="alert">
              Couldn&apos;t send the link. Check the address and try again.
            </p>
          )}
          <button type="submit" className="btn" disabled={state === "sending"} data-testid="login-submit">
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}
    </main>
  );
}
