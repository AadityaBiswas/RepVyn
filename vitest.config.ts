import { defineConfig } from "vitest/config";

// Property/fuzz/simulation tests can exceed the 5 s default under full parallel load.
export default defineConfig({ test: { testTimeout: 30_000 } });
