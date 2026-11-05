import { describe, expect, it } from "vitest";
import { prepararSinRoot, puedeSerDelAgente } from "./server-utils.js";

// 05/11: como root, los agentes leían el entorno del servidor por /proc.
// Con LMTM_AGENTE_SIN_ROOT=1 corren con el usuario `node`, dueño solo de su
// carpeta de trabajo.

describe("puedeSerDelAgente", () => {
  it("su carpeta de trabajo y /tmp sí", () => {
    expect(puedeSerDelAgente("/paperclip/instances/lmtm/workspaces/abc")).toBe(true);
    expect(puedeSerDelAgente("/tmp/claude-agent")).toBe(true);
  });

  it("el código del servidor, la raíz o un prefijo parecido no", () => {
    expect(puedeSerDelAgente("/app")).toBe(false);
    expect(puedeSerDelAgente("/app/server")).toBe(false);
    expect(puedeSerDelAgente("/")).toBe(false);
    expect(puedeSerDelAgente("/tmpx")).toBe(false);
    expect(puedeSerDelAgente("/paperclip")).toBe(false);
    expect(puedeSerDelAgente("/tmp")).toBe(false);
    expect(puedeSerDelAgente("/tmp/../app")).toBe(false);
  });
});

describe("prepararSinRoot", () => {
  it("sin el interruptor, o en un destino remoto, corre como hasta ahora", async () => {
    await expect(prepararSinRoot({}, "/tmp", false)).resolves.toBeNull();
    await expect(prepararSinRoot({ LMTM_AGENTE_SIN_ROOT: "1" }, "/tmp", true)).resolves.toBeNull();
  });
});
