// LMTM-OS: minimax_local UI exports.
// The Paperclip UI needs to know how to render the adapter's config
// form, how to parse its stdout for the transcript view, and what
// "completeness" the config has.

export { parseMinimaxStdout, parseMinimaxStdoutLine } from "./parse-stdout.js";
export { buildMinimaxConfig } from "./build-config.js";
