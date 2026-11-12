import { describe, expect, it } from "vitest";
import { archivosDelDiff, esAccionCodigo, rutaPermitida, validarDiff } from "../cambio-codigo.js";

const diff = (archivo: string) => `diff --git a/${archivo} b/${archivo}
--- a/${archivo}
+++ b/${archivo}
@@ -1,1 +1,1 @@
-viejo
+nuevo
`;

describe("cambio-codigo", () => {
  it("lee los archivos de un diff unificado", () => {
    expect(archivosDelDiff(diff("app/routers/leads.py"))).toEqual(["app/routers/leads.py"]);
    expect(archivosDelDiff("--- /dev/null\n+++ b/nuevo.py\n@@ -0,0 +1 @@\n+x\n")).toEqual(["nuevo.py"]);
  });

  it("acepta un diff común", () => {
    expect(validarDiff(diff("server/src/services/x.ts"))).toBeNull();
  });

  it("rechaza diffs vacíos, sin formato o que tocan claves", () => {
    expect(validarDiff("")).toMatch(/vacío/);
    expect(validarDiff("cambiá la línea 3")).toMatch(/diff unificado/);
    for (const malo of [".env", "config/.env.production", ".ssh/authorized_keys", "deploy/llave.pem", "secrets/meta.json", "../etc/passwd"]) {
      expect(validarDiff(diff(malo)), malo).not.toBeNull();
    }
  });

  it("rutaPermitida frena rutas sensibles y deja las normales", () => {
    expect(rutaPermitida("app/main.py")).toBe(true);
    expect(rutaPermitida("server/src/routes/agent-tools.ts")).toBe(true);
    expect(rutaPermitida(".env")).toBe(false);
    expect(rutaPermitida("a/../../root")).toBe(false);
    expect(rutaPermitida(".git/config")).toBe(false);
  });

  it("reconoce el payload", () => {
    expect(esAccionCodigo({ repo: "crm", diff: "x", justificacion: "y" })).toBe(true);
    expect(esAccionCodigo({ repo: "otro", diff: "x", justificacion: "y" })).toBe(false);
  });
});
