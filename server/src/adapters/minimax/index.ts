import type { ServerAdapterModule } from "../types.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { models } from "./models.js";

export const minimaxAdapter: ServerAdapterModule = {
  type: "minimax_cloud",
  execute,
  testEnvironment,
  models,
  supportsLocalAgentJwt: false,
  supportsInstructionsBundle: false,
  requiresMaterializedRuntimeSkills: false,
  agentConfigurationDoc: `# minimax_cloud agent configuration

Adapter: minimax_cloud

Use when:
- You want an agent run to be a single MiniMax chat-completion call.
- You need lightweight LLM-backed agents (marketing copy, summarization,
  one-shot classifications) without spawning a local coding-CLI process.

Core fields:
- model (string, optional): MiniMax model id (default: $MINIMAX_MODEL or MiniMax-Text-01)
- systemPrompt (string, optional): system message prepended to every run
- userPrompt (string, optional): user message; falls back to ctx.context when empty
- prompt (string, optional): legacy alias for userPrompt
- temperature (number, optional, default 0.7)
- maxTokens (number, optional, default 1024)
- apiKey (string, optional): per-agent override; default is MINIMAX_API_KEY env
- baseUrl (string, optional): MiniMax endpoint base; default $MINIMAX_BASE_URL
- timeoutMs (number, optional, default 60000)

The adapter calls POST {baseUrl}/text/chatcompletion_v2 with Bearer auth.
The first choice's message.content is emitted via ctx.onLog and used as the
run summary.
`,
};
