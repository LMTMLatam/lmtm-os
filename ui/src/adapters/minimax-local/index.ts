// LMTM-OS: minimax_local UI adapter module.
// Uses the generic schema-driven form (SchemaConfigFields) so the form
// renders from the agentConfigurationDoc automatically. This means no
// custom React components need to be written — the fields just work.

import type { UIAdapterModule } from "../types";
import { parseMinimaxStdoutLine, buildMinimaxConfig } from "@paperclipai/adapter-minimax-local/ui";
import { SchemaConfigFields, buildSchemaAdapterConfig } from "../schema-config-fields";

export const minimaxLocalUIAdapter: UIAdapterModule = {
  type: "minimax_local",
  label: "MiniMax M3 (LMTM-OS)",
  parseStdoutLine: parseMinimaxStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: (values) => {
    return {
      ...buildSchemaAdapterConfig(values),
      ...buildMinimaxConfig(values),
    };
  },
};
