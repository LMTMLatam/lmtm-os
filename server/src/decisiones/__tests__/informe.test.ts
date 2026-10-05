// Lo que estos tests protegen: que lo que lee el cliente tenga solo números de
// sus métricas, de su semana, de él y en su idioma.
import { describe, expect, it } from "vitest";
import {
  auditarInforme,
  esSemanaValida,
  estadoContraObjetivo,
  renderizar,
  ultimaSemana,
  validarNarrativa,
  type Narrativa,
  type NumerosInforme,
} from "../informe.js";

const numeros = (o: Partial<NumerosInforme> = {}): NumerosInforme => ({
  desde: "2026-09-28",
  hasta: "2026-10-04",
  inversion: 210_000,
  leads: 50,
  cpl: 4_200,
  calificados: null,
  costoPorCalificado: null,
  ventas: null,
  costoPorVenta: null,
  objetivo: 5_000,
  objetivoFuente: "cliente",
  anterior: { inversion: 200_000, leads: 40, cpl: 5_000 },
  leadsDudosos: false,
  ...o,
});

const narrativa = (o: Partial<Narrativa> = {}): Narrativa => ({
  resumen: "La semana del {desde} al {hasta} el lead costó {cpl}, debajo del objetivo de {objetivo} y {variacionCpl} la semana anterior.",
  hicimos: ["Subimos el presupuesto de «Venta Pilar 2 amb» de a poco, sin reiniciar el aprendizaje."],
  aprendimos: ["El video corto trae consultas más baratas que la imagen."],
  proximos: ["Probar un segundo video con el mismo ángulo."],
  pedidos: [],
  ...o,
});

describe("la semana del informe", () => {
  it("es la última semana completa, de lunes a domingo en Buenos Aires", () => {
    // Lunes 5/10 a las 10:00 de acá: la semana es la del 28/9 al 4/10.
    expect(ultimaSemana(new Date("2026-10-05T13:00:00Z"))).toEqual({ desde: "2026-09-28", hasta: "2026-10-04" });
    // Domingo 4/10 a las 23:00 de acá (ya es lunes en UTC): todavía no terminó.
    expect(ultimaSemana(new Date("2026-10-05T02:00:00Z"))).toEqual({ desde: "2026-09-21", hasta: "2026-09-27" });
  });

  it("un agente solo puede escribir sobre una semana entera y terminada", () => {
    const ahora = new Date("2026-10-05T13:00:00Z");
    expect(esSemanaValida("2026-09-28", ahora)).toBe(true);
    expect(esSemanaValida("2026-09-29", ahora)).toBe(false); // no es lunes
    expect(esSemanaValida("2026-10-05", ahora)).toBe(false); // todavía no terminó
  });
});

describe("marcadores", () => {
  it("cada número sale de las métricas, dicho en pesos y en castellano", () => {
    const t = renderizar(narrativa().resumen, numeros());
    expect(t).toBe("La semana del 28/9 al 4/10 el lead costó $4.200, debajo del objetivo de $5.000 y 16% menos que la semana anterior.");
  });

  it("un marcador sin dato no se convierte en 0", () => {
    expect(renderizar("{costoPorCalificado}", numeros())).toBe("sin dato");
  });
});

describe("auditor", () => {
  const otros = ["MA PROPIEDADES", "DISTRILLANTAS ", "RENO", "Cosa"];

  it("un informe bien escrito pasa", () => {
    expect(auditarInforme(narrativa(), numeros(), otros)).toEqual({ ok: true, fallas: [] });
  });

  it("un número escrito a mano no pasa (el nombre entre comillas sí)", () => {
    const a = auditarInforme(narrativa({ resumen: "El lead costó $4.200 contra {objetivo}, o sea {cpl}." }), numeros(), otros);
    expect(a.ok).toBe(false);
    expect(a.fallas[0]).toContain("$4.200");
  });

  it("un marcador sin dato o inventado no pasa", () => {
    const a = auditarInforme(narrativa({ resumen: "El calificado costó {costoPorCalificado} y el lead {cpl} contra {objetivo}, {ctr}." }), numeros(), otros);
    expect(a.fallas.some((f) => f.includes("{costoPorCalificado} no tiene dato"))).toBe(true);
    expect(a.fallas.some((f) => f.includes("{ctr} no es un marcador"))).toBe(true);
  });

  it("tiene que hablar del costo por lead y del objetivo, no de CTR suelto", () => {
    const a = auditarInforme(narrativa({ resumen: "Muy buen CTR esta semana, la gente hizo clic." }), numeros(), otros);
    expect(a.fallas.some((f) => f.includes("cuánto costó el lead"))).toBe(true);
    expect(a.fallas.some((f) => f.includes("objetivo"))).toBe(true);
    expect(a.fallas.some((f) => f.includes('"CTR" es jerga'))).toBe(true);
  });

  it("el nombre de otro cliente no pasa, con o sin acentos ni mayúsculas", () => {
    const a = auditarInforme(narrativa({ aprendimos: ["Lo mismo que vimos en Distrillantas funciona acá."] }), numeros(), otros);
    expect(a.fallas.some((f) => f.includes("otro cliente (DISTRILLANTAS)"))).toBe(true);
    // Un nombre corto se busca tal cual está escrito en mayúsculas: "RENO" sí,
    // la palabra "cosa" no (daría falsos positivos con palabras comunes).
    expect(auditarInforme(narrativa({ aprendimos: ["Como hicimos con RENO."] }), numeros(), otros).ok).toBe(false);
    expect(auditarInforme(narrativa({ aprendimos: ["Cosa de todos los días: el reno no aparece."] }), numeros(), otros).ok).toBe(true);
  });

  it("si los leads incluyen Google dudoso, citarlos exige aclararlo", () => {
    const n = numeros({ leadsDudosos: true });
    expect(auditarInforme(narrativa(), n, otros).ok).toBe(false);
    const aclarado = narrativa({ resumen: narrativa().resumen + " Sin contar las conversiones de Google, que no son confiables." });
    expect(auditarInforme(aclarado, n, otros).ok).toBe(true);
  });

  it("sin próximo paso no sirve para decidir", () => {
    expect(auditarInforme(narrativa({ proximos: [] }), numeros(), otros).ok).toBe(false);
  });
});

