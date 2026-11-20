import { describe, expect, it } from "vitest";
import { contenidoPorCliente } from "./ClientesApp";

describe("contenido de cada cliente en la lista", () => {
  const ahora = Date.parse("2026-11-20T12:00:00Z");
  const dia = (d: number) => new Date(ahora + d * 86_400_000).toISOString();
  it("cuenta lo de los próximos 7 días, lo que falta completar y lo que no salió", () => {
    const m = contenidoPorCliente(
      [
        { clientId: "a", date: dia(1), readyToPublish: true },
        { clientId: "a", date: dia(3), readyToPublish: false },
        { clientId: "a", date: dia(10), readyToPublish: false }, // fuera de la semana
        { clientId: "b", date: dia(-3), readyToPublish: false }, // vencida hace días: no cuenta
      ],
      [{ clientId: "b" }, { clientId: null }],
      ahora,
    );
    expect(m.get("a")).toEqual({ programadas: 2, sinCompletar: 1, noSalieron: 0 });
    expect(m.get("b")).toEqual({ programadas: 0, sinCompletar: 0, noSalieron: 1 });
  });
});
