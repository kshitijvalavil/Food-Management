"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IS_DEMO } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/client";

/** Real mode: no session, no app. Demo mode: always open. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(IS_DEMO);

  useEffect(() => {
    if (IS_DEMO) return;
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      if (data.session) setOk(true);
      else router.replace("/login");
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ok) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted" role="status">
        Loading your kitchen…
      </div>
    );
  }
  return <>{children}</>;
}
