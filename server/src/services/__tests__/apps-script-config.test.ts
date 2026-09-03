// inyectarConfig es lo que corre en cada onboarding: si deja una config a
// medias, el cliente nuevo nace sin sincronizar y nadie se entera (el script
// se traga el error y la corrida figura COMPLETED igual).
import { describe, expect, it } from "vitest";
import { inyectarConfig, type ConfigScript } from "../apps-script-config.js";

const PLANTILLA = `
/* CONFIG GENERADA */
const COLUMNS = {};
const FIELD_IDS = {};
const FIELD_KINDS = {};
const OPTIONS_MAP = {};
const KEYS_DD = [];
const KEYS_LABELS = [];
const KEYS_DATE = [];
const NO_BORRAR = [];
function build(row){
  Object.keys(FIELD_IDS).forEach(k => { if (FIELD_KINDS[k] !== "text") return; });
  KEYS_DD.forEach(k => row[COLUMNS[k] - 1]);
}
`;

const CFG: ConfigScript = {
  columns: { NOMBRE: 1, COPY_OY_SUBTITULO: 5, PLATAFORMAS: 10, DIA_DE_PUBLICACION: 8, TASK_ID: 29 },
  fieldIds: { COPY_OY_SUBTITULO: "campo-copy", PLATAFORMAS: "campo-plat", MES_DE_PUBLICACION: "campo-mes", DIA_DE_PUBLICACION: "campo-dia" },
  fieldKinds: { COPY_OY_SUBTITULO: "text", PLATAFORMAS: "labels", MES_DE_PUBLICACION: "dd", DIA_DE_PUBLICACION: "date" },
  optionsMap: { PLATAFORMAS: { Instagram: "op-ig" }, MES_DE_PUBLICACION: { AGOSTO: "op-ago" } },
  avisos: [],
};

describe("inyectarConfig", () => {
  const out = inyectarConfig(PLANTILLA, CFG, "/* cliente X */");

  it("llena las cuatro tablas de config", () => {
    expect(out).toContain('"COPY_OY_SUBTITULO": "campo-copy"');
    expect(out).toContain('"PLATAFORMAS": "labels"');
    expect(out).toContain('"Instagram": "op-ig"');
    expect(out).toContain('"NOMBRE": 1');
  });

  it("deriva KEYS_DD y KEYS_LABELS del tipo real del campo", () => {
    expect(out).toContain('const KEYS_DD = ["MES_DE_PUBLICACION"]');
    expect(out).toContain('const KEYS_LABELS = ["PLATAFORMAS"]');
  });

  it("deja DIA_DE_PUBLICACION fuera de KEYS_DATE (lo arma aparte con el horario)", () => {
    expect(out).toContain("const KEYS_DATE = []");
  });

  it("protege el enlace de publicación, que lo escribe el pipeline de contenido", () => {
    expect(out).toContain('const NO_BORRAR = ["ENLACE_DE_PUBLICACION"]');
  });

  it("reemplaza el marcador por la cabecera del cliente", () => {
    expect(out).toContain("/* cliente X */");
    expect(out).not.toContain("/* CONFIG GENERADA */");
  });

  it("no deja ninguna tabla vacía cuando hay config", () => {
    expect(out).not.toMatch(/const (FIELD_IDS|FIELD_KINDS|COLUMNS) = \{\}/);
  });

  it("sigue siendo JavaScript válido", () => {
    expect(() => new Function(out)).not.toThrow();
  });
});
