import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { combinar, guardarRevision, lineaDeRevision, parsearRevision, revisionParaPieza, revisionVigente } from "../calidad-piezas.js";
import { esDeContenido, veredictosDePiezas } from "../guia-contenido.js";

describe("parsearRevision", () => {
  it("lee el JSON del modelo aunque venga con texto alrededor", () => {
    const r = parsearRevision('ok: {"apto": true, "nivel": 4, "problemas": []} listo');
    expect(r).toMatchObject({ apto: true, nivel: 4, problemas: [] });
  });
  it("una pieza de nivel 1 o 2 no es apta aunque el modelo diga que sí (caso BRACHETTA)", () => {
    expect(parsearRevision('{"apto": true, "nivel": 2, "problemas": []}')?.apto).toBe(false);
  });
  it("sin nivel respeta el apto del modelo", () => {
    expect(parsearRevision('{"apto": true, "problemas": []}')).toMatchObject({ apto: true, nivel: null });
  });
  it("devuelve null si no hay veredicto legible", () => {
    expect(parsearRevision("no pude mirar las imágenes")).toBeNull();
    expect(parsearRevision('{"problemas": []}')).toBeNull();
  });
  it("descarta problemas vacíos y guarda placa/segundo", () => {
    const r = parsearRevision('{"apto": false, "nivel": 2, "problemas": [{"placa": 1, "que": "no se ve el producto"}, {"que": ""}]}');
    expect(r?.problemas).toEqual([{ placa: 1, que: "no se ve el producto" }]);
  });
});

describe("revisionVigente", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "calidad-"));
  const a = path.join(dir, "slide-01.png");
  const b = path.join(dir, "slide-02.png");
  fs.writeFileSync(a, "x");
  fs.writeFileSync(b, "y");

  it("sin revisión no hay control", () => {
    expect(revisionVigente([a, b])).toBeNull();
  });
  it("con revisión de todos los archivos, la combina", () => {
    guardarRevision([a, b], { apto: true, nivel: 4, problemas: [], fecha: new Date().toISOString() });
    expect(revisionVigente([a, b])).toMatchObject({ apto: true, nivel: 4 });
  });
  it("si un archivo cambió después de revisarlo, la revisión vence", () => {
    const futuro = new Date(Date.now() + 60_000);
    fs.utimesSync(b, futuro, futuro);
    expect(revisionVigente([a, b])).toBeNull();
  });
  it("si falta la de un archivo, no hay control", () => {
    const c = path.join(dir, "slide-03.png");
    fs.writeFileSync(c, "z");
    expect(revisionVigente([a, c])).toBeNull();
  });
});

describe("combinar y textos", () => {
  it("apta solo si todas lo son, con el nivel más bajo y sin problemas repetidos", () => {
    const f = new Date().toISOString();
    const r = combinar([
      { apto: true, nivel: 4, problemas: [], fecha: f },
      { apto: false, nivel: 2, problemas: [{ que: "lienzo vacío" }, { que: "lienzo vacío" }], fecha: f },
    ]);
    expect(r).toMatchObject({ apto: false, nivel: 2 });
    expect(r.problemas).toHaveLength(1);
  });
  it("la línea para la tarea dice si pasó o no", () => {
    const f = new Date().toISOString();
    expect(lineaDeRevision({ apto: true, nivel: 4, problemas: [], fecha: f })).toMatch(/Pasó el control/);
    expect(lineaDeRevision({ apto: false, nivel: 2, problemas: [{ que: "no se ve la batería" }], fecha: f })).toMatch(/NO pasó.*batería/);
    expect(lineaDeRevision(null, "OpenAI caído")).toMatch(/SIN control.*OpenAI/);
  });
  it("lo que se guarda en la pieza", () => {
    expect(revisionParaPieza(null, "OpenAI caído")).toEqual({ apto: null, sinRevision: "OpenAI caído" });
  });
});

describe("veredictos en la guía de contenido", () => {
  const mem = [
    { kind: "preference", key: "pieza-veredicto:1", content: "Pieza que SÍ sirvió: buen precio grande.", updatedAt: "2026-11-15" },
    { kind: "preference", key: "pieza-veredicto:2", content: "Pieza que NO sirvió: no se veía la batería.", updatedAt: "2026-11-14" },
    { kind: "fact", key: "rubro", content: "Baterías", updatedAt: "2026-11-01" },
  ];
  it("trae los veredictos con los NO primero", () => {
    const l = veredictosDePiezas(mem);
    expect(l[1]).toMatch(/Lo que el equipo dijo/);
    expect(l[2]).toMatch(/NO sirvió/);
    expect(l).toHaveLength(4);
  });
  it("no compiten con el resto de la memoria de contenido", () => {
    expect(esDeContenido(mem[1]!)).toBe(false);
    expect(esDeContenido(mem[2]!)).toBe(true);
  });
  it("sin veredictos no agrega nada", () => {
    expect(veredictosDePiezas([mem[2]!])).toEqual([]);
  });
});
