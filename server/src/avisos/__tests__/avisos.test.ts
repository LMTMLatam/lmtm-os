// Lo que estos tests protegen: que al equipo lo interrumpa solo lo que importa,
// como mucho 3 veces por día, y que nada de lo demás se pierda.
import { describe, expect, it } from "vitest";
import { decidirAviso, nivelEfectivo, TOPE_INTERRUPCIONES_DIA } from "../politica.js";
import { medirInterrupciones, type FilaOutbox } from "../medir.js";
import { armarMensajeIncidentes } from "../incidentes.js";
import { armarPendientesCortos, armarResumen, fechaLarga, tocaResumen } from "../resumen.js";

describe("política", () => {
  it("solo los incidentes y los envíos manuales pueden ser nivel 5", () => {
    expect(nivelEfectivo("incidentes", 5)).toBe(5);
    expect(nivelEfectivo("alertas-cliente (manual)", 5)).toBe(5);
    expect(nivelEfectivo("vigilante-financiero", 5)).toBe(4);
    expect(nivelEfectivo("monitor-saldo", 3)).toBe(3);
  });

  it("el tope es de la agencia: cuenta las interrupciones de todos los orígenes", () => {
    expect(decidirAviso({ origen: "incidentes", nivel: 5, yaDicho: false, interrupcionesHoy: TOPE_INTERRUPCIONES_DIA }).accion).toBe("digest");
  });

  it("lo que manda una persona con un botón sale aunque se haya llegado al tope", () => {
    // Antes la cuarta prueba del gateway del día devolvía "falló" con el
    // gateway andando, y un "avisar" pedido a propósito esperaba a mañana.
    for (const origen of ["prueba-gateway", "alertas-cliente (manual)"]) {
      expect(decidirAviso({ origen, nivel: 5, yaDicho: false, interrupcionesHoy: TOPE_INTERRUPCIONES_DIA }).accion).toBe("enviar");
    }
  });
});

describe("medición sobre el historial de wa_outbox", () => {
  // Un día como los de antes: dos briefs, el vigilante financiero en nivel 5,
  // ocho avisos de nivel 4 y un incidente.
  const hora = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 3, h + 3, m)); // 3/10 en Buenos Aires
  const dia: FilaOutbox[] = [
    { createdAt: hora(8), nivel: 4, origen: "brief", clave: "brief:m", estado: "enviado" },
    { createdAt: hora(18), nivel: 4, origen: "brief", clave: "brief:t", estado: "enviado" },
    ...Array.from({ length: 8 }, (_, i): FilaOutbox => ({ createdAt: hora(10, i), nivel: 4, origen: "sin-publicar", clave: `sp:${i}`, estado: "enviado" })),
    { createdAt: hora(11), nivel: 5, origen: "vigilante-financiero", clave: "fin:1", estado: "enviado" },
    { createdAt: hora(12), nivel: 5, origen: "monitor-saldo", clave: "saldo:1", estado: "enviado" },
    { createdAt: hora(9), nivel: 5, origen: "incidentes", clave: "inc:1", estado: "enviado" },
    { createdAt: hora(13), nivel: 3, origen: "auditor", clave: "aud:1", estado: "pendiente" },
  ];

  it("cuenta lo que interrumpió de verdad y lo que interrumpiría ahora", () => {
    const [d] = medirInterrupciones(dia);
    expect(d.dia).toBe("2026-10-03");
    expect(d.interrupcionesAntes).toBe(13);
    expect(d.interrupcionesAhora).toBe(1);
    expect(d.quienInterrumpe).toEqual(["incidentes"]);
  });

  it("aunque haya muchos incidentes, nunca pasa del tope", () => {
    const muchos: FilaOutbox[] = Array.from({ length: 7 }, (_, i) => ({ createdAt: hora(9, i), nivel: 5, origen: "incidentes", clave: `inc:${i}`, estado: "enviado" }));
    const [d] = medirInterrupciones(muchos);
    expect(d.interrupcionesAhora).toBe(TOPE_INTERRUPCIONES_DIA);
  });

  it("el resumen de las 9:00 no es una interrupción", () => {
    const [d] = medirInterrupciones([{ createdAt: hora(9), nivel: 3, origen: "resumen-diario", clave: "r", estado: "enviado" }]);
    expect(d.interrupcionesAntes).toBe(0);
    expect(d.interrupcionesAhora).toBe(0);
  });

  it("lo manual se cuenta aparte y no ocupa el tope del sistema", () => {
    const filas: FilaOutbox[] = [
      ...Array.from({ length: 4 }, (_, i): FilaOutbox => ({ createdAt: hora(8, i), nivel: 5, origen: "prueba-gateway", clave: `p:${i}`, estado: "enviado" })),
      { createdAt: hora(9), nivel: 5, origen: "incidentes", clave: "inc:1", estado: "enviado" },
    ];
    const [d] = medirInterrupciones(filas);
    expect(d.manuales).toBe(4);
    expect(d.interrupcionesAhora).toBe(1);
  });

  it("el día es el de Buenos Aires, no el UTC", () => {
    // 23:30 del 3/10 acá son las 2:30 UTC del 4/10.
    const [d] = medirInterrupciones([{ createdAt: new Date(Date.UTC(2026, 9, 4, 2, 30)), nivel: 5, origen: "incidentes", clave: "x", estado: "enviado" }]);
    expect(d.dia).toBe("2026-10-03");
  });
});

