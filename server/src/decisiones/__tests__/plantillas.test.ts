// Lo que este test protege: el motor no le abre decisiones a lo que no es un
// cliente. "Cliente Natural" y "Cliente Inmobiliario" son las carpetas de la
// plantilla de ClickUp; la cadena de publicación (que lee Make, no la tabla de
// clientes) les abría decisiones el 06/10.
import { describe, expect, it } from "vitest";


describe("soloClientesReales", () => {
  it("saca las propuestas de plantillas y de clientes inactivos, y deja el resto igual", async () => {
    const { soloClientesReales } = await import("../motor.js");
    const p = (clientId: string) => ({ clientId, tipo: "cadena:make", que: "x" }) as any;
    const r = soloClientesReales(
      [
        { regla: "cadena_publicacion", evaluada: true, propuestas: [p("real"), p("plantilla"), p("inactivo")] },
        { regla: "cola_humana", evaluada: false, propuestas: [] },
      ],
      new Set(["real", "plantilla"]),
      new Set(["plantilla"]),
    );
    expect(r[0].propuestas.map((x) => x.clientId)).toEqual(["real"]);
    // Sigue evaluada: lo que estaba abierto para la plantilla vence por "dejó de aplicar".
    expect(r[0].evaluada).toBe(true);
    expect(r[1]).toEqual({ regla: "cola_humana", evaluada: false, propuestas: [] });
  });
});
