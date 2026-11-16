// Lo que protege: una falla pasajera de Google al renovar el acceso (internal_failure, 5xx) NO marca la
// conexión como caída; solo una revocación real pide reconectar (16/11: bloqueaba toda la auditoría de Google).
import { describe, expect, it } from "vitest";
import { esRevocacion } from "../token-refresh.js";

describe("esRevocacion", () => {
  it("revocación real: hay que reconectar", () => {
    expect(esRevocacion('Google token error: invalid_grant — { "error": "invalid_grant", "error_description": "Token has been expired or revoked." }')).toBe(true);
    expect(esRevocacion("Google token error: unauthorized_client")).toBe(true);
  });
  it("falla pasajera de Google: no", () => {
    expect(esRevocacion('Google token error: internal_failure — { "error": "internal_failure" }')).toBe(false);
    expect(esRevocacion("Google token error: 503 Service Unavailable")).toBe(false);
    expect(esRevocacion("fetch failed: ECONNRESET")).toBe(false);
  });
});
