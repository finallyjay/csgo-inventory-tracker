import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import path from "node:path"

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
      exclude: [
        "test/**",
        "**/*.d.ts",
        "**/*.config.*",
        "app/**/page.tsx",
        "app/**/layout.tsx",
        "app/**/loading.tsx",
        "app/**/error.tsx",
        "app/**/not-found.tsx",
        "app/**/global-error.tsx",
        // shadcn/ui primitives are generated wrappers; upstream tests them.
        "components/ui/**",
        "app/client-layout.tsx",
        // shadcn's toast hook is copied from the CLI template, not original code.
        "hooks/use-toast.ts",
        "lib/types/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": rootDir,
      "server-only": path.join(rootDir, "test/server-only-stub.ts"),
    },
  },
})
