import { describe, expect, it } from "vitest";
import { resumirGastos, type FilaGasto } from "../contenido-generado.js";

const f = (o: Partial<FilaGasto>): FilaGasto => ({ clientId: "c1", pieza: "t1", herramienta: "higgsfield_plan", origen: "clickup", creditos: null, usd: null, ...o });

describe("resumirGastos", () => {
  it("suma por herramienta sin mezclar bolsas y sin inventar ceros", () => {
    const r = resumirGastos([
      f({ creditos: 56 }), f({ creditos: 56 }), f({ creditos: 56 }), // un reel: 3 clips
      f({ herramienta: "higgsfield_api", pieza: "t2", creditos: 30, usd: 0.09 }),
      f({ herramienta: "magnific", pieza: "t3" }),
    ], new Set(["t1", "t2", "t3"]));
    const plan = r.porHerramienta.find((t) => t.herramienta === "higgsfield_plan")!;
    expect(plan).toMatchObject({ generaciones: 3, creditos: 168, usd: null, sinCosto: 0, noEntregadas: 0 });
    const mag = r.porHerramienta.find((t) => t.herramienta === "magnific")!;
    expect(mag).toMatchObject({ generaciones: 1, creditos: null, usd: null, sinCosto: 1 });
    expect(r.porPieza.get("t1")).toEqual([expect.objectContaining({ generaciones: 3, creditos: 168 })]);
  });

  it("cuenta lo pagado que no terminó en una pieza entregada", () => {
    const r = resumirGastos([f({ creditos: 56 }), f({ pieza: "perdida", creditos: 56 }), f({ pieza: null, creditos: 2 })], new Set(["t1"]));
    expect(r.porHerramienta[0]).toMatchObject({ generaciones: 3, creditos: 114, noEntregadas: 2 });
  });

  it("una generación sin costo no borra la suma de las que sí lo informaron", () => {
    const r = resumirGastos([f({ creditos: 8 }), f({})], new Set(["t1"]));
    expect(r.porHerramienta[0]).toMatchObject({ creditos: 8, sinCosto: 1 });
    expect(r.porCliente.get("c1")?.[0].generaciones).toBe(2);
  });
});
