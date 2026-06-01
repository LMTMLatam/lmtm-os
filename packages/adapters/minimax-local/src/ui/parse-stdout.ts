// LMTM-OS: minimax_local stdout parsing for the Paperclip transcript UI.
// M3 returns text content (and possibly reasoning_content) per call. We
// emit them as "assistant" transcript entries. Tool calls come through
// as separate ctx.onLog calls from execute.ts; the transcript engine
// stitches them together.

import type { TranscriptEntry, StdoutLineParser } from "@paperclipai/adapter-utils";

export function parseMinimaxStdout(chunk: string, ts: string): TranscriptEntry[] {
  const lines = chunk.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.map((line) => ({ kind: "stdout" as const, ts, text: line }));
}

// Re-export the signature type for consumers that want a full
// StdoutLineParser-shaped function.
export const parseMinimaxStdoutLine: StdoutLineParser = (line, ts) => [
  { kind: "stdout", ts, text: line },
];
