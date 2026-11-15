// Plan 15/11, fase 4: una herramienta que existe en el servidor y no en el MCP (o al
// revés) es invisible para los agentes y para Claude. Pasó 3 veces (cadena de
// publicación, Google Ads, NAS) y otra con get_validacion_redes. Este test lo frena.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HERRAMIENTAS_EQUIPO } from "../routes/conector-mcp.js";

const raiz = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const tools = leer("packages/mcp-server/src/tools.ts");
const rest = leer("server/src/routes/agent-tools.ts");
const video = leer("server/src/services/video-agente.ts");

const unicos = (xs: string[]) => [...new Set(xs)].sort();
const wrappers = unicos([...tools.matchAll(/tool:\s*"([a-z_.]+)"/g)].map((m) => m[1]!));
const nombresMcp = unicos([...tools.matchAll(/makeTool\(\s*"([A-Za-z]+)"/g)].map((m) => m[1]!));
const enRest = unicos([...rest.matchAll(/(?<!\.)\btool === "([a-z_]+)"/g)].map((m) => m[1]!));
const enVideo = unicos([...video.matchAll(/def\("([a-z_]+)",\s*"/g)].map((m) => m[1]!));

/** Las que a propósito no tienen herramienta propia en el MCP (van por otra o son internas). */
const INTERNAS = new Set([
  // ClickUp y Sheets: el MCP las expone por lmtmHerramientaAgente; issues por paperclip*.
  "clickup_create_task", "clickup_list_lists", "clickup_list_spaces", "clickup_list_tasks", "clickup_list_workspaces",
  "sheets_append", "sheets_read", "get_issue", "post_comment", "set_issue_status",
  // Las arma lmtmWebHosting según los parámetros; video_variedad la llama armar.mjs.
  "get_web_archivos", "get_web_hosting", "video_variedad",
]);

describe("herramientas visibles (MCP ↔ servidor)", () => {
  it("todo wrapper del MCP llama a una herramienta que existe en el servidor", () => {
    const faltan = wrappers.filter((w) => !enRest.includes(w) && !enVideo.includes(w) && !/^google\.|^clickup\./.test(w));
    expect(faltan).toEqual([]);
  });
  it("toda herramienta del servidor tiene su entrada en el MCP (o está declarada interna)", () => {
    const sinMcp = unicos([...enRest, ...enVideo]).filter((t) => !wrappers.includes(t) && !INTERNAS.has(t));
    expect(sinMcp).toEqual([]);
  });
  it("el conector del equipo solo lista herramientas que existen", () => {
    expect(HERRAMIENTAS_EQUIPO.filter((h) => !nombresMcp.includes(h))).toEqual([]);
  });
});
