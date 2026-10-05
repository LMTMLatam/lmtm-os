import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/shared",
      "packages/db",
      "packages/adapter-utils",
      "packages/adapters/acpx-local",
      "packages/adapters/claude-local",
      "packages/adapters/codex-local",
      "packages/adapters/cursor-cloud",
      "packages/adapters/cursor-local",
      "packages/adapters/gemini-local",
      // minimax-local es el adapter de los 14 agentes de LMTM y no estaba en
      // esta lista: sus tests existian en el repo y nunca corrian.
      "packages/adapters/minimax-local",
      "packages/adapters/opencode-local",
      "packages/adapters/pi-local",
      "packages/mcp-servers/google",
      "server",
      "ui",
      "cli",
    ],
  },
});
