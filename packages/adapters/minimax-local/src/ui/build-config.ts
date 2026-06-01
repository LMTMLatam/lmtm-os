// LMTM-OS: minimax_local config builder for the Paperclip UI.
// The Paperclip form provides a flat set of CreateConfigValues. We
// surface the M3-specific knobs (model, temperature, maxTokens, topP,
// apiKey, baseUrl, timeoutMs) via the schema-driven ConfigFields
// renderer, which reads the agentConfigurationDoc and produces a form
// from the documented keys. This builder just packages whatever the
// form has into a Record the runtime can consume.

import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildMinimaxConfig(values: CreateConfigValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof values.model === "string" && values.model.length > 0) out.model = values.model;
  return out;
}
