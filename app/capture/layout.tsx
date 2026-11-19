import { AuthGate } from "@/components/AuthGate";

export default function CaptureLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
