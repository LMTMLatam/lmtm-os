// @vitest-environment node

// La regla que estos tests protegen: todas las listas de "cosas que hay que
// hacer" se leen igual. Cuando dos listas que muestran lo mismo se ven
// distinto, hay que volver a aprender a leer cada una.
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// El Link del panel resuelve la ruta contra la empresa activa, asi que arrastra
// el CompanyProvider entero. Lo que se prueba aca es la ANATOMIA de la fila, no
// el ruteo: con un <a> alcanza y el test no necesita media app montada.
vi.mock("@/lib/router", () => ({
  Link: ({ to, children, ...resto }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...resto}>
      {children}
    </a>
  ),
}));

const { AccionFila } = await import("./AccionFila");

const render = (ui: React.ReactElement) => renderToStaticMarkup(ui);

describe("AccionFila", () => {
  it("una fila mínima es un link con su título", () => {
    const html = render(<AccionFila to="/issues/LMTM-1" titulo="Reconectar página Meta" />);
    expect(html).toContain("Reconectar página Meta");
    expect(html).toContain('href="/issues/LMTM-1"');
  });

  it("sin tono no dibuja el punto de color", () => {
    // Un punto gris en cada fila convierte la señal en decoración.
    expect(render(<AccionFila to="/x" titulo="Algo" />)).not.toContain("rounded-full");
    expect(render(<AccionFila to="/x" titulo="Algo" tono="critico" />)).toContain("rounded-full");
  });

  it("el motivo va en segunda línea", () => {
    // Sin esto la fila dice "Reconectar página Meta" y no dice de qué cuenta.
    const html = render(
      <AccionFila to="/x" titulo="Reconectar página Meta" motivo="La cuenta de DUNOD perdió el token" />,
    );
    expect(html).toContain("DUNOD");
    expect(html).toContain("line-clamp-1");
  });

  it("la meta destacada sale en color y seminegrita; la normal, apagada", () => {
    const html = render(
      <AccionFila
        to="/x"
        titulo="Algo"
        meta={[
          { texto: "$43.000/d", tono: "critico" },
          { texto: "MA PROPIEDADES" },
        ]}
      />,
    );
    expect(html).toContain("$43.000/d");
    expect(html).toContain("var(--estado-critico)");
    expect(html).toContain("font-semibold");
    expect(html).toContain("text-muted-foreground");
  });

  it("respeta el ORDEN en que se pasan los datos", () => {
    // La plata va antes que los días a propósito: es lo que decide el orden de
    // la cola. Si el componente reordenara, esa decisión se perdería.
    const html = render(
      <AccionFila to="/x" titulo="Algo" meta={[{ texto: "$43.000/d" }, { texto: "14d" }]} />,
    );
    expect(html.indexOf("$43.000/d")).toBeLessThan(html.indexOf("14d"));
  });

  it("un dato marcado como de escritorio se esconde en pantalla chica", () => {
    const html = render(
      <AccionFila to="/x" titulo="Algo" meta={[{ texto: "DUNOD", soloEscritorio: true }]} />,
    );
    expect(html).toContain("hidden sm:inline");
  });

  it("el tooltip explica qué mide un número suelto", () => {
    // Un "12d" sin tooltip no dice si son días esperando o días de campaña.
    const html = render(
      <AccionFila to="/x" titulo="Algo" meta={[{ texto: "12d", titulo: "12 días esperando" }]} />,
    );
    expect(html).toContain('title="12 días esperando"');
  });
});
