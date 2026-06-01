// LMTM-OS: minimax_local CLI exports.
// Used by the `paperclipai` CLI for local probes (e.g. "did this run
// succeed?"). Currently a stub: the adapter is HTTP-only, so there's
// no local binary to inspect.

export const formatMinimaxEvent = (event: unknown): string => {
  if (typeof event === "string") return event;
  return JSON.stringify(event);
};
