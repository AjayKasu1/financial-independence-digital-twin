import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Coverage instrumentation makes the seeded Monte Carlo and sensitivity tests slower
    // than ordinary unit tests on low-core CI runners.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "packages/domain/src/{fees,financial-independence,money,portfolio,real-estate,scenario-engine}.ts",
        "packages/ai-orchestrator/src/index.ts",
        "packages/policy-engine/src/index.ts"
      ],
      thresholds: {
        branches: 65,
        functions: 90,
        lines: 85,
        statements: 80
      }
    },
    include: ["packages/**/test/**/*.test.ts", "services/**/test/**/*.test.ts"]
  }
});
