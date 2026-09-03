// Cada caso "rechaza" es una regresión real encontrada en la auditoría del
// 25/8/26. Si alguno pasa a estar permitido, un cliente deja de sincronizar.
import { describe, expect, it } from "vitest";
import { validarAppsScript, type ScriptFile } from "../apps-script-guard.js";

const MANIFEST: ScriptFile = {
  name: "appsscript",
  type: "JSON",
  source: '{"timeZone":"America/Argentina/Buenos_Aires","runtimeVersion":"V8"}',
};

/** Un script sano, con la forma que quedó después de la auditoría. */
const SANO = `
const PROJECTS_TO_SYNC = [{ projectName: "X", clickUpListId: "1", spreadsheetId: "2", sheetName: "Cronopost" }];
const COLUMNS = { NOMBRE: 1, TASK_ID: 29 };
const FIELD_IDS = { COPY: "abc" };
const FIELD_KINDS = { COPY: "text" };
const OPTIONS_MAP = {};
const KEYS_DD = [];
const KEYS_LABELS = [];
const NO_BORRAR = ["ENLACE_DE_PUBLICACION"];

function setCustomField_(taskId, fieldId, value){
  const url = \`https://api.clickup.com/api/v2/task/\${taskId}/field/\${fieldId}\`;
  return fetchWithBackoff_(url, { method: "post", payload: JSON.stringify({ value }) }, 4);
}
function build(row){
  Object.keys(FIELD_IDS).forEach(k => {
    if (!FIELD_IDS[k] || FIELD_KINDS[k] !== "text") return;
    if (NO_BORRAR.indexOf(k) < 0) push({ id: FIELD_IDS[k], value: null });
  });
  KEYS_DD.forEach(k => mapToOptionId_(k, row[COLUMNS[k] - 1]));
}
function syncCronoCreateThenUpdate(){ for (const p of PROJECTS_TO_SYNC) build(p); }
`;

const sano = (): ScriptFile[] => [MANIFEST, { name: "Código", type: "SERVER_JS", source: SANO }];
const con = (source: string): ScriptFile[] => [MANIFEST, { name: "Código", type: "SERVER_JS", source }];

describe("validarAppsScript", () => {
  it("acepta un script sano", () => {
    expect(validarAppsScript(sano(), sano())).toEqual([]);
  });

  it("acepta un proyecto nuevo (sin versión anterior)", () => {
    expect(validarAppsScript(sano(), [])).toEqual([]);
  });

  it("rechaza si falta el manifest", () => {
    const v = validarAppsScript([{ name: "Código", type: "SERVER_JS", source: SANO }], sano());
    expect(v.map((x) => x.regla)).toContain("manifest");
  });

  it("rechaza código que no compila", () => {
    const v = validarAppsScript(con("function roto( { "), []);
    expect(v.map((x) => x.regla)).toContain("sintaxis");
  });

  it("rechaza un manifest que no es JSON", () => {
    const v = validarAppsScript([{ ...MANIFEST, source: "{no json" }, { name: "Código", type: "SERVER_JS", source: SANO }], []);
    expect(v.map((x) => x.regla)).toContain("sintaxis");
  });

  // Los 59 scripts del pipeline de video: usaban FIELD_IDS sin declararlo.
  it("rechaza usar FIELD_IDS sin declararlo", () => {
    const v = validarAppsScript(con("function f(k){ return FIELD_IDS[k]; }"), []);
    expect(v.map((x) => x.regla)).toContain("config-sin-declarar");
  });

  it("rechaza usar OPTIONS_MAP sin declararlo", () => {
    const v = validarAppsScript(con("function f(k){ return OPTIONS_MAP[k]; }"), []);
    expect(v[0].detalle).toContain("OPTIONS_MAP");
  });

  it("rechaza borrar una config que la versión que corre sí tiene", () => {
    const nuevo = con(SANO.replace(/const OPTIONS_MAP = \{\};/, ""));
    const v = validarAppsScript(nuevo, sano());
    expect(v.map((x) => x.regla)).toContain("config-borrada");
  });

  // Hotel San Bernardo: lo reescribieron y quedó sincronizando sólo el nombre.
  it("rechaza una reescritura que deja de escribir campos personalizados", () => {
    const minificado = con(`
      const PROJECTS_TO_SYNC = [{ projectName: "X", clickUpListId: "1", spreadsheetId: "2", sheetName: "C" }];
      const COLUMNS = { NOMBRE: 1, TASK_ID: 29 };
      function upd(id, nm){ return cuPut(id, { name: nm }); }
      function syncCronoCreateThenUpdate(){ for (const p of PROJECTS_TO_SYNC) upd(p, p.projectName); }
    `);
    const v = validarAppsScript(minificado, sano());
    expect(v.map((x) => x.regla)).toContain("campos-perdidos");
  });

  // SEBASTIAN RAMASCO PADILLA: endpoint bulk inventado, la API responde 405.
  it("rechaza el endpoint bulk POST /task/{id}/field", () => {
    const v = validarAppsScript(
      con("function f(t){ const url = `https://api.clickup.com/api/v2/task/${t}/field`; return url; }"),
      [],
    );
    expect(v.map((x) => x.regla)).toContain("endpoint-inventado");
    expect(v.find((x) => x.regla === "endpoint-inventado")?.detalle).toContain("405");
  });

  it("no confunde el endpoint válido por campo con el bulk", () => {
    const v = validarAppsScript(sano(), []);
    expect(v.map((x) => x.regla)).not.toContain("endpoint-inventado");
  });

  // NUMORPH: custom_fields adentro del PUT, que ClickUp ignora.
  it("rechaza custom_fields dentro del PUT de la tarea", () => {
    const v = validarAppsScript(
      con(`
        const FIELD_IDS = {};
        function upd(taskId, payload){
          clickupUpdateTask_(taskId, Object.assign({}, payload.basePayload, { custom_fields: payload.customFieldsForUpdate }));
        }
      `),
      [],
    );
    expect(v.map((x) => x.regla)).toContain("endpoint-inventado");
  });

  it("permite custom_fields al crear la tarea", () => {
    const crear = con(`
      ${SANO}
      function crear(listId, payload){
        return clickupCreateTask_(listId, Object.assign({}, payload.basePayload, { custom_fields: payload.customFieldsForCreate }));
      }
    `);
    expect(validarAppsScript(crear, [])).toEqual([]);
  });

  it("junta todas las violaciones en vez de cortar en la primera", () => {
    const v = validarAppsScript([{ name: "Código", type: "SERVER_JS", source: "function f(k){ return FIELD_IDS[k] + OPTIONS_MAP[k]; }" }], []);
    expect(v.length).toBeGreaterThanOrEqual(3); // manifest + 2 configs
  });
});
