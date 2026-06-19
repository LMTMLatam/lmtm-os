// LMTM-OS: MiniMax M3 first-class adapter.
// Adapter that talks directly to the MiniMax chat-completion API. Unlike
// claude_local (which spawns a local `claude` CLI subprocess) or
// opencode_local (provider router), this adapter is a thin HTTP wrapper
// that gives the agent: full session resume, function calling for tools,
// skill materialization, and bearer auth via PAPERCLIP_API_KEY.

import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "minimax_local";
export const label = "MiniMax M3 (LMTM-OS default)";

// NOTE: MiniMax-M3 has NO "-highspeed" variant on the API (verified via
// GET /v1/models). Listing or selecting "MiniMax-M3-highspeed" makes MiniMax
// reject the whole request with 2013 "unknown model". Only offer real ids.
export const models = [
  { id: "MiniMax-M3", label: "MiniMax M3 (default)" },
  { id: "MiniMax-M2.7", label: "MiniMax M2.7" },
  { id: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 (highspeed)" },
  { id: "MiniMax-M2.5", label: "MiniMax M2.5" },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [
  {
    key: "cheap",
    label: "Economico",
    // MiniMax-M3 has no highspeed variant, so the "cheap" profile also runs on
    // M3 (unified). It exists so corrective wakes / retries resolve to a valid
    // model instead of the non-existent "MiniMax-M3-highspeed" (which 2013'd).
    description: "Mantiene MiniMax-M3 (no existe un M3 highspeed en la API).",
    adapterConfig: {
      model: "MiniMax-M3",
    },
    source: "adapter_default",
  },
];

export const agentConfigurationDoc = `# minimax_local agent configuration

Adapter: minimax_local (LMTM-OS default)

Use when:
- Queres que un agente corra con MiniMax M3 directamente via HTTP (sin spawn de proceso local).
- Necesitas session resume, function calling, skill sync, y JWT auth.
- Caso de uso tipico: los 14 agentes LMTM (CMO, Paid Media, Content, etc.).

Core fields:
- model (string, opcional): default "MiniMax-M3". Tambien: "MiniMax-M2.7", "MiniMax-M2.7-highspeed", etc. (NO existe "MiniMax-M3-highspeed").
- systemPrompt (string, opcional): prompt de sistema que se antepone a cada run
- temperature (number, opcional, default 0.7)
- maxTokens (number, opcional, default 4096)
- topP (number, opcional, default 0.95)
- apiKey (string, opcional): override por agente; default = MINIMAX_API_KEY env
- baseUrl (string, opcional): default "https://api.minimaxi.chat/v1"
- timeoutMs (number, opcional, default 90000)
- maxConversationMessages (number, opcional, default 50): tope de historial para session resume
- skillDirectory (string, opcional): donde se materializan las skills. Default = ~/.minimax/skills

Session model:
- El adapter guarda el historial completo de mensajes en el campo sessionParams del
  heartbeat_run. En cada wake, re-envia todo el historial (recortado a
  maxConversationMessages). Esto es equivalente a un "session resume" en adapters
  que tienen sesion nativa.

Function calling:
- Habilitado por default. El adapter parsea tool_calls del response y los pasa al
  Paperclip runtime via ctx.onLog. Las tools se declaran via ctx.context.tools.

Operacional:
- No spawna proceso (es HTTP directo). El timeout es por-request, no por-turno.
- Si la API key esta mal, el adapter retorna exitCode=1 con errorCode="minimax_unauthorized".
- Si el modelo no existe, retorna errorCode="minimax_model_not_found".
`;
