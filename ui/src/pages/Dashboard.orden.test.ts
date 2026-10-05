// La regla que este test protege: "Hoy" abre con el NEGOCIO, no con el harness.
//
// La pantalla arrancaba con una fila de métricas de la maquinaria —agentes
// corriendo, tareas en curso, procesos— y el estado de la cartera quedaba más
// abajo. Lo que alguien necesita al abrir "Hoy" es qué hay que decidir hoy y
// cuánta plata está parada, no cuántos procesos viven.
//
// Es un orden, así que se rompe sin que nadie lo note: la próxima card que
// alguien quiera destacar se agrega arriba, y la pantalla vuelve a hablar de sí
// misma en vez del trabajo de la agencia.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = readFileSync(join(__dirname, "Dashboard.tsx"), "utf8");

/** Posición del primer uso como JSX (no la definición ni el import). */
function posicionDe(marca: string): number {
  const i = SRC.indexOf(marca);
  expect(i, `no encontré ${marca} en Dashboard.tsx`).toBeGreaterThan(-1);
  return i;
}

describe("orden de la pantalla Hoy", () => {
  it("el centro de mando va ANTES que el estado del sistema", () => {
    expect(posicionDe("<CentroDeMando />")).toBeLessThan(posicionDe("Estado del sistema"));
  });

  it("el panel de agentes y las métricas del harness están colapsados", () => {
    // Dentro del <details>, no sueltos arriba.
    const details = posicionDe("Estado del sistema");
    expect(SRC.indexOf("<ActiveAgentsPanel")).toBeGreaterThan(details);
    expect(SRC.indexOf("<MetricCard")).toBeGreaterThan(details);
  });

  it("los gráficos del harness siguen colapsados", () => {
    expect(posicionDe("Métricas del sistema")).toBeGreaterThan(posicionDe("<CentroDeMando />"));
  });

  it("la plata parada se muestra en grande", () => {
    // Empezó como un span de 12px al lado del título y se perdía. Es el único
    // dato que dice cuánto cuesta no hacer nada hoy.
    expect(SRC).toContain("por día parados");
    const i = SRC.indexOf("por día parados");
    const contexto = SRC.slice(Math.max(0, i - 400), i);
    expect(contexto).toContain("text-2xl");
  });
});
