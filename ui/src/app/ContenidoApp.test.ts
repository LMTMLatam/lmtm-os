import { describe, expect, it } from "vitest";
import { nombreDia } from "./ContenidoApp";

describe("nombreDia — el día del calendario de Super Redes", () => {
  it("hoy, mañana y ayer por nombre; el resto con el día de la semana", () => {
    expect(nombreDia("2026-10-07", "2026-10-07")).toBe("Hoy");
    expect(nombreDia("2026-10-08", "2026-10-07")).toBe("Mañana");
    expect(nombreDia("2026-10-06", "2026-10-07")).toBe("Ayer");
    expect(nombreDia("2026-10-09", "2026-10-07")).toBe("viernes 9");
    expect(nombreDia("2026-11-02", "2026-10-31")).toBe("lunes 2");
  });
});
