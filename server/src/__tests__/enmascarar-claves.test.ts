import { describe, expect, it } from "vitest";
import { enmascararClaves } from "../redaction.js";

describe("enmascararClaves", () => {
  it("tapa las claves que aparecieron en corridas reales", () => {
    const s = enmascararClaves(
      [
        "psql postgresql://postgres:superclave123@host:5432/db",
        "token EAABwzLixnjYBO1234567890abcdefghij",
        "pk_12345678_ABCDEFGHIJKLMNOPQRST",
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123",
        "META_APP_SECRET=abc123def456",
        "CLICKUP_API_TOKEN: \"xyz987654321\"",
        "refresh 1//0gAbCdEfGhIjKlMnOpQrStUvWxYz0123456789",
      ].join("\n"),
    );
    for (const no of ["superclave123", "EAABwzLixnjYBO", "ABCDEFGHIJKLMNOPQRST", "abcdefghijklmnopqrstuvwxyz123", "abc123def456", "xyz987654321", "0gAbCdEfGhIj"]) {
      expect(s).not.toContain(no);
    }
  });

  it("no toca texto común", () => {
    const t = "Guardé churn-risk-galaxy-2026 en la memoria; el TOKEN de ClickUp vence. Corrí risk-analysis-largo-de-verdad.";
    expect(enmascararClaves(t)).toBe(t);
  });
});
