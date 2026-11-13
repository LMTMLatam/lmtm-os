import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FRENO = fileURLToPath(new URL("../../hooks/freno-aprobacion.mjs", import.meta.url));
const CAMPO = "f7103b6e-2d6a-407e-bb99-9d7cfe8d4a6e";
const APROBADO = "f77f08b3-3b6f-4ee0-8d02-3a2d3d6e3dca";
const PENDIENTE = "7248cf74-0cee-41cd-b154-8a8166a708bc";
const TAREA = "https://api.clickup.com/api/v2/task/86ak7kc3n";

function correr(toolInput: Record<string, unknown>) {
  return spawnSync(process.execPath, [FRENO], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: toolInput }),
    encoding: "utf8",
  });
}

describe("freno de la aprobación del cliente", () => {
  it.each([
    ["el archivo de configuración de Caro", { content: `{"campos":{"aprobacion":"${CAMPO}"},"opt":{"aprobado":"${APROBADO}"}}` }],
    ["curl al campo", { command: `curl -X POST ${TAREA}/field/${CAMPO} -H "Authorization: x" -d '{"value":"${APROBADO}"}'` }],
    ["curl con el id en una variable", { command: `curl -s -X POST "${TAREA}/field/$FID" --data '{"value":"${APROBADO}"}'` }],
    [
      "script de Python",
      { command: `python3 - <<'EOF'\nr = urllib.request.Request("${TAREA}/field/" + fid, data=d, method="POST")\nd = {"value": "${APROBADO}"}\nEOF` },
    ],
    [
      "script que busca el campo por nombre",
      { command: `python3 - <<'EOF'\nfid = [f for f in campos if f["name"].startswith("Aprobaci")][0]\nopt = [o for o in opciones if o["name"].strip() == "APROBADO"][0]\nrequests.post("https://api.clickup.com/api/v2/task/1/field/" + fid)\nEOF` },
    ],
    [
      "Apps Script con post en minúscula",
      { content: `UrlFetchApp.fetch("https://api.clickup.com/api/v2/task/1", { method: 'post', payload: "${APROBADO}" })` },
    ],
    [
      "la planilla del cliente",
      { command: `curl -X PUT "https://sheets.googleapis.com/v4/spreadsheets/1/values/K4" -d '{"values":[["APROBADO"]]}'` },
    ],
    ["una edición que agrega la marca", { old_string: "x", new_string: `{"aprobacion":"${CAMPO}","opcion":"${APROBADO}"}` }],
  ])("frena: %s", (_caso, entrada) => {
    const r = correr(entrada);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("lo carga una persona");
  });

  it.each([
    ["leer la tarea", { command: `curl -s -H "Authorization: x" ${TAREA} | python3 -c "print(campos)"` }],
    ["filtrar por la opción sin escribir", { command: `jq '.custom_fields[] | select(.value.id=="${APROBADO}")' tarea.json` }],
    ["volverlo a PENDIENTE", { command: `curl -X POST ${TAREA}/field/${CAMPO} -d '{"value":"${PENDIENTE}"}'` }],
    ["cargar otro campo", { command: `curl -X POST ${TAREA}/field/c4e9cb48 -d '{"value":"texto"}'` }],
    ["un informe que habla de un post aprobado", { content: "En ClickUp el post figura con Aprobación de cliente = APROBADO desde ayer." }],
    ["una edición que saca la marca", { old_string: `{"aprobacion":"${CAMPO}","opcion":"${APROBADO}"}`, new_string: "{}" }],
  ])("deja pasar: %s", (_caso, entrada) => {
    expect(correr(entrada).status).toBe(0);
  });

  const enMake = (tool_name: string, tool_input: Record<string, unknown>) =>
    spawnSync(process.execPath, [FRENO], { input: JSON.stringify({ tool_name, tool_input }), encoding: "utf8" });
  const API = "https://us2.make.com/api/v2";

  it.each([
    ["crear por el MCP", "mcp__make__scenarios_create", { teamId: 228071 }],
    ["borrar por el MCP", "mcp__make__scenarios_delete", { scenarioId: 1 }],
    ["crear un webhook", "mcp__make__hooks_create", {}],
    ["crear por la API", "Bash", { command: `curl -X POST "${API}/scenarios?confirmed=true" -H "Authorization: Token x" -d @bp.json` }],
    ["crear por la API desde node", "Bash", { command: `node -e 'fetch("${API}/scenarios", { method: "POST", body })'` }],
    ["borrar por la API", "Bash", { command: `curl -X DELETE ${API}/scenarios/123` }],
  ])("frena Make: %s", (_caso, herramienta, entrada) => {
    const r = enMake(herramienta, entrada);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("no crean ni borran escenarios");
  });

  it.each([
    ["leer escenarios", "mcp__make__scenarios_list", { teamId: 228071 }],
    ["editar uno existente", "mcp__make__scenarios_update", { scenarioId: 1 }],
    ["prenderlo", "mcp__make__scenarios_activate", { scenarioId: 1 }],
    ["leer por la API", "Bash", { command: `curl -s "${API}/scenarios?teamId=228071"` }],
    ["leer los logs", "Bash", { command: `curl -s ${API}/scenarios/123/logs` }],
  ])("deja pasar Make: %s", (_caso, herramienta, entrada) => {
    expect(enMake(herramienta, entrada).status).toBe(0);
  });

  it("si el script se rompe no frena a la flota", () => {
    const r = spawnSync(process.execPath, [FRENO], { input: "esto no es JSON", encoding: "utf8" });
    expect(r.status).toBe(1);
  });
});
