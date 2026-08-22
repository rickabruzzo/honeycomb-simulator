import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // guardrail.test.ts uses describe/test as globals without importing them.
    globals: true,
    // Single-level globs deliberately: the files under lib/**/__tests__/ are
    // standalone tsx scripts with hand-rolled assertions, not framework suites,
    // and they run via `npm run test:contracts`. Framework-style suites that do
    // live under __tests__/ are listed explicitly.
    include: [
      "lib/*.test.ts",
      "lib/attendee/*.test.ts",
      "lib/llm/*.test.ts",
      "lib/scoring/*.test.ts",
      "lib/__tests__/guardrail.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
