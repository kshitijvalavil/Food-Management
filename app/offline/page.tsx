import { AppMark } from "@/components/Icon";

export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[480px] content-center justify-items-center gap-4 px-6 text-center">
      <AppMark size={64} />
      <h1 className="h-title">You&apos;re offline</h1>
      <p className="sub">Your kitchen opens again as soon as you have a connection.</p>
    </main>
  );
}
