// La regla que estos tests protegen: ordenar el sidebar NO puede dejar páginas
// huérfanas, y la lista de arriba no puede volver a crecer.
//
// El sidebar tenía 22 entradas planas y se reorganizó a 6 visibles + 2 grupos
// colapsados. Las dos formas de arruinarlo son simétricas:
//   · "simplificar" borrando un link → la página queda sin forma de llegar
//   · agregar "una más" arriba cada vez → se vuelve a 22 de a poco
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "..", "..", "src");
const SIDEBAR = readFileSync(join(DIR, "components", "Sidebar.tsx"), "utf8");
const APP = readFileSync(join(DIR, "App.tsx"), "utf8");

/** Las 22 rutas que el sidebar exponía antes de ordenarlo. Ninguna se borró. */
const RUTAS_ORIGINALES = [
  "/activity",
  "/clients",
  "/company/settings",
  "/contenido",
  "/costs",
  "/dashboard",
  "/finance",
  "/goals",
  "/growth",
  "/inbox",
  "/intelligence",
  "/issues",
  "/licitaciones",
  "/niches",
  "/org",
  // "/paid-media" (Pauta) se retiró en B4: la cubren Clientes (Cartera) y
  // Cliente → Dashboard. La ruta redirige a /cartera, así que no queda huérfana.
  "/readiness",
  "/routines",
  "/search",
  "/skills",
  "/whatsapp",
  "/workspaces",
];

function linksDelSidebar(): string[] {
  return [...SIDEBAR.matchAll(/to="(\/[a-z0-9/-]+)"/g)].map((m) => m[1]);
}

/**
 * El bloque de arriba: desde el primer SidebarNavItem hasta el primer
 * SidebarSection. Es lo que una persona ve sin hacer un solo click.
 */
function bloqueSiempreVisible(): string {
  const desde = SIDEBAR.indexOf("<SidebarNavItem");
  const hasta = SIDEBAR.indexOf("<SidebarSection");
  expect(desde).toBeGreaterThan(-1);
  expect(hasta).toBeGreaterThan(desde);
  return SIDEBAR.slice(desde, hasta);
}

describe("sidebar: no deja páginas huérfanas", () => {
  it.each(RUTAS_ORIGINALES)("sigue llegando a %s", (ruta) => {
    expect(linksDelSidebar()).toContain(ruta);
  });

  it("toda ruta del sidebar existe en App.tsx", () => {
    // Un link a una ruta que no está registrada lleva al 404, que es peor que
    // no tener el link: parece que la función existe y está rota.
    const sinRegistrar = linksDelSidebar()
      .filter((r) => r !== "/search")
      .filter((ruta) => {
        const segmento = ruta.replace(/^\//, "");
        // `skills/*` y compañía: algunas rutas se declaran con splat porque la
        // página maneja sus propias sub-rutas adentro.
        const declarada = new RegExp(`path="/?${segmento}(/\\*)?"`);
        return !declarada.test(APP);
      });
    expect(sinRegistrar, `rutas sin <Route> en App.tsx: ${sinRegistrar.join(", ")}`).toEqual([]);
  });
});

describe("sidebar: la lista de arriba no vuelve a crecer", () => {
  it("hay como máximo 7 destinos siempre visibles", () => {
    // 6 de B4 (Bandeja lleva el único indicador de error del sidebar) + Pauta,
    // que vuelve en la fase C (pedido 06/10: no perder ninguna función).
    const visibles = [...bloqueSiempreVisible().matchAll(/<SidebarNavItem/g)].length;
    expect(visibles).toBeLessThanOrEqual(7);
  });

  it("los de arriba son los del día a día", () => {
    const arriba = [...bloqueSiempreVisible().matchAll(/to="(\/[a-z0-9/-]+)"/g)].map((m) => m[1]);
    // "/hoy" reemplazó a "/dashboard" (rediseño B2): el tablero viejo sigue
    // llegándose como "Operación", dentro de Sistema.
    expect(arriba).toEqual([
      "/hoy",
      "/inbox",
      // "/cartera" reemplazó a "/clients" arriba (B3); las fichas siguen en "Más".
      "/cartera",
      "/dashboard",
      // Pauta vuelve en la fase C (B4 la había retirado).
      "/paid-media",
      "/contenido",
      "/company/settings",
    ]);
  });

  it("los dos grupos arrancan cerrados", () => {
    // Si arrancan abiertos no se ordenó nada: se ven las 22 igual.
    expect(SIDEBAR).toContain('useSeccionAbierta("sidebar:mas", false)');
    expect(SIDEBAR).toContain('useSeccionAbierta("sidebar:sistema", false)');
  });
});

describe("lo que volvió en la fase C", () => {
  it("el hub de Pauta vive en la app propia y /paid-media lleva ahí", () => {
    expect(APP).toMatch(/path="pauta" element=\{<Pagina><PaidMediaHub \/><\/Pagina>\}/);
    expect(APP).toMatch(/path="paid-media" element=\{<Navigate to="\/pauta" replace \/>\}/);
  });
});