describe("forma de la narrativa", () => {
  it("lo que falta o se pasa de largo vuelve con el motivo, para que el agente lo corrija", () => {
    expect(validarNarrativa({ hicimos: [] })).toMatchObject({ ok: false });
    expect(validarNarrativa({ resumen: "x", proximos: ["a".repeat(281)] })).toMatchObject({ ok: false });
    const v = validarNarrativa({ resumen: " Bien. ", proximos: ["Seguir"] });
    expect(v).toMatchObject({ ok: true, narrativa: { resumen: "Bien.", hicimos: [], pedidos: [], proximos: ["Seguir"] } });
  });
});

describe("estado contra el objetivo", () => {
  it("en objetivo, arriba hasta 1,5 veces, muy arriba después; sin datos no se afirma", () => {
    expect(estadoContraObjetivo(5_000, 5_000)).toBe("en_objetivo");
    expect(estadoContraObjetivo(7_000, 5_000)).toBe("arriba");
    expect(estadoContraObjetivo(8_000, 5_000)).toBe("muy_arriba");
    expect(estadoContraObjetivo(null, 5_000)).toBe("sin_dato");
    expect(estadoContraObjetivo(4_000, null)).toBe("sin_dato");
  });
});

describe("borrador automático (sin modelo)", () => {
  it("pasa el auditor: los números van con marcadores y habla del costo contra el objetivo", async () => {
    const { armarBorrador } = await import("../informes-store.js");
    const b = armarBorrador(numeros(), {
      hechas: ["Subir 20% el presupuesto de «Venta Pilar»: de $15.000 a $18.000 por día", "Cambiar el concepto del conjunto «Deptos 2 amb»: gastó $96.000"],
      abiertasEquipo: ["Reemplazar «Promo primavera»: cada persona lo vio 4,6 veces"],
      abiertasCliente: ["Cargar saldo en la cuenta de Meta: se frena en 3 días"],
    });
    expect(renderizar(b.resumen, numeros())).toBe(
      "Del 28/9 al 4/10 invertimos $210.000 y llegaron 50 consultas: cada una costó $4.200, debajo del objetivo de $5.000. Es 16% menos que la semana anterior.",
    );
    // "Subir 20%…" lleva un número escrito por la regla: no va. El resto, en pasado y sin el detalle.
    expect(b.hicimos).toEqual(["Cambiamos el concepto del conjunto «Deptos 2 amb»"]);
    expect(b.proximos).toEqual(["Reemplazar «Promo primavera»"]);
    expect(b.pedidos).toEqual(["Cargar saldo en la cuenta de Meta"]);
    expect(auditarInforme(b, numeros(), ["MA PROPIEDADES"])).toEqual({ ok: true, fallas: [] });
  });

  it("sin consultas en la semana lo dice, con la inversión y el objetivo, y también pasa", async () => {
    const { armarBorrador } = await import("../informes-store.js");
    const n = numeros({ leads: 0, cpl: null });
    const b = armarBorrador(n, { hechas: [], abiertasEquipo: [], abiertasCliente: [] });
    expect(renderizar(b.resumen, n)).toBe("Del 28/9 al 4/10 invertimos $210.000 y no llegaron consultas. El objetivo es que cada una cueste $5.000 o menos.");
    expect(b.proximos).toHaveLength(1);
    expect(auditarInforme(b, n, []).ok).toBe(true);
  });

  it("con Google dudoso lo aclara, y sin objetivo acordado no inventa uno", async () => {
    const { armarBorrador } = await import("../informes-store.js");
    const n = numeros({ leadsDudosos: true, objetivo: null, objetivoFuente: null });
    const b = armarBorrador(n, { hechas: [], abiertasEquipo: [], abiertasCliente: [] });
    expect(b.resumen).toContain("conversiones de Google que en esta cuenta no son confiables");
    expect(b.resumen).toContain("Todavía no hay un objetivo de costo por consulta acordado.");
    expect(b.resumen).not.toContain("{objetivo}");
    expect(auditarInforme(b, n, []).ok).toBe(true);
  });
});
