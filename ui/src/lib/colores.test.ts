// La regla que este test protege: un color de ESTADO no se escribe a mano.
//
// Había 159 hex hardcodeados en 31 archivos, con TRES rojos distintos
// (#d03b3b, #ef4444, #f87171), tres grises y dos azules. Cada pantalla elegía
// el suyo, no había forma de cambiarlos todos juntos, y en dark mode varios
// quedaban ilegibles porque ninguno se adaptaba. Peor: el MISMO proyecto se
// pintaba índigo en el sidebar y gris pizarra en las rutinas.
//
// El test no prohíbe todo hex — prohíbe los que ya tienen un token.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/**
 * Lo que SÍ puede llevar hex, y por qué. Agregar algo acá pide una razón que no
 * sea "me quedaba más cómodo".
 */
const PERMITIDOS = [
  // Paleta categórica validada para daltonismo (ΔE ≥ 8 entre adyacentes), con
  // sus propias CSS vars. Es un sistema diseñado, no un descuido.
  "components/pubviz.tsx",
  // El panel público viejo, hoy "ver el detalle" del informe (B3). El informe
  // nuevo (pages/PublicDashboard.tsx) usa los tokens LMTM y no lleva hex.
  "pages/PublicDashboardDetalle.tsx",
  // Degradés decorativos de las KPI cards. Una card "rose" no es un error:
  // mapearla a un token de estado sería mentir con el color.
  "pages/PaidMediaDashboard.tsx",
  // Un placeholder que MUESTRA ejemplos de colores de marca, como texto.
  "components/MarcaCard.tsx",
];

/** Hex que ya tienen token: escribirlos a mano es el error que esto corta. */
const CON_TOKEN = [
  "#d03b3b", "#ef4444", "#f87171", "#e66767", // → --estado-critico
  "#eda100", "#facc15", "#eab308", "#f97316", // → --estado-alerta
  "#1baf7a", "#4ade80", "#10b981", "#22c55e", // → --estado-ok
  "#2a78d6", "#22d3ee", // → --estado-info
  "#a3a3a3", "#6b7280", "#9aa4b2", // → --color-muted-foreground
];

function archivosTsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) archivosTsx(p, acc);
    // Los .test.tsx quedan afuera: son fixtures, no superficie.
    else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) acc.push(p);
  }
  return acc;
}

describe("colores de estado", () => {
  it("nadie escribe a mano un color que ya tiene token", () => {
    const infractores: string[] = [];
    for (const abs of archivosTsx(SRC)) {
      const rel = abs.slice(SRC.length + 1).replace(/\\/g, "/");
      if (PERMITIDOS.includes(rel)) continue;
      const src = readFileSync(abs, "utf8").toLowerCase();
      const usados = CON_TOKEN.filter((h) => src.includes(h));
      if (usados.length > 0) infractores.push(`${rel}: ${usados.join(", ")}`);
    }
    expect(
      infractores,
      "Estos archivos escriben a mano un color que ya tiene token semántico " +
        "(--estado-critico / --estado-alerta / --estado-ok / --estado-info / --color-muted-foreground):\n" +
        infractores.map((f) => `  · ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("el color de un proyecto sin elegir es UNO solo en todo el panel", () => {
    // Dos fallbacks distintos para el mismo concepto hacen que el mismo
    // proyecto se vea de dos colores según la pantalla.
    //
    // Sólo se mira `backgroundColor`, o sea lo que PINTA. Un selector de color
    // (`<input type="color">`, `<ColorPicker currentColor=…>`) necesita un hex
    // literal y un `var()` lo rompe sin avisar: ahí el hex es correcto.
    const conFallbackSuelto: string[] = [];
    for (const abs of archivosTsx(SRC)) {
      const src = readFileSync(abs, "utf8");
      if (/backgroundColor:\s*[^,}]*?(\?\?|\|\|)\s*"#[0-9a-fA-F]{6}"/.test(src)) {
        conFallbackSuelto.push(abs.slice(SRC.length + 1).replace(/\\/g, "/"));
      }
    }
    expect(
      conFallbackSuelto,
      `Usá COLOR_SIN_ELEGIR de lib/colores en vez de un hex suelto como fallback:\n` +
        conFallbackSuelto.map((f) => `  · ${f}`).join("\n"),
    ).toEqual([]);
  });
});
