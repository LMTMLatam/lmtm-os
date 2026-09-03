// LMTM-OS: modo consulta / modo acción por agente (idea prestada de AndrIA, 27/8/26).
//
// PARA QUÉ SIRVE
// Hasta ahora `GET /api/agent-tools` le devolvía TODAS las herramientas a todos
// los agentes: no había forma de decir "este agente solo mira". La capacidad de
// limitar ya existía a nivel de qué tools registra cada plugin, pero no se podía
// CONTAR EN UNA FRASE, y eso es justo lo que hace falta para poder garantizarle
// algo a un cliente. Una lista de veinte tools MCP habilitadas no es una
// garantía; "este agente solo lee" sí.
//
//   consulta → lee datos: brain del cliente, métricas, calendario, issues.
//   accion   → además escribe: comenta, crea tareas, manda mensajes, pausa pauta.
//
// El default es "accion", así la flota actual no cambia de comportamiento: esto
// solo aplica al agente al que alguien le ponga el modo explícitamente.
//
// CRITERIO DE CLASIFICACIÓN
// Las tools core están enumeradas una por una acá abajo — son pocas y estables,
// y una lista explícita se lee mejor que una regla. Las de plugin son dinámicas
// y no las conocemos de antemano, así que ahí se aplica una heurística de
// prefijo. Si ni el listado ni el prefijo alcanzan, se asume ACCIÓN: ante la
// duda un agente en modo consulta no la puede usar. Falla del lado seguro.

export type ModoAgente = "consulta" | "accion";

export const MODO_POR_DEFECTO: ModoAgente = "accion";

/**
 * Tools core que solo leen. Todo lo que NO esté acá es acción.
 * Al agregar una tool nueva a agent-tools.ts hay que sumarla acá si solo lee;
 * si te olvidás, queda como acción, que es el lado seguro del error.
 */
export const TOOLS_DE_CONSULTA: ReadonlySet<string> = new Set([
  // issues
  "get_issue",
  // clientes y su inteligencia
  "list_clients",
  "get_client_brain",
  "get_client_competitors",
  "get_client_ads_performance",
  "get_client_scores",
  "get_client_balance",
  "get_client_organic_posts",
  "get_client_scheduled_content",
  "get_client_marketing_plan",
  "get_client_content_matrix",
  "get_client_video_tasks",
  "portfolio_snapshot",
  // conocimiento compartido
  "search_hooks",
  "get_niche_intel",
  "get_team_lessons",
  "list_deliverables",
  "list_licitaciones",
  // equipo
  "get_team_status",
  "get_agent_cards",
  // herramientas externas, solo lectura
  "clickup_list_workspaces",
  "clickup_list_spaces",
  "clickup_list_lists",
  "clickup_list_tasks",
  "sheets_read",
]);

/** Prefijos de solo lectura para las tools de plugin, que son dinámicas. */
const PREFIJOS_DE_LECTURA = ["get_", "list_", "search_", "read_", "fetch_", "describe_", "show_", "query_"];

/**
 * ¿Esta tool escribe o actúa sobre algo de afuera?
 * Ante la duda devuelve true: en modo consulta se bloquea lo desconocido.
 */
export function esDeAccion(tool: string): boolean {
  const nombre = String(tool ?? "").trim();
  if (!nombre) return true;
  if (TOOLS_DE_CONSULTA.has(nombre)) return false;
  // Las de plugin no están en la lista: se decide por prefijo.
  const sinNamespace = nombre.includes(".") ? nombre.slice(nombre.lastIndexOf(".") + 1) : nombre;
  return !PREFIJOS_DE_LECTURA.some((p) => sinNamespace.startsWith(p));
}

/** Lee el modo de los permisos ya normalizados del agente. */
export function modoDeAgente(permissions: unknown): ModoAgente {
  if (typeof permissions !== "object" || permissions === null) return MODO_POR_DEFECTO;
  const modo = (permissions as Record<string, unknown>).modo;
  return modo === "consulta" ? "consulta" : MODO_POR_DEFECTO;
}

/** ¿Puede este agente correr esta tool? */
export function puedeUsar(modo: ModoAgente, tool: string): boolean {
  return modo === "accion" || !esDeAccion(tool);
}

/**
 * Mensaje para el modelo cuando la tool queda bloqueada. Le explica qué pasó y
 * qué hacer en su lugar, para que no se quede reintentando la misma llamada.
 */
export function mensajeDeBloqueo(tool: string): string {
  return (
    `La herramienta "${tool}" escribe o manda algo hacia afuera, y este agente está en modo consulta: ` +
    `solo puede leer. Dejá el resultado de tu análisis en el texto de tu respuesta y que una persona decida.`
  );
}
