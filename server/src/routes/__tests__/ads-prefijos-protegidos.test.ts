// La regla que este test protege: un endpoint nuevo de ads.ts NO puede quedar
// público por olvido.
//
// QUÉ PASÓ EL 5/10/26
// El guard de ese router es una allowlist (`OWNED_PREFIXES`) y el default de lo
// que NO está en la lista es **quedar abierto** — tiene que ser así, porque el
// router está montado en la raíz de /api y ve pedidos de routers hermanos que sí
// son públicos.
//
// El archivo ya avisaba, en un comentario, que un prefijo nuevo hay que sumarlo
// a la lista. No alcanzó: al agregar `/cartera` nadie lo sumó y la cartera
// entera —59 clientes con nombre, inversión y CPL— quedó respondiendo 200 sin
// autenticación. Al ir a arreglarlo aparecieron otros tres iguales de antes.
//
// Un comentario no falla cuando se lo ignora. Este test sí.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FUENTE = readFileSync(join(__dirname, "..", "ads.ts"), "utf8");

/** Los prefijos que el router realmente sirve, leídos de sus propias rutas. */
function prefijosDelRouter(): string[] {
  const rutas = [...FUENTE.matchAll(/router\.(?:get|post|patch|put|delete)\(\s*"(\/[^"]*)"/g)].map((m) => m[1]);
  const prefijos = new Set<string>();
  for (const r of rutas) {
    const primero = r.split("/")[1] ?? "";
    // Un parámetro como primer segmento no define un prefijo propio.
    if (primero && !primero.startsWith(":")) prefijos.add(`/${primero}`);
  }
  return [...prefijos].sort();
}

/** La lista declarada en el guard. */
function prefijosProtegidos(): string[] {
  const bloque = FUENTE.match(/const OWNED_PREFIXES = \[([\s\S]*?)\]/);
  expect(bloque, "no encontré OWNED_PREFIXES en ads.ts").not.toBeNull();
  return [...bloque![1].matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]).sort();
}

describe("ads.ts: ningún endpoint queda público por olvido", () => {
  it("todo prefijo que sirve el router está en OWNED_PREFIXES", () => {
    const sirve = prefijosDelRouter();
    const protegidos = new Set(prefijosProtegidos());
    expect(sirve.length).toBeGreaterThan(3); // el scan encontró el archivo

    const sueltos = sirve.filter((p) => !protegidos.has(p));
    expect(
      sueltos,
      "Estos prefijos de ads.ts responden SIN autenticación porque no están en " +
        "OWNED_PREFIXES. Lo que no está en la lista queda ABIERTO:\n" +
        sueltos.map((p) => `  · ${p}`).join("\n"),
    ).toEqual([]);
  });

  it("el matcheo es por segmento, así que los prefijos parecidos van los dos", () => {
    // "/clients" no cubre "/clients-ads-metrics": el guard compara
    // `path === p || path.startsWith(p + "/")`. Si alguien borra el segundo
    // creyendo que el primero lo incluye, vuelve a filtrar.
    const protegidos = prefijosProtegidos();
    expect(protegidos).toContain("/clients");
    expect(protegidos).toContain("/clients-ads-metrics");
  });

  it("el guard sigue siendo default-deny sobre lo que declara", () => {
    // Si alguien invierte la condición, la lista deja de servir para nada.
    expect(FUENTE).toContain('if (req.actor.type === "none") throw unauthorized');
  });
});
