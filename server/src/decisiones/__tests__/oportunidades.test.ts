import { describe, expect, it } from "vitest";
import { propuestasDeOportunidad } from "../reglas/oportunidades.js";
import { armarFranjas } from "../hoy.js";
import { armarResumen } from "../../avisos/resumen.js";
import { planificar } from "../reconciliar.js";
import type { Ejemplo } from "../../services/contenido-analisis.js";

const ej = (o: Partial<Ejemplo>): Ejemplo => ({
  clientId: "c1", cliente: "BRISANOVA ", slug: "b", red: "instagram", formato: "reel", angulo: "detras", anguloNombre: "Cómo se hace / detrás de escena",
  indice: 3.1, engagement: 120, fecha: "2026-10-05T12:00:00Z", permalink: "https://instagram.com/p/x", texto: "Así armamos la obra", ...o,
});
const ahora = new Date("2026-10-08T12:00:00Z");

describe("oportunidades (08/10: que no todo sea saldo y pausar)", () => {
  const a = {
    clientes: [
      { clientId: "c1", cliente: "BRISANOVA ", slug: "b", nicho: "inmobiliaria", publicaciones: 40, top: [], mejorAngulo: null, mejorReciente: ej({}),
        oportunidad: { angulo: "objecion", nombre: "La objeción #1 respondida", indiceEnNicho: 1.7, publicacionesNicho: 6, cuentasNicho: 4, usosPropios: 0 } },
      { clientId: "c2", cliente: "GALA", slug: "g", nicho: null, publicaciones: 20, top: [], mejorAngulo: null, oportunidad: null,
        mejorReciente: ej({ clientId: "c2", cliente: "GALA", fecha: "2026-09-01T00:00:00Z" }) },
    ],
    nichos: [],
  };

  it("con pauta: repetir su mejor post reciente; sin pauta: ofrecerle pauta. Uno por cliente y solo de 14 días", () => {
    const con = propuestasDeOportunidad(a, new Set(["c1"]), ahora);
    const reut = con.filter((p) => p.tipo === "contenido:reutilizar");
    expect(reut).toHaveLength(1);
    expect(reut[0].que).toContain("3,1×");
    expect(reut[0].arsPorDia).toBeNull();
    expect(con.some((p) => p.clientId === "c2")).toBe(false); // el de septiembre no es reciente
    const sin = propuestasDeOportunidad(a, new Set(), ahora);
    expect(sin.find((p) => p.clientId === "c1" && p.tipo === "upsell:pauta")?.que).toContain("no tiene anuncios");
  });

  it("el ángulo del rubro que no usa, con la muestra y sin nombrar a otra cuenta", () => {
    const [p] = propuestasDeOportunidad(a, new Set(["c1"]), ahora).filter((x) => x.tipo === "contenido:angulo");
    expect(p.que).toContain("nunca lo usó");
    expect(p.porque.resumen).toContain("6 publicaciones de 4 cuentas");
  });

  it("van arriba en Hoy y abren el resumen; el saldo por cargar va en una línea", () => {
    const d = (tipo: string, que: string, extra: object = {}) => ({ id: tipo, clientId: "c1", cliente: "X", tipo, que, estado: "abierta", porque: { resumen: "", datos: [] }, arsPorDia: null, ...extra }) as never;
    const f = armarFranjas([
      d("saldo:bajo", "Cargar saldo en la cuenta de Google Ads: se frena en 5 días", { porque: { resumen: "", datos: [{ etiqueta: "Días hasta frenarse", valor: 5 }] } }),
      d("contenido:reutilizar", "Repetir lo que funcionó"),
      d("pauta:escalar", "Subir 20% el presupuesto"),
      d("pauta:sin_leads", "Revisar campaña sin leads"),
    ]);
    expect(f.oportunidades.map((x) => x.tipo)).toEqual(["pauta:escalar", "contenido:reutilizar"]);
    const texto = armarResumen({ ...f, whatsapp: "conectado" }, "https://x/hoy", ahora);
    expect(texto.indexOf("💡 Oportunidades")).toBeLessThan(texto.indexOf("Para decidir"));
    expect(texto).toContain("Saldo para avisarle al cliente: X (Google, 5 días).");
    expect(texto).not.toContain("1. *X* — Cargar saldo");
  });

  it("una oportunidad hecha que sigue apareciendo no se reabre como 'el dato sigue igual'", () => {
    const [p] = propuestasDeOportunidad(a, new Set(["c1"]), ahora).filter((x) => x.tipo === "contenido:reutilizar");
    const viva = { id: "v1", clave: p.clave, estado: "ejecutada", creadaPor: "regla:oportunidades", accion: p.accion, porque: p.porque, ejecutadaAt: new Date("2026-09-20T00:00:00Z") } as never;
    const ops = planificar([viva], [{ regla: "oportunidades", evaluada: true, propuestas: [p], datosHasta: ahora }], ahora);
    expect(ops.filter((o) => o.op === "no_confirmada")).toEqual([]);
  });
});
