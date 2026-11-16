// Lo que protege: la revisión de competencia de un cliente compara a cada competidor contra SU propia cuenta
// (no por cantidad de me gusta) y propone solo ángulos que la competencia usa con éxito y el cliente no tocó.
import { describe, expect, it } from "vitest";
import { compararCompetencia, type PostComp } from "../competencia-cliente.js";

const ahora = new Date("2026-11-16T12:00:00Z");
const post = (fecha: string, engagement: number, angulo: string | null = null, permalink = `https://ig/${fecha}-${engagement}`): PostComp =>
  ({ fecha, angulo, formato: "Reel", engagement, permalink, texto: "x" });
// Lo normal: 8 publicaciones viejas con 100 de interacción.
const historia = Array.from({ length: 8 }, (_, i) => post(`2026-09-${10 + i}`, 100));

describe("compararCompetencia", () => {
  it("mide la mejor publicación contra lo normal de su cuenta y propone el ángulo que el cliente no usó", () => {
    const r = compararCompetencia(
      [{ fecha: "2026-11-10", angulo: "producto" }],
      [
        { nombre: "Grande", usuario: "grande", posts: [...historia, post("2026-11-08", 300, "detras_de_escena"), post("2026-11-09", 90, "producto")] },
        { nombre: "Chico", usuario: "chico", posts: [...historia.map((p) => ({ ...p, engagement: 10 })), post("2026-11-07", 25, "detras_de_escena")] },
        { nombre: "Sin Instagram", usuario: null, posts: [] },
      ],
      14, ahora,
    );
    expect(r.cliente.publicaciones).toBe(1);
    const grande = r.competidores.find((c) => c.nombre === "Grande")!;
    expect(grande.publicaciones).toBe(2);
    expect(grande.normal).toBe(100);
    expect(grande.mejor?.indice).toBe(3);
    // El chico rindió 2,5× su normal con el mismo ángulo: cuenta igual que el grande.
    expect(r.competidores.find((c) => c.nombre === "Chico")!.mejor?.indice).toBe(2.5);
    expect(r.oportunidades.map((o) => o.angulo)).toEqual(["detras_de_escena"]);
    expect(r.oportunidades[0].competidores).toBe(2);
    // «producto» lo usa el cliente: no es oportunidad.
    expect(r.oportunidades.some((o) => o.angulo === "producto")).toBe(false);
    expect(r.sinDatos).toEqual(["Sin Instagram"]);
  });

  it("sin redes sincronizadas del cliente dice «sin dato» (null), no 0", () => {
    const r = compararCompetencia(null, [{ nombre: "X", usuario: "x", posts: [...historia, post("2026-11-08", 300, "humor")] }], 14, ahora);
    expect(r.cliente.publicaciones).toBeNull();
  });

  it("un competidor que es cliente de la agencia queda marcado y no aporta el link de ejemplo; «sin-texto» no es un ángulo", () => {
    const r = compararCompetencia([], [
      { nombre: "Otro cliente", usuario: "otro", esClienteDeLaAgencia: true, posts: [...historia, post("2026-11-08", 500, "humor", "https://ig/otro")] },
      { nombre: "Ajeno", usuario: "ajeno", posts: [...historia, post("2026-11-08", 200, "humor", "https://ig/ajeno"), post("2026-11-09", 900, "sin-texto")] },
    ], 14, ahora);
    expect(r.competidores.find((c) => c.nombre === "Otro cliente")!.esClienteDeLaAgencia).toBe(true);
    expect(r.oportunidades.find((o) => o.angulo === "humor")!.ejemplo).toBe("https://ig/ajeno");
    expect(r.oportunidades.some((o) => o.angulo === "sin-texto")).toBe(false);
  });

  it("sin historia suficiente no inventa un índice", () => {
    const r = compararCompetencia([], [{ nombre: "Nuevo", usuario: "nuevo", posts: [post("2026-11-10", 50, "humor")] }], 14, ahora);
    expect(r.competidores[0].normal).toBeNull();
    expect(r.competidores[0].mejor?.indice).toBeNull();
    expect(r.oportunidades).toEqual([]);
  });
});