describe("mensaje de incidentes", () => {
  it("uno solo, ordenado por plata, con el link a Hoy", () => {
    const t = armarMensajeIncidentes(
      [
        { cliente: "HANSHI", que: "Reconectar Google Ads de HANSHI: el sync falla desde el 14/09", arsPorDia: null, clave: "a" },
        { cliente: "DISTRILLANTAS", que: "Destrabar la cuenta de Meta: está frenada", arsPorDia: 30_000, clave: "b" },
      ],
      "https://x/LMTM/hoy",
    )!;
    expect(t.startsWith("🔴 *2 incidentes*")).toBe(true);
    expect(t.indexOf("DISTRILLANTAS")).toBeLessThan(t.indexOf("HANSHI"));
    expect(t).toContain("$30.000 por día");
    expect(t).toContain("https://x/LMTM/hoy");
  });

  it("sin incidentes no hay mensaje", () => {
    expect(armarMensajeIncidentes([], "u")).toBeNull();
  });
});

describe("resumen de las 9:00", () => {
  const d = (cliente: string, que: string, arsPorDia: number | null) => ({ cliente, que, arsPorDia }) as never;

  it("arriba los incidentes, después la plata parada y las tres que más pesan, con el link", () => {
    const t = armarResumen(
      {
        incidentes: [d("DISTRILLANTAS", "Destrabar la cuenta de Meta", 30_000)],
        decisiones: [d("MA PROPIEDADES", "Averiguar por qué dejó de gastar", 48_217), d("A", "x", 1), d("B", "y", 2), d("C", "z", null)],
        esperando: [d("D", "w", null)],
        plataParada: 78_217,
        whatsapp: "conectado",
      },
      "https://x/LMTM/hoy",
      new Date(Date.UTC(2026, 9, 6, 12)),
    );
    expect(t.split("\n")[0]).toBe("*Hoy, martes 6 de octubre*");
    expect(t.indexOf("1 incidente")).toBeLessThan(t.indexOf("$78.217 por día parados"));
    expect(t).toContain("Para decidir (4), lo que más pesa:");
    expect(t).toContain("1. *MA PROPIEDADES*");
    expect(t).not.toContain("4. ");
    expect(t).toContain("1 ya hecha espera");
    expect(t.trim().endsWith("https://x/LMTM/hoy")).toBe(true);
  });

  it("sin plata medida no dice '$0 parados'", () => {
    const t = armarResumen({ incidentes: [], decisiones: [], esperando: [], plataParada: null, whatsapp: "conectado" }, "u");
    expect(t).not.toContain("parados");
    expect(t).toContain("No hay decisiones pendientes.");
  });

  it("lo pendiente va una línea por aviso, con su texto y nombres para una persona", () => {
    // Después de mandarlo se marca entregado y no queda en otra pantalla:
    // "Pauta automática 1" sin decir que falló sería perderlo.
    const t = armarPendientesCortos([
      { origen: "sin-publicar", nivel: 3, texto: "MAERS sin publicar" },
      { origen: "pauta-automatica", nivel: 4, texto: "Intentó solo y *FALLÓ*:\nsubir presupuesto de MAERS" },
      { origen: "algo-nuevo", nivel: 2, texto: "x" },
    ])!;
    const lineas = t.split("\n");
    expect(lineas[0]).toBe("*Otros avisos desde ayer (3):*");
    expect(lineas[1]).toBe("• Pauta automática: Intentó solo y FALLÓ: subir presupuesto de MAERS");
    expect(t).toContain("• Clientes sin publicar: MAERS sin publicar");
    expect(t).toContain("• Otros avisos: x");
    // Ningún nombre interno de módulo llega al mensaje.
    expect(t).not.toMatch(/pauta-automatica|algo-nuevo|sin-publicar/);
  });

  it("el mismo aviso reencolado cada hora sale una vez, con el texto más nuevo", () => {
    // 06/10: "Redes sin actividad" ×4 que solo cambiaban en "96d 19h" → "96d 20h".
    const t = armarPendientesCortos([
      { origen: "inactividad-redes", nivel: 3, clave: "inactividad:DUNOD", texto: "DUNOD 96d 19h" },
      { origen: "inactividad-redes", nivel: 3, clave: "inactividad:DUNOD", texto: "DUNOD 96d 20h" },
      { origen: "inactividad-redes", nivel: 3, clave: "inactividad:DUNOD", texto: "DUNOD 96d 21h" },
      { origen: "sin-publicar", nivel: 3, clave: null, texto: "MAERS sin publicar" },
      { origen: "sin-publicar", nivel: 3, clave: null, texto: "MAERS sin publicar" },
    ])!;
    expect(t.split("\n")[0]).toBe("*Otros avisos desde ayer (2):*");
    expect(t.match(/DUNOD/g)).toHaveLength(1);
    expect(t).toContain("DUNOD 96d 21h");
    expect(t.match(/MAERS/g)).toHaveLength(1);
  });

  it("los incidentes no se repiten abajo: ya van arriba, leídos de Hoy", () => {
    // 06/10: el incidente salía arriba y otra vez en "Otros avisos".
    expect(armarPendientesCortos([{ origen: "incidentes", nivel: 5, texto: "DISTRILLANTAS frenada" }])).toBeNull();
    const t = armarPendientesCortos([
      { origen: "incidentes", nivel: 5, texto: "DISTRILLANTAS frenada" },
      { origen: "sin-publicar", nivel: 3, texto: "MAERS sin publicar" },
    ])!;
    expect(t.split("\n")[0]).toBe("*Otros avisos desde ayer (1):*");
    expect(t).not.toContain("DISTRILLANTAS");
  });

  it("si son muchos, los que sobran van contados por tema", () => {
    const filas = Array.from({ length: 15 }, (_, i) => ({ origen: i < 13 ? "sin-publicar" : "auditor", nivel: 3, texto: `aviso ${i}` }));
    const t = armarPendientesCortos(filas)!;
    expect(t.split("\n").filter((l) => l.startsWith("• "))).toHaveLength(12);
    expect(t).toContain("_y 3 más: Auditoría diaria 2 · Clientes sin publicar 1._");
  });

  it("se intenta de 9 a 12: un deploy a las 9:52 o el gateway caído a las 9 no pierden el día", () => {
    expect([8, 9, 10, 11, 12].map(tocaResumen)).toEqual([false, true, true, true, false]);
  });

  it("la fecha es la de Buenos Aires", () => {
    // 01:00 UTC del 7/10 es todavía el 6/10 acá.
    expect(fechaLarga(new Date(Date.UTC(2026, 9, 7, 1)))).toBe("martes 6 de octubre");
  });
});
