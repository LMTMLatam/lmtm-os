import { afterEach, describe, expect, it, vi } from "vitest";
import { esCodigoEquipo, guardaRegistro } from "../routes/equipo.js";
import { HERRAMIENTAS_EQUIPO } from "../routes/conector-mcp.js";

/** Una base que no tiene ninguna invitación vigente. */
const sinInvitaciones = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
} as never;

function correr(headers: Record<string, string>) {
  const res = { statusCode: 0, body: null as unknown, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  const next = vi.fn();
  return guardaRegistro(sinInvitaciones)({ headers } as never, res as never, next).then(() => ({ res, next }));
}

describe("registro cerrado (16/10)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("el código del equipo abre; sin código o con otro, 403", async () => {
    vi.stubEnv("LMTM_INVITACION_EQUIPO", "codigo-del-equipo-123");
    expect((await correr({ "x-lmtm-invitacion": "codigo-del-equipo-123" })).next).toHaveBeenCalled();
    const sin = await correr({});
    expect(sin.next).not.toHaveBeenCalled();
    expect(sin.res.statusCode).toBe(403);
    expect((await correr({ "x-lmtm-invitacion": "codigo-del-equipo-124" })).res.statusCode).toBe(403);
  });

  it("sin código cargado en el servidor, nadie entra por código", () => {
    vi.stubEnv("LMTM_INVITACION_EQUIPO", "");
    expect(esCodigoEquipo("")).toBe(false);
    expect(esCodigoEquipo(undefined)).toBe(false);
  });
});

describe("conector del equipo", () => {
  it("no expone pauta, SQL, WhatsApp a clientes ni la API genérica", () => {
    for (const prohibida of ["lmtmSql", "lmtmPauseAdEntity", "lmtmSetBudget", "lmtmShiftBudget", "lmtmDuplicateWinner", "lmtmSendWhatsappReport", "lmtmSendBalanceAlert", "lmtmHerramientaAgente", "paperclipApiRequest", "lmtmCrmRequest"]) {
      expect(HERRAMIENTAS_EQUIPO).not.toContain(prohibida);
    }
    expect(HERRAMIENTAS_EQUIPO).toEqual(expect.arrayContaining(["lmtmGenerarContenido", "lmtmGenerarPieza"]));
  });
});
