// Runs in the browser before any app module or hydration (Next.js instrumentation-client).
// Zod 4 probes `new Function("")` to enable its JIT parser. The probe is caught, but under our
// CSP (no 'unsafe-eval') it still fires a securitypolicyviolation on every page load. jitless
// skips the probe and uses the interpreted parser, which is plenty fast for our schemas.
// It must run before any z.object() is constructed, which is why it lives here and not in
// shared/schema.ts (that file is also imported by the Deno edge functions).
import { z } from "zod";

z.config({ jitless: true });
