// Las tres fugas que llevaron una inmobiliaria a las sugerencias de Distrillantas.
import { describe, expect, it } from "vitest";
import { mencionesDeOtrosClientes, patronesDeClientes, resumenContaminacion } from "../contaminacion.js";
import { nacioConLaCarpeta, normalizarNombre, sinPlantilla } from "../plantilla-clickup.js";
import { aplicaAlRubro, efemeridesProximasPorRubro } from "../../services/efemerides.js";

describe("efemérides por rubro", () => {
  const corredor = ["inmobiliaria", "desarrollador"];

  it("el Día del Corredor Inmobiliario no le toca a una gomería ni a un hotel", () => {
    expect(aplicaAlRubro(corredor, "Gomeria")).toBe(false);
    expect(aplicaAlRubro(corredor, "turismo-hoteleria")).toBe(false);
    expect(aplicaAlRubro(corredor, "inmobiliaria")).toBe(true);
  });

  it("EL BUG: sin rubro cargado no aplica ninguna de nicho (antes aplicaban todas)", () => {
    expect(aplicaAlRubro(corredor, null)).toBe(false);
    expect(aplicaAlRubro(corredor, "")).toBe(false);
    expect(aplicaAlRubro(corredor, "  ")).toBe(false);
  });

  it("las genéricas aplican a todos", () => {
    expect(aplicaAlRubro(undefined, "Gomeria")).toBe(true);
    expect(aplicaAlRubro([], null)).toBe(true);
  });

  it("del 20 al 30 de septiembre una gomería ve la Primavera y no al corredor inmobiliario", () => {
    const nombres = efemeridesProximasPorRubro("Gomeria", 10, new Date("2026-09-20T12:00:00Z")).map((e) => e.name);
    expect(nombres).toContain("Día del Estudiante / Primavera");
    expect(nombres).not.toContain("Día del Corredor Inmobiliario");
  });
});

describe("contenido de la plantilla de ClickUp", () => {
  const INMOB = "90133651765";
  const NATURAL = "90134249666";
  const plantilla = new Map([
    [normalizarNombre("1. Incrementar el número de propiedades captadas"), INMOB],
    [normalizarNombre("De la tierra a tu hogar: los ingredientes naturales que hacen la diferencia"), NATURAL],
  ]);
  const distrillantas = [
    "1. Incrementar el número de propiedades captadas",
    "de la tierra a tu hogar: los ingredientes  naturales que hacen la diferencia",
    "5 señales visuales en tus neumáticos que te piden atención urgente",
  ];

  it("en la carpeta de Distrillantas se queda solo lo suyo (sin importar mayúsculas, acentos ni espacios)", () => {
    expect(sinPlantilla(distrillantas, (n) => n, plantilla, "901318531250"))
      .toEqual(["5 señales visuales en tus neumáticos que te piden atención urgente"]);
  });

  it("Cliente Natural leyendo SUS posteos no pierde nada: para él es contenido real", () => {
    const propios = ["De la tierra a tu hogar: los ingredientes naturales que hacen la diferencia"];
    expect(sinPlantilla(propios, (n) => n, plantilla, NATURAL)).toEqual(propios);
  });

  it("sin mapa de plantilla (ClickUp caído) no se corta nada", () => {
    expect(sinPlantilla(distrillantas, (n) => n, new Map(), "x")).toHaveLength(3);
  });
});

describe("lo que nació con la carpeta (la copia)", () => {
  // Randstad, fechas reales de ClickUp: OnBoarding y la idea de Cliente Natural.
  const nacimiento = 1787797610831;

  it("una idea creada 6 minutos después de nacer la carpeta vino en la copia", () => {
    expect(nacioConLaCarpeta(1787797978655, nacimiento)).toBe(true);
  });

  it("lo que llega horas después es del cliente", () => {
    expect(nacioConLaCarpeta(nacimiento + 3 * 3600_000, nacimiento)).toBe(false);
  });

  it("sin fecha de nacimiento o de la tarea no se descarta nada", () => {
    expect(nacioConLaCarpeta(1787797978655, null)).toBe(false);
    expect(nacioConLaCarpeta(null, nacimiento)).toBe(false);
  });
});

describe("menciones de otros clientes", () => {
  const clientes = [
    { id: "d", nombre: "Distrillantas" },
    { id: "n", nombre: "Cliente Natural" },
    { id: "ma", nombre: "MA DESARROLLOS" },
    { id: "c", nombre: "CANNES" },
    { id: "r", nombre: "RENO" },
    { id: "l", nombre: "LMTM" },
  ];
  const patrones = patronesDeClientes(clientes);

  it("detecta el nombre de otro cliente como palabra completa", () => {
    expect(mencionesDeOtrosClientes("Copiar el formato de Cliente Natural", clientes[0], patrones)).toEqual(["Cliente Natural"]);
    expect(mencionesDeOtrosClientes("Hay que renovar las piezas", clientes[0], patrones)).toEqual([]); // "RENO" dentro de "renovar" no cuenta
  });

  it("nombrarse a sí mismo o a la agencia no es contaminación", () => {
    expect(mencionesDeOtrosClientes("Distrillantas con el equipo de LMTM", clientes[0], patrones)).toEqual([]);
  });

  it("los del mismo grupo se pueden nombrar: el proyecto Cannes de MA DESARROLLOS", () => {
    expect(mencionesDeOtrosClientes("Vecino inversor del proyecto Cannes", clientes[2], patrones)).toEqual([]);
  });

  it("el resumen dice cuántos casos y los pares más repetidos", () => {
    const t = resumenContaminacion([
      { tabla: "client_memory", clientId: "d", cliente: "Distrillantas", mencionados: ["Cliente Natural"], extracto: "" },
      { tabla: "content_ideas", clientId: "d", cliente: "Distrillantas", mencionados: ["Cliente Natural"], extracto: "" },
    ]);
    expect(t).toContain("2 casos");
    expect(t).toContain("Distrillantas → Cliente Natural (2)");
    expect(resumenContaminacion([])).toBeNull();
  });
});
