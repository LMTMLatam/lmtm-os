// Auditoría 20/11: las rutas sin login (dashboards de clientes) no tenían techo de pedidos.
import { describe, expect, it } from "vitest";
import { crearLimite, ipDe } from "../middleware/limite-publico.js";
import { ventanaPublica } from "../routes/public-dashboards.js";

describe("tope de pedidos públicos", () => {
  it("corta al pasar el tope y vuelve a dejar pasar en la ventana siguiente", () => {
    const pasa = crearLimite(2, 60_000);
    expect(pasa("1.1.1.1", 0)).toBe(true);
    expect(pasa("1.1.1.1", 10)).toBe(true);
    expect(pasa("1.1.1.1", 20)).toBe(false);
    expect(pasa("2.2.2.2", 30)).toBe(true); // otra IP, otra cuenta
    expect(pasa("1.1.1.1", 60_000)).toBe(true);
  });
  it("toma la IP que agrega el proxy, no la que escribe quien pide", () => {
    expect(ipDe("6.6.6.6, 10.0.0.1, 200.1.2.3", "10.9.9.9")).toBe("200.1.2.3");
    expect(ipDe(undefined, "10.9.9.9")).toBe("10.9.9.9");
  });
});

describe("ventana del dashboard público", () => {
  it("por defecto va de hoy-30 a ayer", () => {
    expect(ventanaPublica(undefined, undefined, "2026-11-20")).toEqual({ since: "2026-10-21", until: "2026-11-19" });
  });
  it("rechaza fechas mal escritas, imposibles o al revés", () => {
    expect(ventanaPublica("2026-11-1", "2026-11-19", "2026-11-20")).toBeNull();
    expect(ventanaPublica("2026-02-30", "2026-03-10", "2026-11-20")).toBeNull();
    expect(ventanaPublica("2026-11-19'; drop", "2026-11-19", "2026-11-20")).toBeNull();
    expect(ventanaPublica("2026-11-19", "2026-11-01", "2026-11-20")).toBeNull();
  });
});
