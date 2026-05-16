#!/usr/bin/env node
import { runServer } from "./index.js";

void runServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("lmtm-mcp-supabase failed:", error);
  process.exit(1);
});
