// LMTM-OS: minimax_local server-side exports.

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { listMinimaxModels } from "./models.js";
export { listMinimaxSkills, syncMinimaxSkills } from "./skills.js";
export {
  parseMinimaxCompletion,
  describeMinimaxFailure,
} from "./parse.js";

import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// Session codec: each session is identified by a UUID we generate on the
// first call. We keep the full conversation history inside the session
// params (under `messages`) so the next run can re-send it. This is the
// standard stateless-resume pattern for HTTP chat-completion APIs.
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const sessionId = readString(record.sessionId) ?? readString(record.session_id);
    if (!sessionId) return null;
    const messages = Array.isArray(record.messages) ? record.messages : null;
    const summary = readString(record.summary) ?? readString(record.lastSummary);
    return {
      sessionId,
      ...(messages ? { messages } : {}),
      ...(summary ? { summary } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sessionId = readString(params.sessionId) ?? readString(params.session_id);
    if (!sessionId) return null;
    const messages = Array.isArray(params.messages) ? params.messages : null;
    const summary = readString(params.summary) ?? readString(params.lastSummary);
    return {
      sessionId,
      ...(messages ? { messages } : {}),
      ...(summary ? { summary } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return readString(params.sessionId) ?? readString(params.session_id);
  },
};
