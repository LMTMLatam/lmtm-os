import { describe, expect, it } from "vitest";
import { paraQueDecision, paraQuePropuesta } from "./para-que";

describe("para qué sirve", () => {
  it("cada decisión abierta de hoy dice para qué sirve (los tipos del 20/11)", () => {
    const abiertas = ["cobertura:sin_meta", "cola:esperando_persona", "cadena:sin_calendario", "cobertura:fallando", "saldo:bajo", "contenido:angulo", "web:sin_conversiones",
      "cadena:destino_sin_escenario", "pauta:sumar_keywords", "cadena:contenido_incompleto", "cadena:conexion_caida", "pauta:gasto_caido", "pauta:landing", "pauta:pausar_keywords",
      "saldo:frenada", "cadena:escenario_apagado", "pauta:negativas"];
    for (const t of abiertas) expect(paraQueDecision(t), t).toBeTruthy();
    expect(paraQueDecision("pauta:negativas")).toBe("Dejar de pagar búsquedas que no traen consultas");
    expect(paraQueDecision("algo:nuevo")).toBeNull();
  });
  it("las propuestas de los agentes, por la acción y si no por el tipo", () => {
    expect(paraQuePropuesta({ tipo: "accion_pauta", accion: { accion: "pause", entityId: "1" } })).toBe("Dejar de gastar en lo que no trae consultas");
    expect(paraQuePropuesta({ tipo: "accion_web", accion: { accion: "actualizar_plugins" } })).toBe("Cerrar agujeros de seguridad de la web");
    expect(paraQuePropuesta({ tipo: "accion_codigo", accion: null })).toBe("Arreglar o sumar algo en el sistema");
    expect(paraQuePropuesta({ tipo: "request_board_approval", accion: { pedido: "x" } })).toBe("Que el agente pueda terminar la tarea");
    expect(paraQuePropuesta({ tipo: "otra", accion: null })).toBeNull();
  });
});
