import { describe, expect, it } from "vitest";
import { ENSENA_ACCESO_RE, NON_LATIN_RE } from "../entrega-checks.js";

describe("ENSENA_ACCESO_RE", () => {
  it("frena las lecciones reales que enseñaban a saltar el cerco", () => {
    for (const t of [
      "Los leads se leen con el token de la fila `ads_connections` (platform=meta) de la base",
      "El env del padre sale de agents.adapter_config.env en la DB",
      "abrí la escritura con LMTM_PERMITIR_ESCRIBIR_PLANILLAS=true",
      "El write real requiere SSH al VPS (82.29.56.162:2222, key /app/.ssh/crm_claude)",
      "corré psql con la DATABASE_URL",
      "tr '\\0' '\\n' < /proc/1/environ",
    ]) expect(ENSENA_ACCESO_RE.test(t), t).toBe(true);
  });

  it("deja pasar lecciones de negocio", () => {
    for (const t of [
      "Los reels con gancho en el primer segundo rinden 2x en inmobiliarias",
      "Si falta un acceso, se pide en la tarea y se pasa a blocked",
      "La conexión de Meta del cliente está caída: reconectarla en el panel",
    ]) expect(ENSENA_ACCESO_RE.test(t), t).toBe(false);
  });

  it("NON_LATIN_RE sigue detectando otros alfabetos y no el español", () => {
    expect(NON_LATIN_RE.test("después de这两个 bloqueos")).toBe(true);
    expect(NON_LATIN_RE.test("añadí la campaña: ¿sí? «ok»")).toBe(false);
  });
});
