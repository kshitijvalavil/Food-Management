import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "shared/**/*.test.ts",
      "lib/**/*.test.{ts,tsx}",
      "components/**/*.test.{ts,tsx}",
      "app/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.{ts,tsx}",
    ],
    // supabase/** holds Deno tests (run with `deno test`), never vitest.
    exclude: ["supabase/**", "node_modules/**", "e2e/**", ".next/**"],
    css: false,
    env: { NEXT_PUBLIC_DEMO: "1" },
  },
});
