// La regla que estos tests protegen: el monologo interno del modelo NUNCA
// viaja en `content`, porque de ahi sale a lo que el agente entrega al cliente.
//
// Los casos no son inventados: son las respuestas reales que devolvio
// MiniMax-M3 el 5/10/26 al pedirle copy de Instagram y un analisis de pauta.
import { describe, expect, it } from "vitest";
import { parseMinimaxCompletion, splitThinkBlock } from "../parse.js";

describe("splitThinkBlock", () => {
  it("no toca un content sin think", () => {
    expect(splitThinkBlock("Renova tus cubiertas.")).toEqual({ content: "Renova tus cubiertas." });
  });

  it("saca el bloque y deja solo la respuesta", () => {
    const real =
      "<think>\nThe user is asking me to write Instagram post copy for a tire shop " +
      "(gomeria) in Cordoba, Argentina.\n</think>\n20% OFF en cubiertas toda la semana.";
    const r = splitThinkBlock(real);
    expect(r.content).toBe("20% OFF en cubiertas toda la semana.");
    expect(r.think).toContain("Instagram post copy");
    expect(r.content).not.toContain("<think>");
  });

  it("un think sin cerrar NO se deja pasar", () => {
    // Si la respuesta se corta por max_tokens el `</think>` nunca llega y el
    // content entero es razonamiento. Dejarlo pasar es el peor de los dos
    // errores: el cliente recibe el monologo y nada mas.
    const r = splitThinkBlock("<think>The user wants me to analyze Conjunto A and B");
    expect(r.content).toBe("");
    expect(r.think).toContain("Conjunto A");
  });

  it("aguanta varios bloques", () => {
    const r = splitThinkBlock("<think>uno</think>Hola.<think>dos</think> Chau.");
    expect(r.content).toBe("Hola. Chau.");
    expect(r.think).toBe("uno\n\ndos");
  });

  it("un think vacio no inventa razonamiento", () => {
    expect(splitThinkBlock("<think></think>Listo.")).toEqual({ content: "Listo." });
  });

  it("no se come un content que solo menciona la palabra think", () => {
    const t = "Pense en el titulo: I think we should scale.";
    expect(splitThinkBlock(t)).toEqual({ content: t });
  });
});

describe("parseMinimaxCompletion", () => {
  const completion = (message: Record<string, unknown>) => ({
    choices: [{ message, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });

  it("el content que llega al transcript viene limpio", () => {
    const p = parseMinimaxCompletion(
      completion({ content: "<think>internal english monologue</think>Pausa el conjunto B." }),
    );
    expect(p.message.content).toBe("Pausa el conjunto B.");
    expect(p.message.reasoningContent).toContain("internal english monologue");
  });

  it("junta el reasoning del canal propio con el embebido, sin perder ninguno", () => {
    const p = parseMinimaxCompletion(
      completion({ reasoning_content: "del canal", content: "<think>embebido</think>Ok." }),
    );
    expect(p.message.content).toBe("Ok.");
    expect(p.message.reasoningContent).toBe("del canal\n\nembebido");
  });

  it("sin think se comporta igual que antes", () => {
    const p = parseMinimaxCompletion(completion({ content: "Ok.", reasoning_content: "x" }));
    expect(p.message.content).toBe("Ok.");
    expect(p.message.reasoningContent).toBe("x");
  });
});
