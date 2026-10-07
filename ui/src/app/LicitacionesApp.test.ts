import { describe, expect, it } from "vitest";
import { cierre } from "./LicitacionesApp";

describe("cierre de una licitación", () => {
  const ahora = Date.UTC(2026, 9, 7, 12);
  it("cuenta los días y marca urgente a 5 o menos", () => {
    expect(cierre("2026-10-20T12:00:00Z", ahora)).toEqual({ txt: "cierra en 13 días", urgente: false });
    expect(cierre("2026-10-09T12:00:00Z", ahora)).toEqual({ txt: "cierra en 2 días", urgente: true });
    expect(cierre("2026-10-08T11:00:00Z", ahora)).toEqual({ txt: "cierra en 1 día", urgente: true });
    expect(cierre("2026-10-07T10:00:00Z", ahora)).toEqual({ txt: "cerrada", urgente: false });
    expect(cierre(null, ahora)).toEqual({ txt: "sin fecha de cierre", urgente: false });
  });
});
